import { afterEach, describe, expect, it } from 'vitest'
import { CRITICAL_UNIQUE_INDEXES, assertCriticalDbIndexes, verifyCriticalDbIndexes } from '../invariants.js'
import { sqlClient } from '../index.js'

describe('assertCriticalDbIndexes', () => {
  afterEach(async () => {
    await sqlClient.unsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS invoices_rental_period_idx
        ON invoices (rental_id, period_start)
        WHERE rental_id IS NOT NULL AND period_start IS NOT NULL;
    `)
  })

  it('passes when all critical unique indexes exist', async () => {
    await expect(verifyCriticalDbIndexes()).resolves.toBeUndefined()
  })

  it('is skipped during vitest server boot', async () => {
    await expect(assertCriticalDbIndexes()).resolves.toBeUndefined()
  })

  it('throws a descriptive error when a critical index is missing', async () => {
    await sqlClient`DROP INDEX IF EXISTS invoices_rental_period_idx`

    await expect(verifyCriticalDbIndexes()).rejects.toThrow(/invoices_rental_period_idx/)
    await expect(verifyCriticalDbIndexes()).rejects.toThrow(/billing onConflictDoNothing idempotency/)
    await expect(verifyCriticalDbIndexes()).rejects.toThrow(/bootstrap\.sql/)
  })

  it('documents the full invariant index set', () => {
    expect(CRITICAL_UNIQUE_INDEXES.map((idx) => idx.name)).toEqual([
      'invoices_rental_period_idx',
      'rentals_vehicle_open_idx',
      'booking_requests_pending_vehicle_idx',
      'payments_pending_booking_idx',
      'payments_pending_invoice_idx',
      'payments_external_txn_idx',
    ])
  })
})
