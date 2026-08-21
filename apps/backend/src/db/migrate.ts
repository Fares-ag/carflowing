import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import dotenv from 'dotenv'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { resolveDatabaseUrl } from './databaseUrl.js'

dotenv.config({ path: path.resolve(fileURLToPath(import.meta.url), '../../../../.env') })
dotenv.config()

const connectionString = resolveDatabaseUrl()

function resolveAppRole(connection: string): string {
  if (process.env.DATABASE_APP_ROLE?.trim()) return process.env.DATABASE_APP_ROLE.trim()
  try {
    return new URL(connection.replace(/^postgresql:/, 'http:')).username || 'carflow'
  } catch {
    return 'carflow'
  }
}

export async function runMigrations(): Promise<void> {
  const client = postgres(connectionString, { max: 1, connect_timeout: 30 })
  try {
    const appRole = resolveAppRole(connectionString)
    await client`SELECT set_config('carflow.app_role', ${appRole}, false)`
    const db = drizzle(client)
    const migrationsFolder = path.resolve(fileURLToPath(import.meta.url), '../../../drizzle')
    console.log('Running migrations from', migrationsFolder, 'as app role', appRole)
    await migrate(db, { migrationsFolder })
    console.log('Migrations complete')
  } finally {
    await client.end()
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (invokedDirectly) {
  runMigrations().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
