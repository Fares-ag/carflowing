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
  if (!process.env.FROM_EMAIL?.trim()) {
    console.warn('[productionGuards] FROM_EMAIL not set — transactional email disabled')
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
}
