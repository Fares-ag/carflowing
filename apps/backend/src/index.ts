import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { createApp } from './app.js'
import { startScheduler, stopScheduler } from './services/scheduler.js'
import { captureException, initObservability } from './utils/observability.js'
import { assertCriticalDbIndexes } from './db/invariants.js'
import { runMigrations } from './db/migrate.js'
import { markBootFailed, markBootReady, markBootStarting } from './utils/bootState.js'
import { logStructured } from './utils/requestContext.js'
import { assertProductionSecrets } from './utils/productionGuards.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })
dotenv.config()

try {
  assertProductionSecrets()
} catch (err) {
  console.error('[boot] production configuration rejected:', err instanceof Error ? err.message : err)
  process.exit(1)
}

// Sentry must be initialized before createApp(): setupSentryExpressErrorHandler
// is a no-op while sentryEnabled is false, so initializing later would leave the
// Express error handler permanently uninstalled.
await initObservability('carflow-api')

// /health answers 503 from here until bootBackgroundWork() finishes.
markBootStarting()

const app = createApp()
const PORT = Number(process.env.PORT) || 3001

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend listening on 0.0.0.0:${PORT}`)
})

server.on('error', (err) => {
  console.error('[boot] listen failed', err)
  process.exit(1)
})

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Bounded so Railway restarts the instance instead of serving it broken. */
function bootMaxAttempts(): number {
  const parsed = Number(process.env.BOOT_MAX_ATTEMPTS)
  if (!Number.isInteger(parsed) || parsed < 1) return 8
  return parsed
}

async function bootBackgroundWork(): Promise<void> {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
    await assertCriticalDbIndexes()
    startScheduler()
    markBootReady()
    return
  }

  const maxAttempts = bootMaxAttempts()
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await runMigrations()
      await assertCriticalDbIndexes()
      startScheduler()
      markBootReady()
      logStructured('info', 'boot.ready', { attempt })
      return
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      captureException(err, { scope: 'boot_background_work', attempt })
      if (attempt === maxAttempts) {
        markBootFailed(message)
        logStructured('error', 'boot.failed', { attempts: attempt, message })
        process.exit(1)
      }
      const delayMs = Math.min(2000 * attempt, 15_000)
      logStructured('warn', 'boot.retry', { attempt, maxAttempts, delayMs, message })
      await sleep(delayMs)
    }
  }
}

/** Bounded drain so Railway's SIGTERM -> SIGKILL window is never hit. */
function shutdownTimeoutMs(): number {
  const parsed = Number(process.env.SHUTDOWN_TIMEOUT_MS)
  if (!Number.isFinite(parsed) || parsed < 1) return 15_000
  return parsed
}

let shuttingDown = false

function shutdown(signal: string, exitCode = 0): void {
  if (shuttingDown) return
  shuttingDown = true
  logStructured('info', 'process.shutdown_started', { signal })
  stopScheduler()

  const timeoutMs = shutdownTimeoutMs()
  const forceTimer = setTimeout(() => {
    logStructured('warn', 'process.shutdown_forced', { signal, timeoutMs })
    process.exit(exitCode)
  }, timeoutMs)
  forceTimer.unref?.()

  // Stops accepting new connections; the callback fires once in-flight
  // requests have finished.
  server.close(() => {
    clearTimeout(forceTimer)
    logStructured('info', 'process.shutdown_complete', { signal })
    process.exit(exitCode)
  })
  // Keep-alive sockets with no request in flight would otherwise hold the
  // close open until the bounded timer fires.
  server.closeIdleConnections()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

process.on('unhandledRejection', (reason) => {
  logStructured('error', 'process.unhandled_rejection', {
    message: reason instanceof Error ? reason.message : String(reason),
  })
  captureException(reason, { scope: 'unhandled_rejection' })
})

process.on('uncaughtException', (err) => {
  logStructured('error', 'process.uncaught_exception', { message: err.message })
  captureException(err, { scope: 'uncaught_exception' })
  markBootFailed(err.message)
  // Process state is undefined after this point: drain, then die so the
  // platform replaces the instance.
  shutdown('uncaughtException', 1)
})

void bootBackgroundWork()
