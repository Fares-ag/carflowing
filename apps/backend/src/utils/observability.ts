/** Optional Sentry init when SENTRY_DSN is configured. */
export async function initObservability(appName: string): Promise<void> {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return
  try {
    const Sentry = await import('@sentry/node')
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1,
    })
    console.info(`[observability] Sentry initialized for ${appName}`)
  } catch (err) {
    console.warn('[observability] Sentry package not installed; skipping init', err)
  }
}
