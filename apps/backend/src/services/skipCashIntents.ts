import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { bookingRequests, invoices, payments, profiles, rentals, vehicles } from '../db/schema.js'
import { trackAnalyticsEventSafe } from './analyticsEvents.js'
import { logAuditSafe } from './audit.js'
import {
  computeFirstPaymentAmount,
  parseCartNote,
  sanitizeTermMonths,
  stripUntrustedPromoFields,
  validateCartStartDate,
} from './booking.js'
import { validatePromoCode } from './promoCodes.js'
import { createSkipCashPayment, SkipCashConfigError } from './skipcash.js'

export class SkipCashIntentError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

export interface ContactInput {
  firstName?: string
  lastName?: string
  phone?: string
  email?: string
}

function apiUrl(): string {
  return process.env.PUBLIC_API_URL || 'http://localhost:3001'
}

async function resolveContact(userId: string, contact: ContactInput | undefined) {
  const [user] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1)
  const [fallbackFirst, ...fallbackRest] = (user?.name ?? 'CarFlow Customer').trim().split(/\s+/)
  return {
    user,
    firstName: contact?.firstName?.trim() || fallbackFirst,
    lastName: contact?.lastName?.trim() || fallbackRest.join(' ') || 'Customer',
    phone: contact?.phone?.trim() || user?.phone || undefined,
    email: contact?.email?.trim() || user?.email,
  }
}

function parseContactFromNote(note: string | null | undefined): ContactInput | undefined {
  if (!note) return undefined
  try {
    const parsed = JSON.parse(note) as { contact?: ContactInput }
    return parsed?.contact && typeof parsed.contact === 'object' ? parsed.contact : undefined
  } catch {
    return undefined
  }
}

/** Starts SkipCash checkout for the first month of a subscription rental. */
export async function issueRentalSkipCashIntent(
  userId: string,
  vehicleId: string,
  note?: string | null,
  contact?: ContactInput
): Promise<{ paymentId: string; payUrl: string }> {
  const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1)
  if (!vehicle) {
    throw new SkipCashIntentError(404, 'Vehicle not found')
  }
  if (vehicle.status !== 'available') {
    throw new SkipCashIntentError(409, 'This vehicle is not currently available for booking')
  }

  let cart = stripUntrustedPromoFields(parseCartNote(note))
  const startDateError = validateCartStartDate(cart)
  if (startDateError) {
    throw new SkipCashIntentError(400, startDateError)
  }

  const { user, firstName, lastName, phone, email } = await resolveContact(userId, contact)
  if (!user?.emailVerifiedAt) {
    throw new SkipCashIntentError(403, 'Verify your email before paying online')
  }
  if (!phone || !email) {
    throw new SkipCashIntentError(400, 'A phone number and email are required for online payment')
  }

  // The hosted page must charge the same discounted monthly rate the customer
  // was quoted, so the term comes from the SANITIZED cart, never raw input.
  const termMonths = sanitizeTermMonths(cart.durationMonths)
  let amount = computeFirstPaymentAmount(Number(vehicle.pricePerDay), termMonths)
  const listMonthlyAmount = amount
  if (contact && Object.keys(contact).length > 0) {
    cart = { ...cart, contact }
  }
  if (cart.promo?.code) {
    const promoCheck = await validatePromoCode({
      code: cart.promo.code,
      customerId: userId,
      termMonths,
      subtotal: listMonthlyAmount,
    })
    if (promoCheck.valid && promoCheck.discountAmount) {
      amount = Math.max(0.01, Math.round((amount - promoCheck.discountAmount) * 100) / 100)
      cart = {
        ...cart,
        promo: {
          code: promoCheck.code,
          promoCodeId: promoCheck.promoCodeId,
          discountAmount: promoCheck.discountAmount,
          listMonthlyAmount,
        },
      }
    } else {
      const { promo: _dropped, ...rest } = cart
      cart = rest
    }
  }
  const cartNote = Object.keys(cart).length > 0 ? JSON.stringify(cart) : null

  let bookingRequestId: string
  const [existingHold] = await db
    .select()
    .from(bookingRequests)
    .where(and(eq(bookingRequests.vehicleId, vehicleId), eq(bookingRequests.status, 'pending')))
    .limit(1)
  if (existingHold) {
    const ownHold = existingHold.customerId === userId && existingHold.awaitingPayment
    if (!ownHold) {
      throw new SkipCashIntentError(409, 'This vehicle already has a pending booking request')
    }
    bookingRequestId = existingHold.id
    await db
      .update(bookingRequests)
      .set({ note: cartNote || existingHold.note })
      .where(eq(bookingRequests.id, existingHold.id))
    await db
      .update(payments)
      .set({ status: 'failed' })
      .where(and(eq(payments.bookingRequestId, existingHold.id), eq(payments.status, 'pending')))
  } else {
    try {
      const [hold] = await db
        .insert(bookingRequests)
        .values({
          customerId: userId,
          vehicleId,
          note: cartNote,
          awaitingPayment: true,
        })
        .returning()
      bookingRequestId = hold.id
      trackAnalyticsEventSafe({
        eventType: 'booking_created',
        userId,
        entityType: 'booking_request',
        entityId: hold.id,
        properties: {
          vehicleId,
          dealerId: vehicle.dealerId,
          awaitingPayment: true,
        },
      })
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new SkipCashIntentError(409, 'This vehicle already has a pending booking request')
      }
      throw err
    }
  }

  let payment
  try {
    [payment] = await db
      .insert(payments)
      .values({
        customerId: userId,
        dealerId: vehicle.dealerId,
        vehicleId,
        bookingRequestId,
        note: cartNote,
        amount: String(amount),
        status: 'pending',
        type: 'rental',
        method: 'card',
        provider: 'skipcash',
      })
      .returning()
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      throw new SkipCashIntentError(
        409,
        'A payment for this booking is already in progress. Complete or retry it in a moment.'
      )
    }
    throw err
  }

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
    await db
      .update(payments)
      .set({ externalTransactionId: result.id })
      .where(eq(payments.id, payment.id))
    return { paymentId: payment.id, payUrl: result.payUrl }
  } catch (err) {
    await db.update(payments).set({ status: 'failed' }).where(eq(payments.id, payment.id))
    const [otherPending] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.bookingRequestId, bookingRequestId), eq(payments.status, 'pending')))
      .limit(1)
    if (!otherPending) {
      await db
        .update(bookingRequests)
        .set({
          status: 'declined',
          declineReason: 'Online payment could not be started',
          awaitingPayment: false,
        })
        .where(
          and(
            eq(bookingRequests.id, bookingRequestId),
            eq(bookingRequests.status, 'pending'),
            eq(bookingRequests.awaitingPayment, true)
          )
        )
    }
    const message =
      err instanceof SkipCashConfigError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Unable to start online payment'
    throw new SkipCashIntentError(502, message)
  }
}

