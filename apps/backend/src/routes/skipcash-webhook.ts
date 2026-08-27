import { eq } from 'drizzle-orm'
import { Router, type Request, type Response } from 'express'
import { db } from '../db/index.js'
import { payments } from '../db/schema.js'
import { applySkipCashOutcome } from '../services/paymentSettlement.js'
import { persistSkipCashTokenForCustomer } from '../services/savedCardPayments.js'
import {
  SkipCashStatus,
  verifySkipCashWebhookSignature,
  type SkipCashWebhookPayload,
} from '../services/skipcash.js'
import { asyncHandler } from '../utils/http.js'
import { logStructured } from '../utils/requestContext.js'

export const skipcashWebhookRouter = Router()

function customerAppUrl(): string {
  return process.env.CUSTOMER_APP_URL || 'http://localhost:5173'
}

/**
 * SkipCash calls this for every transaction status change (and retries up to
 * 3 times over a day if we don't return 200). All state changes go through
 * applySkipCashOutcome, which row-locks the payment so duplicate or
 * concurrent deliveries can never double-process (audit BUG-11), and which is
 * shared with the reconciliation job so a lost webhook heals automatically.
 */
export async function handleSkipCashWebhook(req: Request, res: Response): Promise<void> {
  const payload = req.body as SkipCashWebhookPayload
  const signature = req.header('authorization') ?? undefined
  if (!verifySkipCashWebhookSignature(payload, signature)) {
    logStructured('warn', 'skipcash.webhook.signature_failed', {
      requestId: req.requestId,
      paymentId: payload.TransactionId,
    })
    res.status(401).json({ error: 'Invalid signature' })
    return
  }

  const transactionId = payload.TransactionId
  if (!transactionId) {
    res.status(200).json({ ok: true })
    return
  }

  const result = await applySkipCashOutcome({
    paymentId: transactionId,
    statusId: payload.StatusId,
    reportedAmount: payload.Amount ?? null,
  })
  logStructured('info', 'skipcash.webhook.settled', {
    requestId: req.requestId,
    paymentId: transactionId,
    action: result.action,
    statusId: payload.StatusId,
  })

  const tokenId = payload.TokenId?.trim()
  if (
    tokenId &&
    payload.StatusId === SkipCashStatus.PAID &&
    (result.action === 'invoice-paid' || result.action === 'booking-paid')
  ) {
    const [payment] = await db
      .select({ customerId: payments.customerId })
      .from(payments)
      .where(eq(payments.id, transactionId))
      .limit(1)
    if (payment?.customerId) {
      await persistSkipCashTokenForCustomer({
        userId: payment.customerId,
        tokenId,
        paymentId: transactionId,
      }).catch((err) => {
        logStructured('warn', 'skipcash.webhook.token_persist_failed', {
          requestId: req.requestId,
          paymentId: transactionId,
          error: err instanceof Error ? err.message : String(err),
        })
      })
    }
  }
  if (!result.handled) {
    // Nothing we can reconcile this against; acknowledge so SkipCash stops retrying.
    logStructured('warn', 'skipcash.webhook.unknown_payment', {
      requestId: req.requestId,
      paymentId: transactionId,
      action: result.action,
    })
  }

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
