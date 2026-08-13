import { Router } from 'express'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { payments, profiles, vehicles } from '../db/schema.js'
import { mapPayment } from '../db/mappers.js'
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js'
import { asyncHandler } from '../utils/http.js'
import { createSkipCashPayment, SkipCashConfigError } from '../services/skipcash.js'
import { parseCartNote, computeServerRentalAmount } from '../services/booking.js'

export const paymentsRouter = Router()

function apiUrl(): string {
  return process.env.PUBLIC_API_URL || 'http://localhost:3001'
}

/**
 * Starts an online payment for a vehicle the customer hasn't booked yet. The
 * booking request itself is only created once the SkipCash webhook confirms
 * payment (see skipcash-webhook.ts) — this prevents unpaid requests reaching
 * dealers, matching the "pay online" flow described in the alignment plan.
 */
paymentsRouter.post(
  '/skipcash/create-intent',
  requireAuth,
  requireRole('customer'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { vehicleId, note, contact } = req.body as {
      vehicleId?: string
      note?: string
      contact?: { firstName?: string; lastName?: string; phone?: string; email?: string }
    }
    if (!vehicleId) {
      res.status(400).json({ error: 'vehicleId required' })
      return
    }
    const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1)
    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' })
      return
    }
    if (vehicle.status !== 'available') {
      res.status(409).json({ error: 'This vehicle is not currently available for booking' })
      return
    }

    const [user] = await db.select().from(profiles).where(eq(profiles.id, req.user!.sub)).limit(1)
    if (!user?.emailVerifiedAt) {
      res.status(403).json({ error: 'Verify your email before paying online' })
      return
    }

    const cart = parseCartNote(note)
    const amount = computeServerRentalAmount(Number(vehicle.pricePerDay), cart)

    const [fallbackFirst, ...fallbackRest] = (user?.name ?? 'CarFlow Customer').trim().split(/\s+/)
    const firstName = contact?.firstName?.trim() || fallbackFirst
    const lastName = contact?.lastName?.trim() || fallbackRest.join(' ') || 'Customer'
    const phone = contact?.phone?.trim() || user?.phone || undefined
    const email = contact?.email?.trim() || user?.email

    if (!phone || !email) {
      res.status(400).json({ error: 'A phone number and email are required for online payment' })
      return
    }

    const [payment] = await db
      .insert(payments)
      .values({
        customerId: req.user!.sub,
        dealerId: vehicle.dealerId,
        vehicleId,
        note: note || null,
        amount: String(amount),
        status: 'pending',
        type: 'rental',
        method: 'card',
        provider: 'skipcash',
      })
      .returning()

    try {
      const result = await createSkipCashPayment({
        amount,
        firstName,
        lastName,
        phone,
        email,
        transactionId: payment.id,
        returnUrl: `${apiUrl()}/skipcash-pay/return?paymentId=${payment.id}`,
        webhookUrl: `${apiUrl()}/skipcash-pay/callback`,
      })
      await db.update(payments).set({ externalTransactionId: result.id }).where(eq(payments.id, payment.id))
      res.status(201).json({ paymentId: payment.id, payUrl: result.payUrl })
    } catch (err) {
      await db.update(payments).set({ status: 'failed' }).where(eq(payments.id, payment.id))
      const message =
        err instanceof SkipCashConfigError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Unable to start online payment'
      res.status(502).json({ error: message })
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
    res.json(mapPayment(row))
  })
)
