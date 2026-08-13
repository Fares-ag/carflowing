/**
 * Self-contained backend for Playwright E2E runs: boots a fresh embedded
 * Postgres instance, applies the schema, seeds demo accounts/vehicles, and
 * starts the Express app — all in one process so Playwright's `webServer`
 * only needs to wait on http://localhost:3001/health.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import postgres from 'postgres'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backendRoot = path.resolve(__dirname, '..')
const dataDir = path.resolve(backendRoot, '.pgdata-e2e')
const bootstrapSql = path.resolve(backendRoot, 'src/db/bootstrap.sql')
const PORT = 5436

async function main() {
  if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true })
  fs.mkdirSync(dataDir, { recursive: true })

  const EmbeddedPostgres = (await import('embedded-postgres')).default
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'carflow_e2e',
    password: 'carflow_e2e',
    port: PORT,
    persistent: false,
  })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('carflow_e2e')

  const connectionString = `postgresql://carflow_e2e:carflow_e2e@127.0.0.1:${PORT}/carflow_e2e`
  const bootstrapClient = postgres(connectionString, { max: 1 })
  await bootstrapClient.unsafe(fs.readFileSync(bootstrapSql, 'utf8'))
  await bootstrapClient.end()

  process.env.DATABASE_URL = connectionString
  process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'e2e-access-secret'
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'e2e-refresh-secret'
  process.env.COOKIE_SECURE = 'false'
  process.env.UPLOAD_DRIVER = 'local'
  process.env.UPLOAD_DIR = path.resolve(backendRoot, '.uploads-e2e')
  process.env.PORT = String(3001)
  process.env.PUBLIC_API_URL = 'http://localhost:3001'
  process.env.CUSTOMER_APP_URL = 'http://localhost:5173'

  const { seedDemoData } = await import('../src/db/seed.js')
  await seedDemoData()

  const { createApp } = await import('../src/app.js')
  const app = createApp()
  app.listen(3001, () => {
    console.log('[e2e-server] Backend ready on http://localhost:3001')
  })

  const shutdown = async () => {
    await pg.stop().catch(() => undefined)
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('[e2e-server] fatal', err)
  process.exit(1)
})