/** Starts SkipCash checkout for a due/overdue subscription invoice. */
export async function issueInvoiceSkipCashIntent(
  userId: string,
  invoiceId: string
): Promise<{ paymentId: string; payUrl: string }> {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(
      and(eq(invoices.id, invoiceId), eq(invoices.ownerId, userId), eq(invoices.ownerType, 'customer'))
    )
    .limit(1)
  if (!invoice) {
    throw new SkipCashIntentError(404, 'Invoice not found')
  }
  if (invoice.status !== 'due' && invoice.status !== 'overdue') {
    throw new SkipCashIntentError(409, `Invoice is ${invoice.status}; nothing to pay`)
  }

  const { user, firstName, lastName, phone, email } = await resolveContact(userId, undefined)
  if (!user?.emailVerifiedAt) {
    throw new SkipCashIntentError(403, 'Verify your email before paying online')
  }
  if (!phone || !email) {
    throw new SkipCashIntentError(400, 'A phone number and email are required for online payment')
  }

  let rentalDealerId: string | null = null
  if (invoice.rentalId) {
    const [rental] = await db
      .select({ dealerId: rentals.dealerId })
      .from(rentals)
      .where(eq(rentals.id, invoice.rentalId))
      .limit(1)
    rentalDealerId = rental?.dealerId ?? null
  }

  const amount = Number(invoice.amount)
  await db
    .update(payments)
    .set({ status: 'failed' })
    .where(and(eq(payments.invoiceId, invoice.id), eq(payments.status, 'pending')))

  let payment
  try {
    [payment] = await db
      .insert(payments)
      .values({
        customerId: userId,
        dealerId: rentalDealerId,
        rentalId: invoice.rentalId,
        invoiceId: invoice.id,
        amount: String(amount),
        status: 'pending',
        type: 'subscription',
        method: 'card',
        provider: 'skipcash',
      })
      .returning()
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      throw new SkipCashIntentError(
        409,
        'A payment for this invoice is already in progress. Try again in a moment.'
      )
    }
    throw err
  }

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
    await db
      .update(payments)
      .set({ externalTransactionId: result.id })
      .where(eq(payments.id, payment.id))
    await logAuditSafe({
      actorId: userId,
      actorRole: 'customer',
      action: 'billing.invoice.payment_started',
      entityType: 'invoice',
      entityId: invoice.id,
    })
    return { paymentId: payment.id, payUrl: result.payUrl }
  } catch (err) {
    await db.update(payments).set({ status: 'failed' }).where(eq(payments.id, payment.id))
    const message =
      err instanceof SkipCashConfigError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Unable to start online payment'
    throw new SkipCashIntentError(502, message)
  }
}

/**
 * Re-issue SkipCash for a failed or abandoned attempt, reusing the booking hold
 * or invoice when still valid. Does not create duplicate pending payments.
 */
export async function retrySkipCashPayment(
  userId: string,
  paymentId: string
): Promise<{ paymentId: string; payUrl: string }> {
  const [original] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.id, paymentId), eq(payments.customerId, userId)))
    .limit(1)
  if (!original) {
    throw new SkipCashIntentError(404, 'Payment not found')
  }
  if (original.status === 'completed') {
    throw new SkipCashIntentError(409, 'This payment has already completed')
  }
  if (original.status === 'refunded') {
    throw new SkipCashIntentError(409, 'This payment was refunded')
  }

  if (original.status === 'pending') {
    await db.update(payments).set({ status: 'failed' }).where(eq(payments.id, original.id))
  }

  if (original.type === 'subscription' && original.invoiceId) {
    return issueInvoiceSkipCashIntent(userId, original.invoiceId)
  }

  if (original.vehicleId) {
    return issueRentalSkipCashIntent(
      userId,
      original.vehicleId,
      original.note,
      parseContactFromNote(original.note)
    )
  }

  throw new SkipCashIntentError(400, 'This payment cannot be retried')
}

export function paymentCanRetry(status: string, type: string): boolean {
  if (status === 'completed' || status === 'refunded') return false
  return type === 'rental' || type === 'subscription'
}
