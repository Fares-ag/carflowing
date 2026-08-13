import EmbeddedPostgres from 'embedded-postgres'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(__dirname, '../../../../.pgdata-qa')
const port = 5434

async function main() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'carflow',
    password: 'carflow',
    port,
    persistent: true,
  })

  console.log('Initializing embedded Postgres...')
  try {
    await pg.initialise()
  } catch (e) {
    // already initialized
    console.log('Init note:', e.message?.slice(0, 120))
  }

  console.log('Starting on port', port)
  await pg.start()
  try {
    await pg.createDatabase('carflow')
  } catch (e) {
    console.log('DB create note:', e.message?.slice(0, 120))
  }
  console.log('DATABASE_URL=postgresql://carflow:carflow@127.0.0.1:' + port + '/carflow')
  console.log('EMBEDDED_PG_READY')
  // keep alive
  await new Promise(() => {})
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
