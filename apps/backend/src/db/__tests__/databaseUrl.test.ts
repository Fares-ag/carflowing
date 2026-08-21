import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDatabaseUrl } from '../databaseUrl.js'

describe('resolveDatabaseUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    process.env.NODE_ENV = 'test'
  })

  it('keeps loopback URLs outside production', () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('DATABASE_URL', 'postgresql://carflow:carflow@127.0.0.1:5434/carflow')
    expect(resolveDatabaseUrl()).toContain('127.0.0.1')
  })

  it('rebuilds from PGHOST when production DATABASE_URL is loopback', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DATABASE_URL', 'postgresql://postgres:pw@127.0.0.1:15432/railway')
    vi.stubEnv('PGHOST', 'postgres.railway.internal')
    vi.stubEnv('PGUSER', 'postgres')
    vi.stubEnv('PGPASSWORD', 'pw')
    vi.stubEnv('PGPORT', '5432')
    vi.stubEnv('PGDATABASE', 'railway')
    expect(resolveDatabaseUrl()).toBe(
      'postgresql://postgres:pw@postgres.railway.internal:5432/railway'
    )
  })
})
