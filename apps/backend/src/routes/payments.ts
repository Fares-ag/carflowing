import { and, eq } from 'drizzle-orm'
import { Router } from 'express'
import { db } from '../db/index.js'
import { mapPayment } from '../db/mappers.js'
import { payments } from '../db/schema.js'
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js'
import { requireCheckoutEnabled, requireOnlinePaymentsEnabled } from '../middleware/featureFlags.js'
import {
  issueInvoiceSkipCashIntent,
  issueRentalSkipCashIntent,
  paymentCanRetry,
  retrySkipCashPayment,
  SkipCashIntentError,
  type ContactInput,
} from '../services/skipCashIntents.js'
import { issueInvoiceSkipCashIntentWithSavedCard } from '../services/savedCardPayments.js'
import { asyncHandler, attachUuidParamGuard } from '../utils/http.js'

export const paymentsRouter = Router()
attachUuidParamGuard(paymentsRouter)

function handleIntentError(res: Parameters<Parameters<typeof asyncHandler>[0]>[1], err: unknown): boolean {
  if (err instanceof SkipCashIntentError) {
    res.status(err.status).json({ error: err.message })
    return true
  }
  return false
}

/**
 * Starts an online payment for the FIRST MONTH of a subscription
 * (invygo/FINN-style: you pay monthly, not the whole term upfront).
 *
 * The vehicle is held immediately by creating the booking request up front
 * with `awaitingPayment = true` (audit BUG-05: two customers can no longer
 * both pay for the same car — the second hold is rejected by the DB before
 * any money moves). The webhook flips the hold into a visible request; the
 * hold-expiry job releases abandoned checkouts.
 */
paymentsRouter.post(
  '/skipcash/create-intent',
  requireAuth,
  requireRole('customer'),
  requireOnlinePaymentsEnabled,
  requireCheckoutEnabled,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { vehicleId, note, contact } = req.body as {
      vehicleId?: string
      note?: string
      contact?: ContactInput
    }
    if (!vehicleId) {
      res.status(400).json({ error: 'vehicleId required' })
      return
    }
    try {
      const result = await issueRentalSkipCashIntent(req.user!.sub, vehicleId, note, contact)
      res.status(201).json(result)
    } catch (err) {
      if (handleIntentError(res, err)) return
      throw err
    }
  })
)

/**
 * Starts an online payment for a monthly subscription invoice (renewals).
 * The webhook settles the invoice and restores past_due subscriptions.
 */
paymentsRouter.post(
  '/skipcash/invoice-intent',
  requireAuth,
  requireRole('customer'),
  requireOnlinePaymentsEnabled,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { invoiceId } = req.body as { invoiceId?: string }
    if (!invoiceId) {
      res.status(400).json({ error: 'invoiceId required' })
      return
    }
    try {
      const result = await issueInvoiceSkipCashIntent(req.user!.sub, invoiceId)
      res.status(201).json(result)
    } catch (err) {
      if (handleIntentError(res, err)) return
      throw err
    }
  })
)

/**
 * Starts invoice payment using a saved SkipCash token when the capability flag
 * is on. Falls back to hosted redirect while token charge remains stubbed.
 */
paymentsRouter.post(
  '/skipcash/invoice-intent-saved-card',
  requireAuth,
  requireRole('customer'),
  requireOnlinePaymentsEnabled,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { invoiceId, paymentMethodId } = req.body as {
      invoiceId?: string
      paymentMethodId?: string
    }
    if (!invoiceId || !paymentMethodId) {
      res.status(400).json({ error: 'invoiceId and paymentMethodId required' })
      return
    }
    try {
      const result = await issueInvoiceSkipCashIntentWithSavedCard(
        req.user!.sub,
        invoiceId,
        paymentMethodId
      )
      res.status(201).json(result)
    } catch (err) {
      if (handleIntentError(res, err)) return
      throw err
    }
  })
)

/**
 * Retry a failed or timed-out SkipCash attempt without re-entering checkout/KYC.
 * Reuses the customer's booking hold or open invoice; abandons stale pending rows.
 */
paymentsRouter.post(
  '/skipcash/retry/:id',
  requireAuth,
  requireRole('customer'),
  requireOnlinePaymentsEnabled,
  asyncHandler(async (req: AuthedRequest, res) => {
    try {
      const result = await retrySkipCashPayment(req.user!.sub, req.params.id)
      res.status(201).json(result)
    } catch (err) {
      if (handleIntentError(res, err)) return
      throw err
    }
  })
)

paymentsRouter.get(
  '/skipcash/status/:id',
  requireAuth,
  requireRole('customer'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const [row] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.id, req.params.id), eq(payments.customerId, req.user!.sub)))
      .limit(1)
    if (!row) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const mapped = mapPayment(row)
    res.json({
      ...mapped,
      canRetry: paymentCanRetry(mapped.status, mapped.type),
    })
  })
)
