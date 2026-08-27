import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import postgres from 'postgres'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') })
dotenv.config()

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://carflow:carflow@localhost:5432/carflow'

const sqlPath = path.resolve(__dirname, './bootstrap.sql')

function databaseHost(connection: string): string {
  try {
    return new URL(connection.replace(/^postgresql:/, 'http:')).hostname
  } catch {
    return connection
  }
}

/**
 * bootstrap.sql is a developer convenience that replays the whole schema in one
 * shot, including destructive statements (`ALTER TABLE dealers DROP COLUMN IF
 * EXISTS tax_id`, `DROP CONSTRAINT IF EXISTS ...`). Production is provisioned by
 * the tracked migration chain (`npm run db:migrate`), never by this script.
 */
function assertPushTargetIsDisposable(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to push: NODE_ENV=production. db:push replays bootstrap.sql, which contains ' +
        'destructive DDL (DROP COLUMN / DROP CONSTRAINT) and bypasses the tracked migration ' +
        'history. There is no override for production — use `npm run db:migrate` instead.'
    )
  }

  const host = databaseHost(connectionString)
  const isLocal = host === 'localhost' || host === '127.0.0.1'
  if (!isLocal && process.env.ALLOW_DESTRUCTIVE_SEED !== 'true') {
    throw new Error(
      `Refusing to push: DATABASE_URL host "${host}" is not localhost/127.0.0.1, so this is a ` +
        'remote (possibly production) database. db:push replays bootstrap.sql, which contains ' +
        'destructive DDL (DROP COLUMN / DROP CONSTRAINT) and bypasses the tracked migration ' +
        'history. Use `npm run db:migrate`, or set ALLOW_DESTRUCTIVE_SEED=true only if you are ' +
        'certain this database is disposable.'
    )
  }
}

async function main() {
  assertPushTargetIsDisposable()
  const sqlText = fs.readFileSync(sqlPath, 'utf8')
  const sql = postgres(connectionString, { max: 1 })
  console.log('Applying bootstrap.sql to', connectionString.replace(/:[^:@]+@/, ':***@'))
  await sql.unsafe(sqlText)
  await sql.end()
  console.log('Schema applied')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
