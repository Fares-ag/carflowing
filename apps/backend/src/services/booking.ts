import { and, desc, eq } from 'drizzle-orm'
import { deliveryToCartFields, type CheckoutDeliveryInput } from '@carflow/shared/validation'
import { db } from '../db/index.js'
import { mapBookingRequest } from '../db/mappers.js'
import { bookingRequests, payments, profiles, rentals, vehicles } from '../db/schema.js'
import { addDays, addMonths, todayISO } from '../utils/dates.js'
import { logAudit, type DbOrTx } from './audit.js'
import { trackAnalyticsEvent } from './analyticsEvents.js'
import { areCheckoutEnabled } from './appSettings.js'
import { createFirstInvoice } from './billing.js'
import { adjustDealerActiveRentals, recordCustomerRentalStarted } from './counters.js'
import { dispatchCustomerTransactionalChannelsSafe } from './customerNotifications.js'
import { sendBookingDeclinedEmail } from './mail.js'
import { notifyUser } from './notify.js'
import { redeemPromoCode, validatePromoCode } from './promoCodes.js'

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

/**
 * Drop client-supplied promo amounts/ids. Only a promo *code* may persist;
 * discount math is always recomputed server-side.
 */
export function stripUntrustedPromoFields(cart: CheckoutCartNote): CheckoutCartNote {
  const code = typeof cart.promo?.code === 'string' ? cart.promo.code.trim() : ''
  if (!code) {
    const { promo: _ignored, ...rest } = cart
    return rest
  }
  return { ...cart, promo: { code } }
}

/** Persist only a promo code from checkout JSON; leave plain-text notes alone. */
export function sanitizeCartNoteForPersist(note: string | null | undefined): string | null {
  if (!note) return note ?? null
  try {
    const parsed = JSON.parse(note)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return note
    const sanitized = stripUntrustedPromoFields(parsed as CheckoutCartNote)
    return JSON.stringify(sanitized)
  } catch {
    return note
  }
}

async function resolveApprovalPricing(params: {
  pricePerDay: number
  cart: CheckoutCartNote
  customerId: string
  termMonths: number
  onlinePaymentAmount?: number
}): Promise<{
  listedMonthly: number
  firstInvoiceAmount: number
  /** Set only when the discount still has to be redeemed (pay-at-shop). */
  promo?: { promoCodeId: string; discountAmount: number }
}> {
  const listedMonthly = computeMonthlyAmount(params.pricePerDay, params.termMonths)
  const promoCode = typeof params.cart.promo?.code === 'string' ? params.cart.promo.code.trim() : ''
  let promoDiscount = 0
  let promoCodeId: string | undefined
  if (promoCode) {
    const promoCheck = await validatePromoCode({
      code: promoCode,
      customerId: params.customerId,
      termMonths: params.termMonths,
      subtotal: listedMonthly,
    })
    if (promoCheck.valid && promoCheck.discountAmount) {
      promoDiscount = promoCheck.discountAmount
      promoCodeId = promoCheck.promoCodeId
    }
  }

  if (params.onlinePaymentAmount != null) {
    const firstInvoiceAmount = params.onlinePaymentAmount
    // Without a promo at all, the captured amount IS the checkout list price,
    // so honouring it protects the customer from a pre-approval price hike.
    //
    // A promo in the note is different: the webhook already recorded its
    // redemption before approval could run, so the re-validation above fails on
    // the per-customer limit and promoDiscount is 0 even though the capture was
    // discounted. Inferring the recurring price from it would bill the
    // first-month discount forever.
    if (promoDiscount <= 0 && !promoCode) {
      return { listedMonthly: firstInvoiceAmount, firstInvoiceAmount }
    }
    return { listedMonthly, firstInvoiceAmount }
  }

  const firstInvoiceAmount =
    promoDiscount > 0 ? Math.max(0.01, listedMonthly - promoDiscount) : listedMonthly
  return {
    listedMonthly,
    firstInvoiceAmount,
    promo:
      promoCodeId && promoDiscount > 0
        ? { promoCodeId, discountAmount: promoDiscount }
        : undefined,
  }
}

async function failBookingPayments(tx: DbOrTx, bookingRequestId: string) {
  await tx
    .update(payments)
    .set({ needsRefund: true })
    .where(and(eq(payments.bookingRequestId, bookingRequestId), eq(payments.status, 'completed')))
  await tx
    .update(payments)
    .set({ status: 'failed' })
    .where(and(eq(payments.bookingRequestId, bookingRequestId), eq(payments.status, 'pending')))
}

