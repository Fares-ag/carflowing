import { Router, type Request, type Response } from 'express'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { payments } from '../db/schema.js'
import { asyncHandler } from '../utils/http.js'
import { createBookingRequestForVehicle } from '../services/booking.js'
import { SkipCashStatus, verifySkipCashWebhookSignature, type SkipCashWebhookPayload } from '../services/skipcash.js'

export const skipcashWebhookRouter = Router()

function customerAppUrl(): string {
  return process.env.CUSTOMER_APP_URL || 'http://localhost:5173'
}

/**
 * SkipCash calls this for every transaction status change (and retries up to
 * 3 times over a day if we don't return 200). The booking request is only
 * created here, on confirmed payment, so a customer can never leave an unpaid
 * request for a dealer to see.
 */
export async function handleSkipCashWebhook(req: Request, res: Response): Promise<void> {
  const payload = req.body as SkipCashWebhookPayload
  const signature = req.header('authorization') ?? undefined
  if (!verifySkipCashWebhookSignature(payload, signature)) {
    res.status(401).json({ error: 'Invalid signature' })
    return
  }

  const transactionId = payload.TransactionId
  if (!transactionId) {
    res.status(200).json({ ok: true })
    return
  }

  const [payment] = await db.select().from(payments).where(eq(payments.id, transactionId)).limit(1)
  if (!payment) {
    // Nothing we can reconcile this against; acknowledge so SkipCash stops retrying.
    res.status(200).json({ ok: true })
    return
  }
  if (payment.status !== 'pending') {
    // Already processed by an earlier webhook call for this same payment.
    res.status(200).json({ ok: true })
    return
  }

  const expectedAmount = Number(payment.amount)
  const receivedAmount = Number(payload.Amount)
  if (
    !Number.isFinite(receivedAmount) ||
    Math.abs(expectedAmount - receivedAmount) > 0.01
  ) {
    console.error(
      `SkipCash amount mismatch for payment ${payment.id}: expected ${expectedAmount}, received ${payload.Amount}`
    )
    await db.update(payments).set({ status: 'failed' }).where(eq(payments.id, payment.id))
    res.status(200).json({ ok: true })
    return
  }

  if (payload.StatusId === SkipCashStatus.PAID) {
    const result = await createBookingRequestForVehicle({
      customerId: payment.customerId!,
      vehicleId: payment.vehicleId!,
      note: payment.note,
    })
    if (result.status === 201) {
      await db
        .update(payments)
        .set({ status: 'completed', bookingRequestId: (result.body as { id: string }).id })
        .where(eq(payments.id, payment.id))
    } else {
      // Vehicle became unavailable between intent creation and payment confirmation.
      // The customer already paid, so this needs manual admin follow-up/refund.
      console.error(
        `SkipCash payment ${payment.id} succeeded but booking could not be created: ${JSON.stringify(result.body)}`
      )
      await db
        .update(payments)
        .set({ status: 'failed', needsRefund: true })
        .where(eq(payments.id, payment.id))
    }
  } else if (
    payload.StatusId === SkipCashStatus.CANCELED ||
    payload.StatusId === SkipCashStatus.FAILED ||
    payload.StatusId === SkipCashStatus.REJECTED
  ) {
    await db.update(payments).set({ status: 'failed' }).where(eq(payments.id, payment.id))
  } else if (
    payload.StatusId === SkipCashStatus.REFUNDED ||
    payload.StatusId === SkipCashStatus.PENDING_REFUND ||
    payload.StatusId === SkipCashStatus.REFUND_FAILED
  ) {
    await db.update(payments).set({ status: 'refunded' }).where(eq(payments.id, payment.id))
  }
  // NEW / PENDING: transaction hasn't finished yet, leave the payment pending.

  res.status(200).json({ ok: true })
}

const skipCashWebhookHandler = asyncHandler(handleSkipCashWebhook)

skipcashWebhookRouter.post('/webhook', skipCashWebhookHandler)
/** Merchant portal default path (same handler as /webhook). */
skipcashWebhookRouter.post('/callback', skipCashWebhookHandler)

/**
 * Browser redirect target after the customer finishes on SkipCash's hosted
 * payment page. The webhook (server-to-server) is the source of truth for the
 * payment outcome, so this just hands off to the frontend to poll it.
 */
skipcashWebhookRouter.get('/return', (req, res) => {
  const paymentId = req.query.paymentId as string | undefined
  if (!paymentId) {
    res.redirect(302, `${customerAppUrl()}/cart`)
    return
  }
  res.redirect(302, `${customerAppUrl()}/payment-status?paymentId=${encodeURIComponent(paymentId)}`)
})
