import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import postgres from 'postgres'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backendRoot = path.resolve(__dirname, '../..')
const dataDir = path.resolve(backendRoot, '.pgdata-test')
const bootstrapSql = path.resolve(backendRoot, 'src/db/bootstrap.sql')
const envTestPath = path.resolve(backendRoot, '.env.test')
const PORT = 5435

/**
 * Vitest globalSetup: boots a throwaway embedded Postgres instance once for
 * the whole test run, applies the schema, and writes .env.test so that
 * db/index.ts (loaded lazily by every test file) connects to it instead of
 * a developer's real database.
 */
export default async function globalSetup() {
  // Always start from a clean schema so tests never see stale migrations.
  if (fs.existsSync(dataDir)) {
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
  fs.mkdirSync(dataDir, { recursive: true })

  const EmbeddedPostgres = (await import('embedded-postgres')).default
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'carflow_test',
    password: 'carflow_test',
    port: PORT,
    persistent: false,
  })

  await pg.initialise()
  await pg.start()
  await pg.createDatabase('carflow_test')

  const connectionString = `postgresql://carflow_test:carflow_test@127.0.0.1:${PORT}/carflow_test`
  const sql = postgres(connectionString, { max: 1 })
  const sqlText = fs.readFileSync(bootstrapSql, 'utf8')
  await sql.unsafe(sqlText)
  await sql.end()

  fs.writeFileSync(
    envTestPath,
    [
      `DATABASE_URL=${connectionString}`,
      'JWT_ACCESS_SECRET=test-access-secret-minimum-32-characters-long',
      'JWT_REFRESH_SECRET=test-refresh-secret-minimum-32-characters-long',
      'COOKIE_SECURE=false',
      'UPLOAD_DRIVER=local',
      `UPLOAD_DIR=${path.resolve(backendRoot, '.uploads-test').replace(/\\/g, '/')}`,
      'PUBLIC_API_URL=http://localhost:3001',
      'CUSTOMER_APP_URL=http://localhost:5173',
      'RESEND_API_KEY=',
      '',
    ].join('\n'),
    'utf8'
  )
  process.env.DATABASE_URL = connectionString

  return async function teardown() {
    await pg.stop().catch(() => undefined)
    fs.rmSync(dataDir, { recursive: true, force: true })
    fs.rmSync(envTestPath, { force: true })
    fs.rmSync(path.resolve(backendRoot, '.uploads-test'), { recursive: true, force: true })
  }
}
