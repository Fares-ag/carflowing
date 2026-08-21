import { and, eq, isNotNull, lt } from 'drizzle-orm'
import { db } from '../db/index.js'
import { payments } from '../db/schema.js'
import { applySkipCashOutcome } from './paymentSettlement.js'
import { getSkipCashPayment, SkipCashStatus } from './skipcash.js'
import { logStructured } from '../utils/requestContext.js'

function reconcileAfterMinutes(): number {
  const n = Number(process.env.PAYMENT_RECONCILE_AFTER_MINUTES)
  return Number.isFinite(n) && n > 0 ? n : 10
}

/**
 * Safety net for lost/late webhooks (BUG-06 in the audit): any SkipCash
 * payment still `pending` after a few minutes is looked up directly at the
 * provider and settled through the exact same code path as the webhook.
 * Payments that never reached SkipCash (no external id) simply time out via
 * the hold-expiry job.
 */
export async function reconcilePendingSkipCashPayments(): Promise<number> {
  const cutoff = new Date(Date.now() - reconcileAfterMinutes() * 60 * 1000)
  const stuck = await db
    .select({ id: payments.id, externalTransactionId: payments.externalTransactionId })
    .from(payments)
    .where(
      and(
        eq(payments.status, 'pending'),
        eq(payments.provider, 'skipcash'),
        isNotNull(payments.externalTransactionId),
        lt(payments.createdAt, cutoff)
      )
    )
    .limit(100)

  let settled = 0
  for (const p of stuck) {
    try {
      const remote = await getSkipCashPayment(p.externalTransactionId!)
      if (!remote) continue
      if (remote.statusId === SkipCashStatus.NEW || remote.statusId === SkipCashStatus.PENDING) {
        continue // still in flight; the hold-expiry job handles abandonment
      }
      const result = await applySkipCashOutcome({
        paymentId: p.id,
        statusId: remote.statusId,
        // Provider-reported amount, when available, gets the same ±0.01 check.
        reportedAmount: remote.amount ?? null,
      })
      if (result.handled) {
        settled += 1
        logStructured('info', 'reconcile.payment_settled', {
          paymentId: p.id,
          action: result.action,
        })
      }
    } catch (err) {
      logStructured('error', 'reconcile.payment_failed', {
        paymentId: p.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return settled
}
