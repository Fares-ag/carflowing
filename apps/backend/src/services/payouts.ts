import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { commissionLedger, dealers, payouts } from '../db/schema.js'
import { runWithJobsAdvisoryLock } from './jobsLock.js'

/** Roll pending commission rows into dealer payout batches (Phase 3.1). */
export async function generateDealerPayouts(): Promise<number> {
  const dealerRows = await db
    .selectDistinct({ dealerId: commissionLedger.dealerId })
    .from(commissionLedger)
    .where(eq(commissionLedger.status, 'pending'))

  let created = 0
  for (const { dealerId } of dealerRows) {
    const [dealer] = await db
      .select({
        bankIban: dealers.bankIban,
        bankDetailsVerifiedAt: dealers.bankDetailsVerifiedAt,
      })
      .from(dealers)
      .where(eq(dealers.id, dealerId))
      .limit(1)
    if (!dealer?.bankIban?.trim() || !dealer.bankDetailsVerifiedAt) {
      console.warn(`[payouts] skipping dealer ${dealerId}: bank details missing or unverified`)
      continue
    }

    await db.transaction(async (tx) => {
      const pendingRows = await tx
        .select()
        .from(commissionLedger)
        .where(and(eq(commissionLedger.dealerId, dealerId), eq(commissionLedger.status, 'pending')))
        .for('update')

      if (pendingRows.length === 0) return

      const amount = pendingRows.reduce((sum, row) => sum + Number(row.netAmount), 0)
      if (!Number.isFinite(amount) || amount <= 0) return

      const [batch] = await tx
        .insert(payouts)
        .values({
          dealerId,
          amount: String(Math.round(amount * 100) / 100),
          status: 'pending',
          note: 'Auto-generated from commission ledger',
        })
        .returning({ id: payouts.id })

      await tx
        .update(commissionLedger)
        .set({ status: 'batched', payoutId: batch.id })
        .where(
          and(
            eq(commissionLedger.dealerId, dealerId),
            eq(commissionLedger.status, 'pending'),
            inArray(
              commissionLedger.id,
              pendingRows.map((row) => row.id)
            )
          )
        )

      created += 1
    })
  }
  return created
}

/** Admin-triggered payout batching — serialized with the job scheduler lock. */
export async function generateDealerPayoutsUnderLock(): Promise<number | null> {
  return runWithJobsAdvisoryLock(() => generateDealerPayouts())
}

export async function markPayoutPaid(payoutId: string, note?: string): Promise<boolean> {
  const [existing] = await db
    .select({ note: payouts.note })
    .from(payouts)
    .where(eq(payouts.id, payoutId))
    .limit(1)
  const [row] = await db
    .update(payouts)
    .set({ status: 'paid', paidAt: new Date(), note: note ?? existing?.note ?? null })
    .where(and(eq(payouts.id, payoutId), inArray(payouts.status, ['pending'])))
    .returning({ id: payouts.id })
  return !!row
}

export async function unmarkPayoutPaid(payoutId: string, note?: string): Promise<boolean> {
  const [existing] = await db
    .select({ note: payouts.note })
    .from(payouts)
    .where(eq(payouts.id, payoutId))
    .limit(1)
  if (!existing) return false
  const [row] = await db
    .update(payouts)
    .set({
      status: 'pending',
      paidAt: null,
      note: note ?? existing.note ?? null,
    })
    .where(and(eq(payouts.id, payoutId), eq(payouts.status, 'paid')))
    .returning({ id: payouts.id })
  return !!row
}
