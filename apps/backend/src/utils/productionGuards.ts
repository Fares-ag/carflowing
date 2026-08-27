import { resolveDatabaseUrl } from '../db/databaseUrl.js'

const WEAK_SECRET_PATTERN = /dev-.*-change-me|change-me|secret|password/i
const LOCALHOST_PATTERN = /localhost|127\.0\.0\.1/i

/**
 * SkipCash credentials that were committed to repo docs before launch. They
 * must be rotated; production boot refuses them so a leaked key can never be
 * the one verifying webhook signatures.
 */
const COMPROMISED_SKIPCASH_VALUES = new Set([
  '29d76865-b757-43c4-887a-53bab3519088',
  '7adcc306-8732-46b9-9da6-f8769699e8c4',
])

function databaseHost(connection: string): string {
  try {
    return new URL(connection.replace(/^postgresql:/, 'http:')).hostname
  } catch {
    return ''
  }
}

function requireHttpsUrl(name: string, value: string | undefined): void {
  if (!value?.trim()) {
    throw new Error(`${name} must be set in production`)
  }
  if (LOCALHOST_PATTERN.test(value)) {
    throw new Error(`${name} must not point at localhost in production`)
  }
  if (!value.startsWith('https://')) {
    throw new Error(`${name} must use HTTPS in production`)
  }
}

