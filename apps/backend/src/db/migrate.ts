import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

dotenv.config({ path: path.resolve(fileURLToPath(import.meta.url), '../../../../.env') })
dotenv.config()

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://carflow:carflow@localhost:5432/carflow'

async function main() {
  const client = postgres(connectionString, { max: 1 })
  const db = drizzle(client)
  const migrationsFolder = path.resolve(fileURLToPath(import.meta.url), '../../drizzle')
  console.log('Running migrations from', migrationsFolder)
  await migrate(db, { migrationsFolder })
  await client.end()
  console.log('Migrations complete')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
