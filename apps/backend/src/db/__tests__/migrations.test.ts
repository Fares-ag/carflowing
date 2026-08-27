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

type Sql = ReturnType<typeof postgres>

/**
 * Production is provisioned purely by the drizzle migration chain
 * (src/index.ts -> runMigrations()), while every other harness in this repo
 * applies bootstrap.sql. Because every migration is `IF NOT EXISTS`, a table
 * that exists only in bootstrap.sql is invisible to any test that runs the
 * chain on top of it — that is how complaint_replies reached production
 * missing. So this suite provisions two *independent* databases, one from each
 * source, and asserts their schemas are identical.
 */
async function readTables(sql: Sql): Promise<string[]> {
  const rows = await sql<{ table_name: string }[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `
  return rows
    .map((r) => r.table_name)
    .filter((name) => !name.startsWith('__drizzle'))
    .sort()
}

/** One comparable line per column: name, storage type, nullability, default. */
async function readColumns(sql: Sql): Promise<string[]> {
  const rows = await sql<
    {
      table_name: string
      column_name: string
      udt_name: string
      is_nullable: string
      column_default: string | null
    }[]
  >`
    SELECT table_name, column_name, udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `
  return rows
    .filter((r) => !r.table_name.startsWith('__drizzle'))
    .map(
      (r) =>
        `${r.table_name}.${r.column_name} ${r.udt_name} ` +
        `${r.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}` +
        `${r.column_default === null ? '' : ` DEFAULT ${r.column_default}`}`
    )
    .sort()
}

/**
 * PRIMARY KEY / UNIQUE / FOREIGN KEY / CHECK constraints, rendered as text.
 * Column shape alone is not enough: staff_invites carried a CHECK in the chain
 * that bootstrap.sql lacked, so admin invites 500'd only in production.
 */
async function readConstraints(sql: Sql): Promise<string[]> {
  const rows = await sql<{ table_name: string; conname: string; definition: string }[]>`
    SELECT rel.relname AS table_name, con.conname, pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public' AND con.contype IN ('p', 'u', 'f', 'c')
  `
  return rows.map((r) => `${r.table_name}.${r.conname} ${r.definition}`).sort()
}

/** Indexes (including the partial unique indexes the booking/billing invariants rely on). */
async function readIndexes(sql: Sql): Promise<string[]> {
  const rows = await sql<{ indexdef: string }[]>`
    SELECT indexdef FROM pg_indexes WHERE schemaname = 'public'
  `
  return rows.map((r) => r.indexdef).sort()
}

function missingFrom(expected: string[], actual: string[]): string[] {
  const present = new Set(actual)
  return expected.filter((item) => !present.has(item))
}

/**
 * Returns '' when the two sets match, otherwise a diff naming exactly what the
 * migration chain would leave out of (or add to) a production database.
 */
function describeDrift(label: string, fromBootstrap: string[], fromChain: string[]): string {
  const missing = missingFrom(fromBootstrap, fromChain)
  const extra = missingFrom(fromChain, fromBootstrap)
  if (missing.length === 0 && extra.length === 0) return ''
  const lines: string[] = [`Schema drift in ${label}:`]
  if (missing.length > 0) {
    lines.push(
      `  Missing from the migration chain (present in bootstrap.sql, so production would NOT have them):`,
      ...missing.map((item) => `    - ${item}`)
    )
  }
  if (extra.length > 0) {
    lines.push(
      `  Missing from bootstrap.sql (present in the migration chain):`,
      ...extra.map((item) => `    + ${item}`)
    )
  }
  lines.push(
    '  Fix: add the change to BOTH apps/backend/drizzle/<n>_*.sql (+ meta/_journal.json)',
    '  and apps/backend/src/db/bootstrap.sql.'
  )
  return lines.join('\n')
}

describe('Database migrations', () => {
  let pg: InstanceType<(typeof import('embedded-postgres'))['default']>
  /** Provisioned by the drizzle migration chain only — the production path. */
  let chainSql: Sql
  /** Provisioned by bootstrap.sql only — the developer/test path. */
  let bootstrapSql_: Sql
  /** bootstrap.sql + chain, with a runtime role, for the audit_logs grant test. */
  let privSql: Sql
  let chainConnection: string

  function connectionFor(database: string): string {
    return `postgresql://carflow_mig:carflow_mig@127.0.0.1:5437/${database}`
  }

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
    await pg.createDatabase('carflow_chain_test')
    await pg.createDatabase('carflow_bootstrap_test')
    await pg.createDatabase('carflow_privs_test')

    chainConnection = connectionFor('carflow_chain_test')

    // (a) empty database -> migration chain only.
    const chainMigrateClient = postgres(chainConnection, { max: 1 })
    await chainMigrateClient`SELECT set_config('carflow.app_role', 'carflow_app', false)`
    await migrate(drizzle(chainMigrateClient), { migrationsFolder })
    await chainMigrateClient.end()
    chainSql = postgres(chainConnection, { max: 1 })

    // (b) empty database -> bootstrap.sql only.
    const bootstrapClient = postgres(connectionFor('carflow_bootstrap_test'), { max: 1 })
    await bootstrapClient.unsafe(fs.readFileSync(bootstrapSql, 'utf8'))
    await bootstrapClient.end()
    bootstrapSql_ = postgres(connectionFor('carflow_bootstrap_test'), { max: 1 })

    // (c) bootstrap + chain with a runtime role that starts out over-privileged,
    //     so 0013 has something to actually revoke.
    const privConnection = connectionFor('carflow_privs_test')
    const privBootstrap = postgres(privConnection, { max: 1 })
    await privBootstrap.unsafe(fs.readFileSync(bootstrapSql, 'utf8'))
    await privBootstrap`DO $$ BEGIN CREATE ROLE carflow_app NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`
    await privBootstrap`GRANT USAGE ON SCHEMA public TO carflow_app`
    await privBootstrap`GRANT SELECT, INSERT, UPDATE, DELETE ON audit_logs TO carflow_app`
    await privBootstrap.end()

    const privMigrate = postgres(privConnection, { max: 1 })
    await privMigrate`SELECT set_config('carflow.app_role', 'carflow_app', false)`
    await migrate(drizzle(privMigrate), { migrationsFolder })
    await privMigrate.end()
    privSql = postgres(privConnection, { max: 1 })
  }, 180_000)

  afterAll(async () => {
    await chainSql?.end().catch(() => undefined)
    await bootstrapSql_?.end().catch(() => undefined)
    await privSql?.end().catch(() => undefined)
    await pg?.stop().catch(() => undefined)
  })

  it('ADM-MIG-01: the migration chain alone creates every table bootstrap.sql creates', async () => {
    const [fromBootstrap, fromChain] = await Promise.all([
      readTables(bootstrapSql_),
      readTables(chainSql),
    ])
    expect(fromChain.length).toBeGreaterThan(30)
    expect(describeDrift('tables', fromBootstrap, fromChain)).toBe('')
  })

  it('ADM-MIG-02: the migration chain alone creates every column bootstrap.sql creates', async () => {
    const [fromBootstrap, fromChain] = await Promise.all([
      readColumns(bootstrapSql_),
      readColumns(chainSql),
    ])
    expect(describeDrift('columns', fromBootstrap, fromChain)).toBe('')
  })

  it('ADM-MIG-03: the migration chain alone creates every constraint and index bootstrap.sql creates', async () => {
    const [bootstrapConstraints, chainConstraints] = await Promise.all([
      readConstraints(bootstrapSql_),
      readConstraints(chainSql),
    ])
    expect(describeDrift('constraints', bootstrapConstraints, chainConstraints)).toBe('')

    const [bootstrapIndexes, chainIndexes] = await Promise.all([
      readIndexes(bootstrapSql_),
      readIndexes(chainSql),
    ])
    expect(describeDrift('indexes', bootstrapIndexes, chainIndexes)).toBe('')
  })

  it('ADM-MIG-07: replaying every migration file is a no-op (idempotent chain)', async () => {
    const before = {
      tables: await readTables(chainSql),
      columns: await readColumns(chainSql),
      constraints: await readConstraints(chainSql),
      indexes: await readIndexes(chainSql),
    }

    const journal = JSON.parse(
      fs.readFileSync(path.resolve(migrationsFolder, 'meta/_journal.json'), 'utf8')
    ) as { entries: { tag: string }[] }
    expect(journal.entries.length).toBeGreaterThan(0)

    const replayClient = postgres(chainConnection, { max: 1 })
    try {
      await replayClient`SELECT set_config('carflow.app_role', 'carflow_app', false)`
      for (const entry of journal.entries) {
        const file = path.resolve(migrationsFolder, `${entry.tag}.sql`)
        expect(fs.existsSync(file), `journal references missing file ${entry.tag}.sql`).toBe(true)
        await replayClient.unsafe(fs.readFileSync(file, 'utf8'))
      }
    } finally {
      await replayClient.end()
    }

    expect(describeDrift('tables after replay', before.tables, await readTables(chainSql))).toBe('')
    expect(describeDrift('columns after replay', before.columns, await readColumns(chainSql))).toBe(
      ''
    )
    expect(
      describeDrift('constraints after replay', before.constraints, await readConstraints(chainSql))
    ).toBe('')
    expect(
      describeDrift('indexes after replay', before.indexes, await readIndexes(chainSql))
    ).toBe('')
  }, 120_000)

  it('ADM-MIG-04: re-running drizzle migrate applies nothing new', async () => {
    const [before] = await chainSql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM drizzle."__drizzle_migrations"
    `
    const client = postgres(chainConnection, { max: 1 })
    await client`SELECT set_config('carflow.app_role', 'carflow_app', false)`
    await migrate(drizzle(client), { migrationsFolder })
    await client.end()

    const [after] = await chainSql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM drizzle."__drizzle_migrations"
    `
    expect(after.count).toBe(before.count)
  }, 120_000)

  it('ADM-MIG-05: money CHECK constraints exist after a chain-only migrate', async () => {
    const rows = await chainSql<{ conname: string }[]>`
      SELECT conname FROM pg_constraint
      WHERE conname = ANY(${EXPECTED_CHECKS})
    `
    const names = rows.map((r) => r.conname)
    for (const name of EXPECTED_CHECKS) {
      expect(names).toContain(name)
    }
  })

  it('ADM-MIG-06: audit_logs UPDATE/DELETE revoked for application role', async () => {
    const [updatePriv] = await privSql<{ allowed: boolean }[]>`
      SELECT has_table_privilege('carflow_app', 'public.audit_logs', 'UPDATE') AS allowed
    `
    const [deletePriv] = await privSql<{ allowed: boolean }[]>`
      SELECT has_table_privilege('carflow_app', 'public.audit_logs', 'DELETE') AS allowed
    `
    const [insertPriv] = await privSql<{ allowed: boolean }[]>`
      SELECT has_table_privilege('carflow_app', 'public.audit_logs', 'INSERT') AS allowed
    `
    const [selectPriv] = await privSql<{ allowed: boolean }[]>`
      SELECT has_table_privilege('carflow_app', 'public.audit_logs', 'SELECT') AS allowed
    `

    expect(updatePriv.allowed).toBe(false)
    expect(deletePriv.allowed).toBe(false)
    expect(insertPriv.allowed).toBe(true)
    expect(selectPriv.allowed).toBe(true)
  })
})