export function assertProductionSecrets(): void {
  if (process.env.NODE_ENV !== 'production') return

  for (const name of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    const value = process.env[name]
    if (!value || value.length < 32 || WEAK_SECRET_PATTERN.test(value)) {
      throw new Error(`${name} must be a strong secret (32+ chars) in production`)
    }
  }

  const twoFaSecret = process.env.JWT_2FA_SECRET
  if (!twoFaSecret || twoFaSecret.length < 32 || WEAK_SECRET_PATTERN.test(twoFaSecret)) {
    throw new Error('JWT_2FA_SECRET must be a strong secret (32+ chars) in production')
  }
  if (
    twoFaSecret === process.env.JWT_ACCESS_SECRET ||
    twoFaSecret === process.env.JWT_REFRESH_SECRET
  ) {
    throw new Error(
      'JWT_2FA_SECRET must be distinct from JWT_ACCESS_SECRET and JWT_REFRESH_SECRET in production'
    )
  }

  if (process.env.UPLOAD_DRIVER !== 'blob') {
    throw new Error('UPLOAD_DRIVER must be "blob" in production (Railway disk is ephemeral)')
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    throw new Error('BLOB_READ_WRITE_TOKEN is required when UPLOAD_DRIVER=blob in production')
  }
  // BLOB_ACCESS=public makes every uploaded blob — including QID/licence scans
  // and dealer trade licences — readable by anyone holding the URL.
  if (process.env.BLOB_ACCESS?.trim().toLowerCase() === 'public') {
    throw new Error(
      'BLOB_ACCESS must not be "public" in production: identity documents would be world-readable. Leave it unset so uploads stay private.'
    )
  }

  // The job scheduler holds a session-scoped Postgres advisory lock. Neon's
  // pooled endpoint (PgBouncer, transaction pooling) silently drops session
  // state, so the lock is lost and billing/dunning/reconciliation wedge.
  const dbHost = databaseHost(resolveDatabaseUrl())
  if (dbHost.includes('-pooler')) {
    throw new Error(
      `DATABASE_URL points at a pooled endpoint (${dbHost}). The API needs the DIRECT (non-pooled) connection string: the job scheduler's session advisory lock does not survive PgBouncer transaction pooling. Remove "-pooler" from the host.`
    )
  }

  // Default ENABLE_JOBS=true (unset). In-process scheduler on Railway is the supported path.
  if (process.env.ENABLE_JOBS === 'false' && process.env.EXTERNAL_SCHEDULER !== 'true') {
    throw new Error(
      'ENABLE_JOBS=false in production requires EXTERNAL_SCHEDULER=true (cron hitting POST /api/admin/jobs/run-once)'
    )
  }

  if (process.env.COOKIE_SECURE !== 'true') {
    throw new Error('COOKIE_SECURE must be "true" in production')
  }
  if (!process.env.COOKIE_DOMAIN?.trim()) {
    console.warn(
      '[productionGuards] COOKIE_DOMAIN is not set — auth cookies use SameSite=None (third-party). Set COOKIE_DOMAIN=.yourdomain.tld for api + app subdomains on one registrable domain.'
    )
  }

  requireHttpsUrl('PUBLIC_API_URL', process.env.PUBLIC_API_URL)
  requireHttpsUrl('CUSTOMER_APP_URL', process.env.CUSTOMER_APP_URL)
  requireHttpsUrl('DEALER_APP_URL', process.env.DEALER_APP_URL)

  const cors = process.env.CORS_ORIGINS?.trim()
  if (!cors) {
    throw new Error('CORS_ORIGINS must be set in production')
  }
  for (const origin of cors.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (LOCALHOST_PATTERN.test(origin)) {
      throw new Error(`CORS_ORIGINS must not include localhost in production: ${origin}`)
    }
  }

  if (!process.env.RESEND_API_KEY?.trim()) {
    throw new Error('RESEND_API_KEY must be set in production')
  }
  // Online payment is gated on email verification, so a missing sender address
  // silently kills the entire online-payment funnel while the API boots green.
  if (!process.env.FROM_EMAIL?.trim()) {
    throw new Error(
      'FROM_EMAIL must be set in production: verification email is a hard dependency of the online payment flow'
    )
  }

  if (process.env.SKIPCASH_SAVED_CARDS_CHARGE_READY === 'true') {
    throw new Error(
      'SKIPCASH_SAVED_CARDS_CHARGE_READY must not be enabled in production until token charging is implemented'
    )
  }

  const deposit = Number(process.env.SUBSCRIPTION_DEPOSIT_AMOUNT ?? 0)
  if (Number.isFinite(deposit) && deposit > 0) {
    console.warn(
      '[productionGuards] SUBSCRIPTION_DEPOSIT_AMOUNT > 0 but deposit refund flow is not implemented — keep at 0 until enabled'
    )
  }

  const skipcashConfigured = process.env.SKIPCASH_KEY_ID || process.env.SKIPCASH_KEY_SECRET
  if (skipcashConfigured) {
    if (process.env.SKIPCASH_MODE !== 'production') {
      throw new Error('SKIPCASH_MODE must be "production" when SkipCash keys are configured in production')
    }
    for (const name of ['SKIPCASH_KEY_ID', 'SKIPCASH_KEY_SECRET', 'SKIPCASH_WEBHOOK_KEY'] as const) {
      if (!process.env[name]) {
        throw new Error(`${name} is required when SkipCash is configured in production`)
      }
    }
    const webhookKey = process.env.SKIPCASH_WEBHOOK_KEY
    if (webhookKey && COMPROMISED_SKIPCASH_VALUES.has(webhookKey)) {
      throw new Error(
        'SKIPCASH_WEBHOOK_KEY matches a key that was committed to the repository. Rotate it in the SkipCash portal before launching.'
      )
    }
  }

  // Checked last: everything above is a leak, an outage or a broken funnel,
  // and should be the error an operator sees first. Without a DSN every
  // captureException/captureMessage in the codebase is a silent no-op, so
  // production failures leave no trace anywhere.
  if (!process.env.SENTRY_DSN?.trim()) {
    if (process.env.ALLOW_NO_ERROR_REPORTING !== 'true') {
      throw new Error(
        'SENTRY_DSN must be set in production (or set ALLOW_NO_ERROR_REPORTING=true to run blind on purpose)'
      )
    }
    console.warn(
      '[productionGuards] ALLOW_NO_ERROR_REPORTING=true — SENTRY_DSN is unset, so every captureException in this process is a no-op and production errors are only visible in stdout logs.'
    )
  }
}
