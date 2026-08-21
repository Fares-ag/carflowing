import { and, desc, eq } from 'drizzle-orm'
import { deliveryToCartFields, type CheckoutDeliveryInput } from '@carflow/shared/validation'
import { db } from '../db/index.js'
import { mapBookingRequest } from '../db/mappers.js'
import { bookingRequests, payments, profiles, rentals, vehicles } from '../db/schema.js'
import { addMonths, todayISO } from '../utils/dates.js'
import { logAudit } from './audit.js'
import { trackAnalyticsEvent } from './analyticsEvents.js'
import { areCheckoutEnabled } from './appSettings.js'
import { createFirstInvoice } from './billing.js'
import { adjustDealerActiveRentals, recordCustomerRentalStarted } from './counters.js'
import { sendBookingConfirmationEmail, sendBookingDeclinedEmail } from './mail.js'
import { notifyUser } from './notify.js'

export interface CheckoutCartNote {
  durationMonths?: number
  startDate?: string
  total?: number
  delivery?: { location?: string; date?: string; time?: string; mode?: string }
  contact?: {
    firstName?: string
    lastName?: string
    phone?: string
    email?: string
  }
  promo?: {
    code?: string
    promoCodeId?: string
    discountAmount?: number
    listMonthlyAmount?: number
  }
}

/** Checkout writes the cart as JSON into `booking_requests.note`; older/manual
 * requests may have a plain-text note instead, so parsing failures are expected. */
export function parseCartNote(note: string | null | undefined): CheckoutCartNote {
  if (!note) return {}
  try {
    const parsed = JSON.parse(note)
    return parsed && typeof parsed === 'object' ? (parsed as CheckoutCartNote) : {}
  } catch {
    return {}
  }
}

const MAX_TERM_MONTHS = 24

export function sanitizeTermMonths(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(Math.floor(n), MAX_TERM_MONTHS)
}

export function computeRentalWindow(cart: CheckoutCartNote): { startDate: string; termMonths: number; endDate: string } {
  const today = todayISO()
  let startDate = today
  if (cart.startDate) {
    const raw = String(cart.startDate).trim()
    const iso =
      /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : new Date(raw).toISOString().slice(0, 10)
    if (!Number.isNaN(Date.parse(`${iso}T00:00:00Z`))) {
      // A subscription can't start in the past; cap how far out it can start.
      if (iso >= today && iso <= addMonths(today, 3)) startDate = iso
    }
  }
  const termMonths = sanitizeTermMonths(cart.durationMonths)
  return { startDate, termMonths, endDate: addMonths(startDate, termMonths) }
}

/** Server-authoritative monthly price; never trust client cart totals. */
export function computeMonthlyAmount(pricePerDay: number): number {
  return Number(pricePerDay) * 30
}

/** Server-authoritative rental charge; never trust client cart.total for payments. */
export function computeServerRentalAmount(pricePerDay: number, cart: CheckoutCartNote): number {
  return computeMonthlyAmount(pricePerDay) * sanitizeTermMonths(cart.durationMonths)
}

/** First charge for the pay-online flow: the first month, invygo-style. */
export function computeFirstPaymentAmount(pricePerDay: number): number {
  return computeMonthlyAmount(pricePerDay)
}

function normalizeDelivery(cart: CheckoutCartNote) {
  const raw = cart.delivery
  if (!raw) return undefined
  if (raw.mode === 'delivery' || raw.mode === 'dealer_pickup') {
    return deliveryToCartFields(raw as CheckoutDeliveryInput)
  }
  return raw
}

export interface TransitionResult {
  status: number
  body: { error: string; unavailable?: boolean } | ReturnType<typeof mapBookingRequest>
}

/**
 * Shared by the "pay at shop" booking-request endpoint and the online-payment
 * hold. Rejects vehicles that are no longer available and relies on the
 * DB-level unique partial index to reject a second pending request for the
 * same vehicle under concurrency.
 */
export async function createBookingRequestForVehicle(params: {
  customerId: string
  vehicleId: string
  note?: string | null
  awaitingPayment?: boolean
}): Promise<TransitionResult> {
  if (!(await areCheckoutEnabled())) {
    return { status: 503, body: { error: 'Checkout is temporarily unavailable', unavailable: true } }
  }
  const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, params.vehicleId)).limit(1)
  if (!vehicle) {
    return { status: 404, body: { error: 'Vehicle not found' } }
  }
  if (vehicle.status !== 'available') {
    return { status: 409, body: { error: 'This vehicle is not currently available for booking' } }
  }
  try {
    const [row] = await db
      .insert(bookingRequests)
      .values({
        customerId: params.customerId,
        vehicleId: params.vehicleId,
        note: params.note || null,
        awaitingPayment: params.awaitingPayment ?? false,
      })
      .returning()
    await trackAnalyticsEvent(db, {
      eventType: 'booking_created',
      userId: params.customerId,
      entityType: 'booking_request',
      entityId: row.id,
      properties: {
        vehicleId: params.vehicleId,
        dealerId: vehicle.dealerId,
        awaitingPayment: params.awaitingPayment ?? false,
      },
    })
    if (!params.awaitingPayment) {
      const { notifyDealerOwner } = await import('./notify.js')
      await notifyDealerOwner(db, vehicle.dealerId, {
        type: 'info',
        title: 'New booking request',
        message: 'A customer requested one of your vehicles. Review it in Booking Requests.',
      }).catch(() => undefined)
    }
    return { status: 201, body: mapBookingRequest(row) }
  } catch (err) {
    const pgCode =
      (err as { cause?: { code?: string } }).cause?.code ?? (err as { code?: string }).code
    if (pgCode === '23505') {
      return { status: 409, body: { error: 'This vehicle already has a pending booking request' } }
    }
    throw err
  }
}

