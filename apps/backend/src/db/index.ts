import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'
import { resolveDatabaseUrl } from './databaseUrl.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envTestPath = path.resolve(__dirname, '../../.env.test')
// Test globalSetup writes .env.test; override any developer DATABASE_URL during vitest.
if (fs.existsSync(envTestPath)) {
  dotenv.config({ path: envTestPath, override: true })
}
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') })
dotenv.config()

const connectionString = resolveDatabaseUrl()

console.log('[db] connecting', connectionString.replace(/:[^:@/]+@/, ':***@'))

const client = postgres(connectionString, { max: 10, connect_timeout: 30 })

export const db = drizzle(client, { schema })
export type Db = typeof db
export const sqlClient = client
