const WEAK_SECRET_PATTERN = /dev-.*-change-me|change-me|secret|password/i

export function assertProductionSecrets(): void {
  if (process.env.NODE_ENV !== 'production') return
  for (const name of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    const value = process.env[name]
    if (!value || value.length < 32 || WEAK_SECRET_PATTERN.test(value)) {
      throw new Error(`${name} must be a strong secret (32+ chars) in production`)
    }
  }
}
