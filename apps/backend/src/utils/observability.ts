import type { Express } from 'express'
import type { SeverityLevel } from '@sentry/node'

type SentryModule = typeof import('@sentry/node')

let sentryEnabled = false
let Sentry: SentryModule | null = null

/** Optional Sentry init when SENTRY_DSN is configured. */
export async function initObservability(appName: string): Promise<void> {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return
  try {
    const specifier = '@sentry/node'
    Sentry = await import(/* @vite-ignore */ specifier)
    if (!Sentry) return
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1,
    })
    sentryEnabled = true
    console.info(`[observability] Sentry initialized for ${appName}`)
  } catch (err) {
    console.warn('[observability] Sentry package not installed; skipping init', err)
  }
}

/** Install after all routes; place custom error middleware after this. */
export function setupSentryExpressErrorHandler(app: Express): void {
  if (!sentryEnabled || !Sentry) return
  Sentry.setupExpressErrorHandler(app)
}

export function captureException(err: unknown, extra: Record<string, unknown> = {}): void {
  if (!sentryEnabled || !Sentry) return
  Sentry.captureException(err, Object.keys(extra).length ? { extra } : undefined)
}

export function captureMessage(message: string, level: SeverityLevel = 'warning'): void {
  if (!sentryEnabled || !Sentry) return
  Sentry.captureMessage(message, level)
}

export function isObservabilityEnabled(): boolean {
  return sentryEnabled
}

/** Test-only reset when modules are re-imported between cases. */
export function resetObservabilityForTests(): void {
  sentryEnabled = false
  Sentry = null
}