/**
 * Approves or declines a booking request inside a row-locked transaction so
 * concurrent dealer/admin approvals can't both create a rental. Approving is
 * idempotent: re-approving an already-approved request returns the existing
 * booking request instead of inserting a second rental.
 *
 * Approval creates the subscription: a rental with a monthly price and a
 * billing anchor, plus its first invoice — born `paid` and linked when the
 * customer already paid online (fixes audit BUG-01), `due` for pay-at-shop.
 */
export async function transitionBookingRequest(params: {
  bookingRequestId: string
  status: 'approved' | 'declined'
  declineReason?: string
  /** Restricts the lookup to a single dealer's vehicles; omitted for admin. */
  scopeDealerId?: string
  /** Who performed the transition (for the audit trail). */
  actor?: { id: string; role: 'dealer' | 'admin' }
}): Promise<TransitionResult> {
  const { bookingRequestId, status, declineReason, scopeDealerId, actor } = params

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ br: bookingRequests, vehicle: vehicles })
      .from(bookingRequests)
      .innerJoin(vehicles, eq(bookingRequests.vehicleId, vehicles.id))
      .where(
        scopeDealerId
          ? and(eq(bookingRequests.id, bookingRequestId), eq(vehicles.dealerId, scopeDealerId))
          : eq(bookingRequests.id, bookingRequestId)
      )
      .for('update')
      .limit(1)

    if (!existing) {
      return { status: 404, body: { error: 'Not found' } }
    }

    if (existing.br.status !== 'pending') {
      // Already approved/declined: return the current state rather than
      // re-running side effects (idempotent under concurrent approvals).
      return { status: 200, body: mapBookingRequest(existing.br) }
    }

    if (status === 'declined') {
      const [row] = await tx
        .update(bookingRequests)
        .set({
          status: 'declined',
          awaitingPayment: false,
          ...(declineReason !== undefined ? { declineReason } : {}),
        })
        .where(eq(bookingRequests.id, bookingRequestId))
        .returning()
      // Money already taken online must not be silently dropped.
      await tx
        .update(payments)
        .set({ needsRefund: true })
        .where(and(eq(payments.bookingRequestId, bookingRequestId), eq(payments.status, 'completed')))
      // And in-flight attempts die with the request, so they can't linger in
      // the reconciliation set forever (re-audit F13).
      await tx
        .update(payments)
        .set({ status: 'failed' })
        .where(and(eq(payments.bookingRequestId, bookingRequestId), eq(payments.status, 'pending')))
      await notifyUser(tx, {
        userId: existing.br.customerId,
        type: 'warning',
        title: 'Booking request declined',
        message: declineReason
          ? `Your booking request was declined: ${declineReason}`
          : 'Your booking request was declined.',
      })
      const [customer] = await tx
        .select({ email: profiles.email, name: profiles.name })
        .from(profiles)
        .where(eq(profiles.id, existing.br.customerId))
        .limit(1)
      const vehicleName = `${existing.vehicle.year} ${existing.vehicle.make} ${existing.vehicle.model}`
      if (customer?.email) {
        void sendBookingDeclinedEmail({
          to: customer.email,
          customerName: customer.name,
          vehicleName,
          declineReason,
        }).catch((err) => console.error('Booking declined email failed:', err))
      }
      if (actor) {
        await logAudit(tx, {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'booking.decline',
          entityType: 'booking_request',
          entityId: bookingRequestId,
          note: declineReason ?? null,
        })
      }
      return { status: 200, body: mapBookingRequest(row) }
    }

    // --- Approval path ---
    if (existing.br.awaitingPayment) {
      return { status: 409, body: { error: 'Online payment for this request has not completed yet' } }
    }
    if (existing.vehicle.status !== 'available') {
      return {
        status: 409,
        body: { error: `Vehicle is not available (currently ${existing.vehicle.status})` },
      }
    }

    const cart = parseCartNote(existing.br.note)
    const { startDate, termMonths, endDate } = computeRentalWindow(cart)
    const delivery = normalizeDelivery(cart)

    // A completed online payment for this request pays the first month.
    const [onlinePayment] = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.bookingRequestId, bookingRequestId), eq(payments.status, 'completed')))
      .orderBy(desc(payments.createdAt))
      .limit(1)

    // List price drives renewals; lock to checkout-time list when known.
    let listedMonthly = computeMonthlyAmount(Number(existing.vehicle.pricePerDay))
    if (cart.promo?.listMonthlyAmount != null) {
      listedMonthly = cart.promo.listMonthlyAmount
    } else if (onlinePayment) {
      listedMonthly = Number(onlinePayment.amount)
    }
    const monthlyAmount = listedMonthly
    const totalAmount = listedMonthly * termMonths

    let firstInvoiceAmount = listedMonthly
    if (onlinePayment) {
      firstInvoiceAmount = Number(onlinePayment.amount)
    } else if (cart.promo?.discountAmount) {
      firstInvoiceAmount = Math.max(0.01, listedMonthly - cart.promo.discountAmount)
    }

    if (onlinePayment && Math.abs(firstInvoiceAmount - listedMonthly) > 0.01 && actor) {
      await logAudit(tx, {
        actorId: actor.id,
        actorRole: actor.role,
        action: 'booking.approve.promo_first_month',
        entityType: 'booking_request',
        entityId: bookingRequestId,
        before: { listedMonthly: String(listedMonthly) },
        after: { firstInvoiceAmount: String(firstInvoiceAmount) },
      })
    }

    const [row] = await tx
      .update(bookingRequests)
      .set({ status: 'approved' })
      .where(eq(bookingRequests.id, bookingRequestId))
      .returning()

    const [rental] = await tx
      .insert(rentals)
      .values({
        customerId: existing.br.customerId,
        dealerId: existing.vehicle.dealerId,
        vehicleId: existing.br.vehicleId,
        bookingRequestId,
        startDate,
        endDate,
        status: 'reserved',
        totalAmount: String(totalAmount),
        monthlyAmount: String(monthlyAmount),
        termMonths,
        nextBillingDate: addMonths(startDate, 1),
        paymentStatus: onlinePayment ? 'completed' : 'pending',
        pickupLocation: delivery?.location ?? null,
        pickupDate: delivery?.date ?? startDate,
        pickupTime: delivery?.time ?? null,
      })
      .returning()

    await createFirstInvoice(tx, {
      rentalId: rental.id,
      customerId: existing.br.customerId,
      monthlyAmount: listedMonthly,
      chargeAmount: firstInvoiceAmount,
      periodStart: startDate,
      paidByPaymentId: onlinePayment?.id ?? null,
    })

    await tx.update(vehicles).set({ status: 'rented' }).where(eq(vehicles.id, existing.br.vehicleId))

    await recordCustomerRentalStarted(tx, existing.br.customerId)
    await adjustDealerActiveRentals(tx, existing.vehicle.dealerId, 1)

    const [customer] = await tx
      .select({ email: profiles.email, name: profiles.name })
      .from(profiles)
      .where(eq(profiles.id, existing.br.customerId))
      .limit(1)

    await notifyUser(tx, {
      userId: existing.br.customerId,
      type: 'success',
      title: 'Booking approved',
      message: onlinePayment
        ? 'Your booking was approved and your first month is already paid. The dealer will arrange handover.'
        : `Your booking was approved. First monthly payment of QAR ${monthlyAmount.toFixed(2)} is due at pickup.`,
    })
    if (actor) {
      await logAudit(tx, {
        actorId: actor.id,
        actorRole: actor.role,
        action: 'booking.approve',
        entityType: 'rental',
        entityId: rental.id,
        after: {
          bookingRequestId,
          vehicleId: existing.br.vehicleId,
          monthlyAmount: String(monthlyAmount),
          termMonths,
          firstInvoicePaid: !!onlinePayment,
        },
      })
    }

    const approvalLatencyMs = Date.now() - existing.br.createdAt.getTime()
    await trackAnalyticsEvent(tx, {
      eventType: 'booking_approved',
      userId: existing.br.customerId,
      entityType: 'booking_request',
      entityId: bookingRequestId,
      properties: {
        rentalId: rental.id,
        vehicleId: existing.br.vehicleId,
        dealerId: existing.vehicle.dealerId,
        approvalLatencyMs,
      },
    })

    const vehicleName = `${existing.vehicle.year} ${existing.vehicle.make} ${existing.vehicle.model}`
    if (customer?.email) {
      void sendBookingConfirmationEmail({
        to: customer.email,
        customerName: customer.name,
        vehicleName,
        startDate,
        endDate,
        totalPrice: monthlyAmount,
      }).catch((err) => console.error('Booking confirmation email failed:', err))
    }

    return { status: 200, body: mapBookingRequest(row) }
  })
}