const MAX_TERM_MONTHS = 24

export function sanitizeTermMonths(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(Math.floor(n), MAX_TERM_MONTHS)
}

/** How far ahead of today a subscription may be scheduled to start. */
export const MAX_START_DATE_DAYS_AHEAD = 90

/**
 * One day of slack on the past side. The cart picks "today" in the browser's
 * timezone while the server bills in Asia/Qatar, so a legitimate checkout can
 * carry yesterday's date across a midnight/offset boundary. Anything inside
 * the grace is still anchored to today by computeRentalWindow.
 */
export const START_DATE_PAST_GRACE_DAYS = 1

/** Normalises a cart start date to `YYYY-MM-DD`, or null when unparseable. */
function normalizeStartDate(raw: string): string | null {
  const trimmed = String(raw).trim()
  if (!trimmed) return null
  let iso = trimmed
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(trimmed)
    if (Number.isNaN(parsed.getTime())) return null
    iso = parsed.toISOString().slice(0, 10)
  }
  return Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ? null : iso
}

/**
 * Rejects an out-of-range checkout start date at booking-CREATE time.
 *
 * Approval used to silently clamp anything outside the window to today, so a
 * customer who picked a date six months out was handed a different contract
 * than the one they agreed to — and billed for it immediately. Returns the
 * error message to surface (400), or null when the date is acceptable.
 */
export function validateCartStartDate(
  cart: CheckoutCartNote,
  today = todayISO()
): string | null {
  if (cart.startDate === undefined || cart.startDate === null) return null
  const raw = String(cart.startDate).trim()
  if (!raw) return null
  const latest = addDays(today, MAX_START_DATE_DAYS_AHEAD)
  const iso = normalizeStartDate(raw)
  if (!iso) {
    return `Start date "${raw}" is not a valid date. Pick a date between ${today} and ${latest}.`
  }
  if (iso < addDays(today, -START_DATE_PAST_GRACE_DAYS)) {
    return `Start date ${iso} is in the past. Pick a date between ${today} and ${latest}.`
  }
  if (iso > latest) {
    return `Start date ${iso} is more than ${MAX_START_DATE_DAYS_AHEAD} days away. Pick a date between ${today} and ${latest}.`
  }
  return null
}

export function computeRentalWindow(cart: CheckoutCartNote): { startDate: string; termMonths: number; endDate: string } {
  const today = todayISO()
  let startDate = today
  if (cart.startDate) {
    const iso = normalizeStartDate(String(cart.startDate))
    // Out-of-range dates are rejected by validateCartStartDate when the
    // booking is created; this stays as a safety net for legacy/manual rows.
    if (iso && iso >= today && iso <= addDays(today, MAX_START_DATE_DAYS_AHEAD)) startDate = iso
  }
  const termMonths = sanitizeTermMonths(cart.durationMonths)
  return { startDate, termMonths, endDate: addMonths(startDate, termMonths) }
}

/**
 * Multi-month term discounts. This table MUST stay identical to
 * `SUBSCRIPTION_DURATION_OPTIONS` in packages/shared/src/subscription.ts —
 * that is what the customer app quotes at checkout and what the SkipCash
 * hosted page therefore has to charge. `booking-pricing.test.ts` reads the
 * shared file and pins the two together so they cannot drift.
 *
 * (The shared `computeSubscriptionMonthly` helper would simply be imported,
 * but packages/shared/package.json's `exports` map does not expose a
 * `./subscription` subpath, and the package root pulls UI assets the backend
 * must not load. See `needsOtherFiles` in the money-core report.)
 */
export const TERM_DISCOUNTS: ReadonlyArray<{ months: number; discount: number }> = [
  { months: 1, discount: 0 },
  { months: 3, discount: 0.05 },
  { months: 6, discount: 0.1 },
  { months: 9, discount: 0.12 },
  { months: 12, discount: 0.15 },
]

/** Unlisted terms get the 1-month rate, exactly like shared `durationOption`. */
function termDiscount(termMonths: number): number {
  return TERM_DISCOUNTS.find((option) => option.months === termMonths)?.discount ?? 0
}

