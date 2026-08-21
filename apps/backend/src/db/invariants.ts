import { sql } from 'drizzle-orm'
import { db } from './index.js'

export const CRITICAL_UNIQUE_INDEXES = [
  {
    name: 'invoices_rental_period_idx',
    purpose: 'one invoice per rental billing period (billing onConflictDoNothing idempotency)',
  },
  {
    name: 'rentals_vehicle_open_idx',
    purpose: 'at most one open rental per vehicle',
  },
  {
    name: 'payments_pending_booking_idx',
    purpose: 'at most one pending payment per booking request',
  },
  {
    name: 'payments_pending_invoice_idx',
    purpose: 'at most one pending payment per invoice',
  },
  {
    name: 'payments_external_txn_idx',
    purpose: 'unique external transaction id per payment provider',
  },
] as const

function skipInvariantChecks(): boolean {
  return process.env.VITEST === 'true' || process.env.NODE_ENV === 'test'
}

export async function verifyCriticalDbIndexes(): Promise<void> {
  const names = CRITICAL_UNIQUE_INDEXES.map((idx) => idx.name)
  const rows = await db.execute<{ index_name: string; is_unique: boolean }>(sql`
    SELECT i.relname AS index_name, ix.indisunique AS is_unique
    FROM pg_class i
    JOIN pg_index ix ON ix.indexrelid = i.oid
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND i.relname IN (${sql.join(names.map((name) => sql`${name}`), sql`, `)})
  `)

  const found = new Map(rows.map((row) => [row.index_name, row.is_unique]))
  const missing = CRITICAL_UNIQUE_INDEXES.filter((idx) => !found.has(idx.name))
  const notUnique = CRITICAL_UNIQUE_INDEXES.filter((idx) => found.get(idx.name) === false)

  if (missing.length === 0 && notUnique.length === 0) return

  const lines: string[] = [
    'Critical database invariant indexes are missing or invalid.',
    'Apply src/db/bootstrap.sql and drizzle migrations before starting the API.',
  ]

  for (const idx of missing) {
    lines.push(`- missing unique index "${idx.name}" (${idx.purpose})`)
  }
  for (const idx of notUnique) {
    lines.push(`- index "${idx.name}" exists but is not UNIQUE (${idx.purpose})`)
  }

  throw new Error(lines.join('\n'))
}

export async function assertCriticalDbIndexes(): Promise<void> {
  if (skipInvariantChecks()) return
  await verifyCriticalDbIndexes()
}
