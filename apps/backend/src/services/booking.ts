import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { bookingRequests, profiles, rentals, vehicles } from '../db/schema.js'
import { sendBookingConfirmationEmail } from './mail.js'
import { mapBookingRequest } from '../db/mappers.js'

export interface CheckoutCartNote {
  durationMonths?: number
  startDate?: string
  total?: number
  delivery?: { location?: string; date?: string; time?: string }
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

function computeRentalWindow(cart: CheckoutCartNote): { startDate: string; endDate: string } {
  const start = cart.startDate ? new Date(cart.startDate) : new Date()
  const startDate = Number.isNaN(start.getTime()) ? new Date() : start
  const end = new Date(startDate)
  end.setMonth(end.getMonth() + (cart.durationMonths && cart.durationMonths > 0 ? cart.durationMonths : 1))
  return { startDate: startDate.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) }
}

/** Server-authoritative rental charge; never trust client cart.total for payments. */
export function computeServerRentalAmount(pricePerDay: number, cart: CheckoutCartNote): number {
  const months = cart.durationMonths && cart.durationMonths > 0 ? cart.durationMonths : 1
  return Number(pricePerDay) * 30 * months
}

export interface TransitionResult {
  status: number
  body: { error: string } | ReturnType<typeof mapBookingRequest>
}

/**
 * Shared by the "pay at shop" booking-request endpoint and the SkipCash webhook
 * (which creates the booking request only after payment is confirmed). Rejects
 * vehicles that are no longer available and relies on the DB-level unique
 * partial index to reject a second pending request for the same vehicle.
 */
export async function createBookingRequestForVehicle(params: {
  customerId: string
  vehicleId: string
  note?: string | null
}): Promise<TransitionResult> {
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
      .values({ customerId: params.customerId, vehicleId: params.vehicleId, note: params.note || null })
      .returning()
    return { status: 201, body: mapBookingRequest(row) }
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
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
 */
export async function transitionBookingRequest(params: {
  bookingRequestId: string
  status: 'approved' | 'declined'
  declineReason?: string
  /** Restricts the lookup to a single dealer's vehicles; omitted for admin. */
  scopeDealerId?: string
}): Promise<TransitionResult> {
  const { bookingRequestId, status, declineReason, scopeDealerId } = params

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
        .set({ status: 'declined', ...(declineReason !== undefined ? { declineReason } : {}) })
        .where(eq(bookingRequests.id, bookingRequestId))
        .returning()
      return { status: 200, body: mapBookingRequest(row) }
    }

    const cart = parseCartNote(existing.br.note)
    const { startDate, endDate } = computeRentalWindow(cart)
    const totalAmount = computeServerRentalAmount(Number(existing.vehicle.pricePerDay), cart)
    const delivery = cart.delivery

    const [row] = await tx
      .update(bookingRequests)
      .set({ status: 'approved' })
      .where(eq(bookingRequests.id, bookingRequestId))
      .returning()

    await tx.insert(rentals).values({
      customerId: existing.br.customerId,
      dealerId: existing.vehicle.dealerId,
      vehicleId: existing.br.vehicleId,
      bookingRequestId,
      startDate,
      endDate,
      status: 'reserved',
      totalAmount: String(totalAmount),
      paymentStatus: 'pending',
      pickupLocation: delivery?.location ?? null,
      pickupDate: delivery?.date ?? startDate,
      pickupTime: delivery?.time ?? null,
    })
    await tx.update(vehicles).set({ status: 'rented' }).where(eq(vehicles.id, existing.br.vehicleId))

    const [customer] = await tx
      .select({ email: profiles.email, name: profiles.name })
      .from(profiles)
      .where(eq(profiles.id, existing.br.customerId))
      .limit(1)

    const vehicleName = `${existing.vehicle.year} ${existing.vehicle.make} ${existing.vehicle.model}`
    if (customer?.email) {
      void sendBookingConfirmationEmail({
        to: customer.email,
        customerName: customer.name,
        vehicleName,
        startDate,
        endDate,
        totalPrice: totalAmount,
      }).catch((err) => console.error('Booking confirmation email failed:', err))
    }

    return { status: 200, body: mapBookingRequest(row) }
  })
}
