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

async function main() {
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
