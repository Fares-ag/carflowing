import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { createApp } from './app.js'
import { startScheduler } from './services/scheduler.js'
import { initObservability } from './utils/observability.js'
import { assertCriticalDbIndexes } from './db/invariants.js'
import { runMigrations } from './db/migrate.js'
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

async function bootBackgroundWork(): Promise<void> {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
    await assertCriticalDbIndexes()
    await initObservability('carflow-api')
    startScheduler()
    return
  }

  let attempt = 0
  for (;;) {
    attempt += 1
    try {
      await runMigrations()
      await assertCriticalDbIndexes()
      await initObservability('carflow-api')
      startScheduler()
      console.log('[boot] ready')
      return
    } catch (err) {
      const delayMs = Math.min(2000 * attempt, 15_000)
      console.error(
        `[boot] database setup failed (attempt ${attempt}); retrying in ${delayMs}ms`,
        err instanceof Error ? err.message : err
      )
      await sleep(delayMs)
    }
  }
}

void bootBackgroundWork()
