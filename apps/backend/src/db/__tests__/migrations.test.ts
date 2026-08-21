import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backendRoot = path.resolve(__dirname, '../../..')
const bootstrapSql = path.resolve(backendRoot, 'src/db/bootstrap.sql')
const migrationsFolder = path.resolve(backendRoot, 'drizzle')

const EXPECTED_CHECKS = [
  'rentals_total_amount_nonneg',
  'rentals_monthly_amount_nonneg',
  'rentals_end_after_start',
  'payments_amount_nonneg',
  'payments_refunded_amount_nonneg',
  'invoices_amount_nonneg',
  'customer_profiles_total_spent_nonneg',
  'dealers_total_revenue_nonneg',
]

describe('Database migrations', () => {
  let pg: InstanceType<(typeof import('embedded-postgres'))['default']>
  let connectionString: string
  let sql: ReturnType<typeof postgres>

  beforeAll(async () => {
    const dataDir = path.resolve(backendRoot, '.pgdata-migrations-test')
    if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true })
    fs.mkdirSync(dataDir, { recursive: true })

    const EmbeddedPostgres = (await import('embedded-postgres')).default
    pg = new EmbeddedPostgres({
      databaseDir: dataDir,
      user: 'carflow_mig',
      password: 'carflow_mig',
      port: 5437,
      persistent: false,
    })
    await pg.initialise()
    await pg.start()
    await pg.createDatabase('carflow_mig_test')
    connectionString = `postgresql://carflow_mig:carflow_mig@127.0.0.1:5437/carflow_mig_test`
    sql = postgres(connectionString, { max: 1 })

    const bootstrapClient = postgres(connectionString, { max: 1 })
    await bootstrapClient.unsafe(fs.readFileSync(bootstrapSql, 'utf8'))
    await bootstrapClient`DO $$ BEGIN CREATE ROLE carflow_app NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`
    await bootstrapClient`GRANT USAGE ON SCHEMA public TO carflow_app`
    await bootstrapClient`GRANT SELECT, INSERT, UPDATE, DELETE ON audit_logs TO carflow_app`
    await bootstrapClient.end()

    const migrateClient = postgres(connectionString, { max: 1 })
    await migrateClient`SELECT set_config('carflow.app_role', 'carflow_app', false)`
    await migrate(drizzle(migrateClient), { migrationsFolder })
    await migrateClient.end()
  }, 120_000)

  afterAll(async () => {
    await sql?.end().catch(() => undefined)
    await pg?.stop().catch(() => undefined)
  })

  it('ADM-MIG-01: drizzle migrate completes on a fresh database', async () => {
    const client = postgres(connectionString, { max: 1 })
    const db = drizzle(client)
    await migrate(db, { migrationsFolder })
    await client.end()
  }, 120_000)

  it('ADM-MIG-02: money CHECK constraints exist after migrate', async () => {
    const rows = await sql<{ conname: string }[]>`
      SELECT conname FROM pg_constraint
      WHERE conname = ANY(${EXPECTED_CHECKS})
    `
    const names = rows.map((r) => r.conname)
    for (const name of EXPECTED_CHECKS) {
      expect(names).toContain(name)
    }
  })

  it('ADM-MIG-03: audit_logs UPDATE/DELETE revoked for application role', async () => {
    const [updatePriv] = await sql<{ allowed: boolean }[]>`
      SELECT has_table_privilege('carflow_app', 'public.audit_logs', 'UPDATE') AS allowed
    `
    const [deletePriv] = await sql<{ allowed: boolean }[]>`
      SELECT has_table_privilege('carflow_app', 'public.audit_logs', 'DELETE') AS allowed
    `
    const [insertPriv] = await sql<{ allowed: boolean }[]>`
      SELECT has_table_privilege('carflow_app', 'public.audit_logs', 'INSERT') AS allowed
    `
    const [selectPriv] = await sql<{ allowed: boolean }[]>`
      SELECT has_table_privilege('carflow_app', 'public.audit_logs', 'SELECT') AS allowed
    `

    expect(updatePriv.allowed).toBe(false)
    expect(deletePriv.allowed).toBe(false)
    expect(insertPriv.allowed).toBe(true)
    expect(selectPriv.allowed).toBe(true)
  })
})