/**
 * Server-authoritative monthly price; never trust client cart totals.
 *
 * The term is re-sanitized here rather than taken on trust, so a bogus client
 * `durationMonths` can never widen the multi-month discount.
 */
export function computeMonthlyAmount(pricePerDay: number, termMonths: unknown = 1): number {
  const term = sanitizeTermMonths(termMonths)
  // Same whole-QAR rounding as packages/shared `computeMonthlyPrice`.
  return Math.round(Number(pricePerDay) * 30 * (1 - termDiscount(term)))
}

/** Server-authoritative rental charge; never trust client cart.total for payments. */
export function computeServerRentalAmount(pricePerDay: number, cart: CheckoutCartNote): number {
  const termMonths = sanitizeTermMonths(cart.durationMonths)
  return computeMonthlyAmount(pricePerDay, termMonths) * termMonths
}

/** First charge for the pay-online flow: the first month, invygo-style. */
export function computeFirstPaymentAmount(pricePerDay: number, termMonths: unknown = 1): number {
  return computeMonthlyAmount(pricePerDay, termMonths)
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
  body: { error: string; unavailable?: true } | ReturnType<typeof mapBookingRequest>
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
  const startDateError = validateCartStartDate(parseCartNote(params.note))
  if (startDateError) {
    return { status: 400, body: { error: startDateError } }
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
        note: sanitizeCartNoteForPersist(params.note),
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
      await failBookingPayments(tx, bookingRequestId)
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

    const {
      listedMonthly,
      firstInvoiceAmount,
      promo: unredeemedPromo,
    } = await resolveApprovalPricing({
      pricePerDay: Number(existing.vehicle.pricePerDay),
      cart,
      customerId: existing.br.customerId,
      termMonths,
      onlinePaymentAmount: onlinePayment ? Number(onlinePayment.amount) : undefined,
    })
    const monthlyAmount = listedMonthly
    const totalAmount = listedMonthly * termMonths

    // Online payments redeem in the settlement webhook. The pay-at-shop path has
    // no webhook, so without this the discount is granted on every approval and
    // the code never counts against maxUses or the per-customer limit.
    if (unredeemedPromo) {
      await redeemPromoCode(tx, {
        promoCodeId: unredeemedPromo.promoCodeId,
        customerId: existing.br.customerId,
        discountAmount: unredeemedPromo.discountAmount,
        bookingRequestId,
      })
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
    dispatchCustomerTransactionalChannelsSafe({
      userId: existing.br.customerId,
      event: 'booking_approved',
      parameters: [
        customer?.name ?? 'Customer',
        vehicleName,
        onlinePayment
          ? 'Your first month is paid.'
          : `First monthly payment of QAR ${monthlyAmount.toFixed(2)} is due at pickup.`,
      ],
      email: customer?.email
        ? {
            subject: 'Your CarFlow booking is confirmed',
            html: `<p>Hi ${customer.name},</p>
<p>Your booking for <strong>${vehicleName}</strong> has been confirmed.</p>
<p><strong>Start:</strong> ${startDate}<br/><strong>End:</strong> ${endDate}</p>
<p><strong>Monthly:</strong> QAR ${monthlyAmount.toFixed(2)}</p>
<p>Thank you for choosing CarFlow.</p>`,
          }
        : undefined,
    })

    return { status: 200, body: mapBookingRequest(row) }
  })
}

/**
 * Customer self-withdraw of a pending booking. Matches dealer decline money
 * cleanup (fail in-flight payments, flag completed captures for refund) but
 * does not email the customer a "declined" notice.
 */
export async function withdrawPendingBookingRequest(params: {
  customerId: string
  bookingRequestId: string
}): Promise<TransitionResult> {
  const { customerId, bookingRequestId } = params
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.id, bookingRequestId),
          eq(bookingRequests.customerId, customerId),
          eq(bookingRequests.status, 'pending')
        )
      )
      .for('update')
      .limit(1)
    if (!existing) {
      return { status: 404, body: { error: 'Not found or already resolved' } }
    }

    const [row] = await tx
      .update(bookingRequests)
      .set({
        status: 'declined',
        awaitingPayment: false,
        declineReason: 'Withdrawn by customer',
      })
      .where(eq(bookingRequests.id, bookingRequestId))
      .returning()

    await failBookingPayments(tx, bookingRequestId)
    return { status: 200, body: mapBookingRequest(row) }
  })
}
