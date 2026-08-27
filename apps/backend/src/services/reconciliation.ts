import { and, asc, eq, gt, inArray, isNotNull, lt } from 'drizzle-orm'
import { db } from '../db/index.js'
import { payments } from '../db/schema.js'
import { applySkipCashOutcome, expireStaleSkipCashIntent } from './paymentSettlement.js'
import { getSkipCashPayment, SkipCashStatus } from './skipcash.js'
import { logStructured } from '../utils/requestContext.js'

function reconcileAfterMinutes(): number {
  const n = Number(process.env.PAYMENT_RECONCILE_AFTER_MINUTES)
  return Number.isFinite(n) && n > 0 ? n : 10
}

/**
 * How long a SkipCash intent may sit unpaid before we give up on it locally.
 * Defaults above PAYMENT_HOLD_TTL_MINUTES (45) so the booking-hold job still
 * gets first refusal on checkout holds; this TTL is what finally terminates
 * invoice payments, which have no hold to expire.
 */
function intentTtlMinutes(): number {
  const n = Number(process.env.PAYMENT_INTENT_TTL_MINUTES)
  return Number.isFinite(n) && n > 0 ? n : 60
}

/**
 * How far back a locally-`failed` payment is still worth asking SkipCash
 * about. Its hosted payUrl stays payable after we abandon it, so the capture
 * can land long after we gave up — but not weeks later.
 */
const FAILED_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000

const BATCH_SIZE = 100

/**
 * Keyset cursor over `created_at`. A plain `ORDER BY created_at LIMIT 100`
 * would let the oldest rows — the recently-failed pool, which does not drain
 * the way `pending` does — starve everything behind them.
 */
let sweepCursor: Date | null = null

/** Test hook: forget where the last sweep stopped. */
export function resetReconcileCursor(): void {
  sweepCursor = null
}

/**
 * Safety net for lost/late webhooks (BUG-06 in the audit): any SkipCash
 * payment still `pending` after a few minutes is looked up directly at the
 * provider and settled through the exact same code path as the webhook.
 *
 * Recently-`failed` payments that still carry an external id are swept too:
 * four paths abandon a payment locally (checkout retry, invoice retry, intent
 * creation error, hold expiry) while its hosted payUrl is still live and
 * payable, and `applySkipCashOutcome` already knows how to flag money captured
 * against a locally-failed payment — it was just never reachable outside an
 * inbound webhook.
 */
export async function reconcilePendingSkipCashPayments(): Promise<number> {
  const now = Date.now()
  const cutoff = new Date(now - reconcileAfterMinutes() * 60 * 1000)
  const failedLookback = new Date(now - FAILED_LOOKBACK_MS)
  const expireBefore = new Date(now - intentTtlMinutes() * 60 * 1000)

  const filters = [
    inArray(payments.status, ['pending', 'failed'] as const),
    eq(payments.provider, 'skipcash'),
    eq(payments.needsRefund, false),
    isNotNull(payments.externalTransactionId),
    lt(payments.createdAt, cutoff),
    gt(payments.createdAt, failedLookback),
  ]
  if (sweepCursor) filters.push(gt(payments.createdAt, sweepCursor))

  const stuck = await db
    .select({
      id: payments.id,
      externalTransactionId: payments.externalTransactionId,
      status: payments.status,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .where(and(...filters))
    .orderBy(asc(payments.createdAt))
    .limit(BATCH_SIZE)

  // A short batch means we reached the end of the pool: wrap to the oldest row
  // again next sweep so nothing is left permanently behind the cursor.
  sweepCursor = stuck.length === BATCH_SIZE ? stuck[stuck.length - 1].createdAt : null

  let settled = 0
  for (const p of stuck) {
    try {
      const remote = await getSkipCashPayment(p.externalTransactionId!)
      if (!remote) continue
      if (remote.statusId === SkipCashStatus.NEW || remote.statusId === SkipCashStatus.PENDING) {
        // Still in flight at the provider. The hold-expiry job covers checkout
        // holds; this TTL is what terminates everything else.
        if (p.status === 'pending' && p.createdAt < expireBefore) {
          const expired = await expireStaleSkipCashIntent(p.id)
          if (expired.handled) {
            settled += 1
            logStructured('info', 'reconcile.intent_expired', { paymentId: p.id })
          }
        }
        continue
      }
      const result = await applySkipCashOutcome({
        paymentId: p.id,
        statusId: remote.statusId,
        // Provider-reported amount, when available, gets the same ±0.01 check.
        reportedAmount: remote.amount ?? null,
      })
      // 'already-processed' is the steady state for a swept `failed` row whose
      // provider status agrees with ours — nothing changed, so don't count it.
      if (result.handled && result.action !== 'already-processed') {
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
