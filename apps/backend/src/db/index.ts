import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import * as schema from './schema.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envTestPath = path.resolve(__dirname, '../../.env.test')
// Test globalSetup writes .env.test; override any developer DATABASE_URL during vitest.
if (fs.existsSync(envTestPath)) {
  dotenv.config({ path: envTestPath, override: true })
}
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') })
dotenv.config()

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://carflow:carflow@127.0.0.1:5434/carflow'

console.log('[db] connecting', connectionString.replace(/:[^:@/]+@/, ':***@'))

const client = postgres(connectionString, { max: 10 })

export const db = drizzle(client, { schema })
export type Db = typeof db
export const sqlClient = client
