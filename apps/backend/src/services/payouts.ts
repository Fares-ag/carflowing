import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { commissionLedger, dealers, payouts } from '../db/schema.js'
import { logStructured } from '../utils/requestContext.js'
import { runWithJobsAdvisoryLock } from './jobsLock.js'

/** Minimum hours between two automatic payout batches for the same dealer. */
export function payoutMinIntervalHours(): number {
  const n = Number(process.env.PAYOUT_MIN_INTERVAL_HOURS)
  return Number.isFinite(n) && n >= 0 ? n : 24
}

/** Smallest automatic payout batch, in QAR. Smaller balances carry forward. */
export function payoutMinBatchAmount(): number {
  const n = Number(process.env.PAYOUT_MIN_BATCH_QAR)
  return Number.isFinite(n) && n >= 0 ? n : 100
}

/**
 * Roll pending commission rows into dealer payout batches (Phase 3.1).
 *
 * The sweep runs every 5 minutes but a dealer is batched at most once per
 * PAYOUT_MIN_INTERVAL_HOURS and only once the pending balance clears
 * PAYOUT_MIN_BATCH_QAR — otherwise every sweep minted a micro-payout. A balance
 * that is below the minimum, or negative because a refund reversed commission
 * after the last payout, is left pending so it nets against the next batch
 * instead of producing an unpayable row. `force` (admin action) bypasses both
 * the cadence and the minimum.
 */
export async function generateDealerPayouts(options: { force?: boolean } = {}): Promise<number> {
  const force = options.force === true
  const dealerRows = await db
    .selectDistinct({ dealerId: commissionLedger.dealerId })
    .from(commissionLedger)
    .where(eq(commissionLedger.status, 'pending'))

  const minorMinimum = Math.round(payoutMinBatchAmount() * 100)
  const cadenceMs = payoutMinIntervalHours() * 60 * 60 * 1000

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

    if (!force && cadenceMs > 0) {
      const [lastBatch] = await db
        .select({ createdAt: payouts.createdAt })
        .from(payouts)
        .where(eq(payouts.dealerId, dealerId))
        .orderBy(desc(payouts.createdAt))
        .limit(1)
      if (lastBatch && Date.now() - lastBatch.createdAt.getTime() < cadenceMs) continue
    }

    await db.transaction(async (tx) => {
      const pendingRows = await tx
        .select()
        .from(commissionLedger)
        .where(and(eq(commissionLedger.dealerId, dealerId), eq(commissionLedger.status, 'pending')))
        .for('update')

      if (pendingRows.length === 0) return

      // Money is summed in minor units (fils) so refund reversals net exactly.
      const minorAmount = pendingRows.reduce(
        (sum, row) => sum + Math.round(Number(row.netAmount) * 100),
        0
      )
      if (!Number.isFinite(minorAmount)) return

      if (minorAmount <= 0) {
        // Post-payout refund: the balance is zero or negative. Leave the rows
        // pending so the negative carries against the dealer's next earnings.
        logStructured('info', 'payouts.carry_forward_negative', {
          dealerId,
          balanceQar: minorAmount / 100,
          rows: pendingRows.length,
        })
        return
      }

      if (!force && minorAmount < minorMinimum) {
        logStructured('info', 'payouts.below_minimum', {
          dealerId,
          balanceQar: minorAmount / 100,
          minimumQar: minorMinimum / 100,
        })
        return
      }

      const [batch] = await tx
        .insert(payouts)
        .values({
          dealerId,
          amount: String(minorAmount / 100),
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

/**
 * Admin-triggered payout batching — serialized with the job scheduler lock and
 * exempt from the automatic cadence/minimum (a human asked for it explicitly).
 */
export async function generateDealerPayoutsUnderLock(): Promise<number | null> {
  return runWithJobsAdvisoryLock(() => generateDealerPayouts({ force: true }))
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
