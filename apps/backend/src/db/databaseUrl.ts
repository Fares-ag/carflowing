/**
 * Railway's Postgres plugin DATABASE_URL is sometimes the laptop TCP proxy
 * (127.0.0.1:15432). Containers cannot reach that. Prefer a non-loopback URL,
 * then rebuild from PGHOST (postgres.railway.internal).
 */
export function resolveDatabaseUrl(): string {
  const fallback =
    process.env.DATABASE_URL ?? 'postgresql://carflow:carflow@127.0.0.1:5434/carflow'

  if (process.env.NODE_ENV !== 'production') return fallback

  if (!isLoopbackUrl(fallback)) return fallback

  const host = process.env.PGHOST?.trim()
  const user = process.env.PGUSER || process.env.POSTGRES_USER
  const pass = process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD
  const port = process.env.PGPORT || '5432'
  const database = process.env.PGDATABASE || process.env.POSTGRES_DB || 'railway'

  if (host && user && pass && host !== '127.0.0.1' && host !== 'localhost') {
    console.warn('[db] DATABASE_URL pointed at loopback; using PGHOST instead')
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${database}`
  }

  return fallback
}

function isLoopbackUrl(connection: string): boolean {
  try {
    const parsed = new URL(connection.replace(/^postgresql:/, 'http:'))
    return parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost'
  } catch {
    return /127\.0\.0\.1|localhost/.test(connection)
  }
}
