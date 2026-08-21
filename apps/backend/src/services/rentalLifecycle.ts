import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  invoices,
  payments,
  profiles,
  rentalEvents,
  rentals,
  swapRequests,
  vehicles,
} from '../db/schema.js'
import { addMonths, dateInBillingTz, daysBetween, maxDate, nextBoundaryOnOrAfter, todayISO, addDays } from '../utils/dates.js'
import { getCancelNoticeDays, getMaxPauseDays, getSwapEligibleDays } from './appSettings.js'
import { logAudit } from './audit.js'
import { trackAnalyticsEvent } from './analyticsEvents.js'
import type { DbOrTx } from './audit.js'
import { syncDealerActiveRentals } from './counters.js'
import {
  flagDepositReleaseForFinance,
  validateDepositResolution,
  type DepositResolutionInput,
} from './depositResolution.js'
import { notifyUser } from './notify.js'

export type RentalStatus = 'reserved' | 'active' | 'paused' | 'past_due' | 'completed' | 'cancelled'

/**
 * The only legal rental/subscription transitions. Everything else is refused —
 * including by admins — so the inventory and billing invariants hold.
 *
 *   reserved  → active (handover) | cancelled
 *   active    → past_due (dunning) | paused | completed (return) | cancelled
 *   paused    → active (resume) | completed (return) | cancelled
 *   past_due  → active (invoice settled) | completed (return) | cancelled
 */
const ALLOWED: Record<RentalStatus, RentalStatus[]> = {
  reserved: ['active', 'cancelled'],
  active: ['past_due', 'paused', 'completed', 'cancelled'],
  paused: ['active', 'completed', 'cancelled'],
  past_due: ['active', 'completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

export function isTransitionAllowed(from: RentalStatus, to: RentalStatus): boolean {
  return ALLOWED[from]?.includes(to) ?? false
}

export interface LifecycleResult<T = unknown> {
  status: number
  body: { error: string } | T
}

/** Frees the vehicle only when this rental is what holds it. */
async function releaseVehicle(tx: DbOrTx, vehicleId: string): Promise<void> {
  await tx
    .update(vehicles)
    .set({ status: 'available' })
    .where(and(eq(vehicles.id, vehicleId), eq(vehicles.status, 'rented')))
}

/**
 * Voids unpaid invoices when a subscription ends. By default only `due`
 * (future/current period) invoices are voided — `overdue` invoices are real
 * receivables and must survive a return so the debt isn't silently erased
 * (re-audit F10). Cancellations may forgive everything explicitly.
 */
async function voidOpenInvoices(
  tx: DbOrTx,
  rentalId: string,
  opts: { includeOverdue: boolean } = { includeOverdue: false }
): Promise<void> {
  await tx
    .update(invoices)
    .set({ status: 'void' })
    .where(
      and(
        eq(invoices.rentalId, rentalId),
        inArray(invoices.status, opts.includeOverdue ? ['due', 'overdue'] : ['due'])
      )
    )
}

async function notifyDealerOwnerLocal(
  tx: DbOrTx,
  dealerId: string,
  title: string,
  message: string,
  type: 'info' | 'warning' | 'success' | 'error' = 'info'
): Promise<void> {
  const { notifyDealerOwner } = await import('./notify.js')
  await notifyDealerOwner(tx, dealerId, { title, message, type })
}

export interface HandoverInput {
  rentalId: string
  dealerId: string
  actorId: string
  mileage?: number
  fuelLevel?: string
  conditionNotes?: string
  photos?: string[]
}

/**
 * Dealer hands the car to the customer. Requires the first invoice to be paid
 * (online or recorded offline). Moves reserved → active and records a pickup
 * event with mileage/condition so the vehicle's state is documented.
 */
export async function recordHandover(input: HandoverInput): Promise<LifecycleResult> {
  return db.transaction(async (tx) => {
    const [rental] = await tx
      .select()
      .from(rentals)
      .where(and(eq(rentals.id, input.rentalId), eq(rentals.dealerId, input.dealerId)))
      .for('update')
      .limit(1)
    if (!rental) return { status: 404, body: { error: 'Rental not found' } }
    if (rental.status !== 'reserved') {
      return { status: 409, body: { error: `Cannot hand over a rental in status "${rental.status}"` } }
    }
    if (rental.paymentStatus !== 'completed') {
      return {
        status: 409,
        body: { error: 'First payment has not been received. Record the payment before handover.' },
      }
    }

    const now = new Date()
    const [updated] = await tx
      .update(rentals)
      .set({ status: 'active', activatedAt: now })
      .where(eq(rentals.id, rental.id))
      .returning()

    await tx.insert(rentalEvents).values({
      rentalId: rental.id,
      type: 'pickup',
      mileage: input.mileage ?? null,
      fuelLevel: input.fuelLevel ?? null,
      conditionNotes: input.conditionNotes ?? null,
      photos: input.photos ?? [],
      recordedBy: input.actorId,
    })

    if (typeof input.mileage === 'number' && Number.isFinite(input.mileage)) {
      await tx.update(vehicles).set({ mileage: input.mileage }).where(eq(vehicles.id, rental.vehicleId))
    }

    await notifyUser(tx, {
      userId: rental.customerId,
      type: 'success',
      title: 'Your car has been handed over',
      message: 'Your subscription is now active. Enjoy the ride!',
    })
    await logAudit(tx, {
      actorId: input.actorId,
      actorRole: 'dealer',
      action: 'rental.handover',
      entityType: 'rental',
      entityId: rental.id,
      before: { status: rental.status },
      after: { status: 'active', mileage: input.mileage ?? null },
    })

    await syncDealerActiveRentals(tx, rental.dealerId)

    await trackAnalyticsEvent(tx, {
      eventType: 'rental_activated',
      userId: rental.customerId,
      entityType: 'rental',
      entityId: rental.id,
      properties: { dealerId: rental.dealerId, vehicleId: rental.vehicleId },
    })

    return { status: 200, body: updated }
  })
}

export interface ReturnInput {
  rentalId: string
  dealerId: string
  actorId: string
  mileage?: number
  fuelLevel?: string
  conditionNotes?: string
  photos?: string[]
  /** Where the vehicle goes after return inspection. */
  vehicleNextStatus?: 'available' | 'maintenance'
  depositResolution?: DepositResolutionInput
}

/**
 * Dealer takes the car back (end of subscription or admin-forced). Moves
 * active/past_due → completed, records a return event, voids unpaid invoices,
 * and routes the vehicle to available or maintenance.
 */
export async function recordReturn(input: ReturnInput): Promise<LifecycleResult> {
  return db.transaction(async (tx) => {
    const [rental] = await tx
      .select()
      .from(rentals)
      .where(and(eq(rentals.id, input.rentalId), eq(rentals.dealerId, input.dealerId)))
      .for('update')
      .limit(1)
    if (!rental) return { status: 404, body: { error: 'Rental not found' } }
    if (!isTransitionAllowed(rental.status as RentalStatus, 'completed')) {
      return { status: 409, body: { error: `Cannot return a rental in status "${rental.status}"` } }
    }

    const depositError = validateDepositResolution(rental, input.depositResolution)
    if (depositError) {
      return { status: 400, body: { error: depositError } }
    }

    const deposit = Number(rental.depositAmount ?? 0)
    const releaseAmount = input.depositResolution?.releaseAmount ?? 0
    const withheldAmount = input.depositResolution?.withheldAmount ?? 0
    const depositNote = input.depositResolution?.note?.trim() || null

    const now = new Date()
    const [updated] = await tx
      .update(rentals)
      .set({
        status: 'completed',
        completedAt: now,
        nextBillingDate: null,
        endDate: todayISO(),
        depositResolvedAmount: String(releaseAmount),
        depositWithheldAmount: String(withheldAmount),
        depositResolutionNote: depositNote,
        depositResolvedAt: deposit > 0 ? now : null,
      })
      .where(eq(rentals.id, rental.id))
      .returning()

    await tx.insert(rentalEvents).values({
      rentalId: rental.id,
      type: 'return',
      mileage: input.mileage ?? null,
      fuelLevel: input.fuelLevel ?? null,
      conditionNotes: input.conditionNotes ?? null,
      photos: input.photos ?? [],
      recordedBy: input.actorId,
    })

    if (typeof input.mileage === 'number' && Number.isFinite(input.mileage)) {
      await tx.update(vehicles).set({ mileage: input.mileage }).where(eq(vehicles.id, rental.vehicleId))
    }
    const nextStatus = input.vehicleNextStatus === 'maintenance' ? 'maintenance' : 'available'
    await tx
      .update(vehicles)
      .set({ status: nextStatus })
      .where(and(eq(vehicles.id, rental.vehicleId), eq(vehicles.status, 'rented')))

    await voidOpenInvoices(tx, rental.id)

    if (releaseAmount > 0 && rental.depositRefundable) {
      await flagDepositReleaseForFinance(tx, rental.id, releaseAmount)
    }

    // Any pending swap request dies with the rental.
    await tx
      .update(swapRequests)
      .set({ status: 'cancelled', resolvedAt: now })
      .where(and(eq(swapRequests.rentalId, rental.id), eq(swapRequests.status, 'pending')))

    await notifyUser(tx, {
      userId: rental.customerId,
      type: 'info',
      title: 'Vehicle returned',
      message:
        deposit > 0
          ? withheldAmount > 0
            ? `Your subscription is complete. Deposit: QAR ${releaseAmount.toFixed(2)} released, QAR ${withheldAmount.toFixed(2)} withheld.${depositNote ? ` Reason: ${depositNote}` : ''}`
            : `Your subscription is complete. Your deposit of QAR ${releaseAmount.toFixed(2)} is being processed for release.`
          : 'Your subscription is complete. Thank you for choosing CarFlow.',
    })
    await logAudit(tx, {
      actorId: input.actorId,
      actorRole: 'dealer',
      action: 'rental.return',
      entityType: 'rental',
      entityId: rental.id,
      before: { status: rental.status },
      after: {
        status: 'completed',
        mileage: input.mileage ?? null,
        vehicleNextStatus: nextStatus,
        depositResolvedAmount: releaseAmount,
        depositWithheldAmount: withheldAmount,
        depositResolutionNote: depositNote,
      },
    })

    await syncDealerActiveRentals(tx, rental.dealerId)

    return { status: 200, body: updated }
  })
}

export interface CancelInput {
  rentalId: string
  actor: { id: string; role: 'customer' | 'admin' }
  reason?: string
  collection?: {
    mode: 'dealer_return' | 'collection'
    location?: string
    date: string
    time: string
  }
  /** Only honored when the customer owns the rental. */
  customerId?: string
}

function collectionPatch(
  collection?: CancelInput['collection']
): Partial<typeof rentals.$inferInsert> {
  if (!collection) return {}
  const location =
    collection.mode === 'dealer_return' ? 'Return to dealer' : (collection.location?.trim() ?? '')
  return {
    returnLocation: location || null,
    returnDate: collection.date,
    returnTime: collection.time,
  }
}

/**
 * Cancellation, invygo-style:
 *  - reserved (not yet picked up): cancels immediately, frees the car, and
 *    flags any completed payment for refund.
 *  - active: schedules the end at the next billing boundary that satisfies the
 *    30-day notice and the minimum term. Billing stops at that boundary; the
 *    car is returned via the normal dealer return flow.
 *  - admin: may also cancel immediately from any open state.
 */
export async function cancelRental(input: CancelInput): Promise<LifecycleResult> {
  return db.transaction(async (tx) => {
    const scope =
      input.actor.role === 'customer'
        ? and(eq(rentals.id, input.rentalId), eq(rentals.customerId, input.actor.id))
        : eq(rentals.id, input.rentalId)
    const [rental] = await tx.select().from(rentals).where(scope).for('update').limit(1)
    if (!rental) return { status: 404, body: { error: 'Rental not found' } }

    const status = rental.status as RentalStatus
    const now = new Date()

    // Immediate cancellation: reserved for everyone; any open state for admin.
    const immediate = status === 'reserved' || input.actor.role === 'admin'
    if (immediate) {
      if (!isTransitionAllowed(status, 'cancelled')) {
        return { status: 409, body: { error: `Cannot cancel a rental in status "${status}"` } }
      }
      const [updated] = await tx
        .update(rentals)
        .set({
          status: 'cancelled',
          cancelRequestedAt: now,
          cancellationEffectiveDate: todayISO(),
          cancelReason: input.reason ?? null,
          nextBillingDate: null,
          ...collectionPatch(input.collection),
        })
        .where(eq(rentals.id, rental.id))
        .returning()
      await releaseVehicle(tx, rental.vehicleId)
      // Cancellation is an explicit act of ending the relationship: unpaid
      // invoices (incl. overdue) are voided; refunds handled separately.
      await voidOpenInvoices(tx, rental.id, { includeOverdue: true })
      await tx
        .update(swapRequests)
        .set({ status: 'cancelled', resolvedAt: now })
        .where(and(eq(swapRequests.rentalId, rental.id), eq(swapRequests.status, 'pending')))

      // A paid-but-never-started subscription needs its money back.
      if (status === 'reserved' && rental.paymentStatus === 'completed') {
        await tx
          .update(payments)
          .set({ needsRefund: true })
          .where(and(eq(payments.rentalId, rental.id), eq(payments.status, 'completed')))
      }

      await notifyUser(tx, {
        userId: rental.customerId,
        type: 'warning',
        title: 'Subscription cancelled',
        message:
          status === 'reserved' && rental.paymentStatus === 'completed'
            ? 'Your booking was cancelled. Any payment made will be refunded.'
            : 'Your subscription has been cancelled.',
      })
      await notifyDealerOwnerLocal(
        tx,
        rental.dealerId,
        'Booking cancelled',
        'A reserved booking was cancelled and the vehicle is available again.',
        'warning'
      )
      await logAudit(tx, {
        actorId: input.actor.id,
        actorRole: input.actor.role,
        action: 'rental.cancel.immediate',
        entityType: 'rental',
        entityId: rental.id,
        before: { status },
        after: { status: 'cancelled', reason: input.reason ?? null },
      })
      await syncDealerActiveRentals(tx, rental.dealerId)
      if (input.actor.role === 'customer') {
        await trackAnalyticsEvent(tx, {
          eventType: 'cancel_requested',
          userId: rental.customerId,
          entityType: 'rental',
          entityId: rental.id,
          properties: { immediate: true, reason: input.reason ?? null },
        })
      }
      return { status: 200, body: updated }
    }

    // Customer cancelling an active/paused/past_due subscription: 30-day notice,
    // effective at a billing boundary, never before the minimum term ends.
    if (status !== 'active' && status !== 'paused' && status !== 'past_due') {
      return { status: 409, body: { error: `Cannot cancel a rental in status "${status}"` } }
    }
    if (rental.cancellationEffectiveDate) {
      return { status: 409, body: { error: 'Cancellation is already scheduled' } }
    }

    const today = todayISO()
    const minTermEnd = addMonths(rental.startDate, rental.termMonths || 1)
    const notice = await getCancelNoticeDays()
    const target = maxDate(addDaysISO(today, notice), minTermEnd)
    // Snap to a boundary computed from the ORIGINAL start-date anchor
    // (month-end safe; iterating addMonths on clamped output drifted and
    // could cost the customer an extra month — re-audit L1). Never earlier
    // than what's already paid through.
    const paidThrough = rental.nextBillingDate ?? maxDate(today, rental.endDate)
    const effective = nextBoundaryOnOrAfter(rental.startDate, maxDate(target, paidThrough))

    const [updated] = await tx
      .update(rentals)
      .set({
        cancelRequestedAt: now,
        cancellationEffectiveDate: effective,
        cancelReason: input.reason ?? null,
        ...collectionPatch(input.collection),
      })
      .where(eq(rentals.id, rental.id))
      .returning()

    await notifyUser(tx, {
      userId: rental.customerId,
      type: 'info',
      title: 'Cancellation scheduled',
      message: `Your subscription will end on ${effective}. Please return the vehicle to your dealer on or before that date.`,
    })
    await notifyDealerOwnerLocal(
      tx,
      rental.dealerId,
      'Subscription ending',
      `A customer scheduled cancellation effective ${effective}. Arrange the vehicle return.`,
      'info'
    )
    await logAudit(tx, {
      actorId: input.actor.id,
      actorRole: input.actor.role,
      action: 'rental.cancel.scheduled',
      entityType: 'rental',
      entityId: rental.id,
      before: { status },
      after: { cancellationEffectiveDate: effective, reason: input.reason ?? null },
    })

    await trackAnalyticsEvent(tx, {
      eventType: 'cancel_requested',
      userId: rental.customerId,
      entityType: 'rental',
      entityId: rental.id,
      properties: { immediate: false, effectiveDate: effective, reason: input.reason ?? null },
    })

    return { status: 200, body: updated }
  })
}

function addDaysISO(dateISO: string, days: number): string {
  const dt = new Date(`${dateISO}T00:00:00Z`)
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

export interface AdminStatusChangeInput {
  rentalId: string
  toStatus: RentalStatus
  actorId: string
  note?: string
}

/** Admin repair lever: validated transition with audit; no silent free-for-all. */
export async function adminChangeRentalStatus(input: AdminStatusChangeInput): Promise<LifecycleResult> {
  if (input.toStatus === 'cancelled') {
    return cancelRental({ rentalId: input.rentalId, actor: { id: input.actorId, role: 'admin' }, reason: input.note })
  }
  return db.transaction(async (tx) => {
    const [rental] = await tx
      .select()
      .from(rentals)
      .where(eq(rentals.id, input.rentalId))
      .for('update')
      .limit(1)
    if (!rental) return { status: 404, body: { error: 'Not found' } }
    const from = rental.status as RentalStatus
    if (from === input.toStatus) return { status: 200, body: rental }
    if (input.toStatus === 'paused' || (from === 'paused' && input.toStatus === 'active')) {
      return {
        status: 409,
        body: { error: 'Use the pause/resume endpoints so billing dates are adjusted correctly.' },
      }
    }
    if (!isTransitionAllowed(from, input.toStatus)) {
      return {
        status: 409,
        body: { error: `Illegal transition ${from} → ${input.toStatus}` },
      }
    }

    // The payment gate holds even for admins: an override to `active`
    // without the first payment would put the customer on the road with the
    // first invoice unpaid AND start renewal billing on top (re-audit L4).
    if (input.toStatus === 'active' && from === 'reserved' && rental.paymentStatus !== 'completed') {
      return {
        status: 409,
        body: { error: 'First payment has not been recorded. Record the payment before activating.' },
      }
    }

    const patch: Record<string, unknown> = { status: input.toStatus }
    if (input.toStatus === 'active' && !rental.activatedAt) patch.activatedAt = new Date()
    if (input.toStatus === 'completed') {
      patch.completedAt = new Date()
      patch.nextBillingDate = null
    }
    const [updated] = await tx.update(rentals).set(patch).where(eq(rentals.id, rental.id)).returning()

    if (input.toStatus === 'completed') {
      await releaseVehicle(tx, rental.vehicleId)
      await voidOpenInvoices(tx, rental.id)
      await tx.insert(rentalEvents).values({
        rentalId: rental.id,
        type: 'return',
        conditionNotes: input.note ?? 'Closed by admin override',
        recordedBy: input.actorId,
      })
    }

    await logAudit(tx, {
      actorId: input.actorId,
      actorRole: 'admin',
      action: 'rental.status.override',
      entityType: 'rental',
      entityId: rental.id,
      before: { status: from },
      after: { status: input.toStatus },
      note: input.note ?? null,
    })
    return { status: 200, body: updated }
  })
}

export interface SwapDecisionInput {
  swapRequestId: string
  dealerId: string
  actorId: string
  approve: boolean
  declineReason?: string
  /** Odometer of the outgoing car at swap time. */
  mileageOut?: number
  /** Odometer of the incoming car at swap time. */
  mileageIn?: number
}

/**
 * Dealer decision on a swap request. Approval atomically moves the
 * subscription onto the new vehicle: old car freed, new car rented, monthly
 * price re-anchored to the new car, swap events recorded on the rental.
 */
export async function decideSwapRequest(input: SwapDecisionInput): Promise<LifecycleResult> {
  return db.transaction(async (tx) => {
    const [swap] = await tx
      .select()
      .from(swapRequests)
      .where(eq(swapRequests.id, input.swapRequestId))
      .for('update')
      .limit(1)
    if (!swap) return { status: 404, body: { error: 'Swap request not found' } }
    if (swap.status !== 'pending') {
      return { status: 200, body: swap } // idempotent: already resolved
    }

    const [rental] = await tx
      .select()
      .from(rentals)
      .where(and(eq(rentals.id, swap.rentalId), eq(rentals.dealerId, input.dealerId)))
      .for('update')
      .limit(1)
    if (!rental) return { status: 404, body: { error: 'Swap request not found' } }

    const now = new Date()
    if (!input.approve) {
      const [updated] = await tx
        .update(swapRequests)
        .set({ status: 'declined', declineReason: input.declineReason ?? null, resolvedAt: now })
        .where(eq(swapRequests.id, swap.id))
        .returning()
      await notifyUser(tx, {
        userId: swap.customerId,
        type: 'warning',
        title: 'Swap request declined',
        message: input.declineReason
          ? `Your car swap request was declined: ${input.declineReason}`
          : 'Your car swap request was declined.',
      })
      await logAudit(tx, {
        actorId: input.actorId,
        actorRole: 'dealer',
        action: 'swap.decline',
        entityType: 'swap_request',
        entityId: swap.id,
        note: input.declineReason ?? null,
      })
      return { status: 200, body: updated }
    }

    if (rental.status !== 'active') {
      return { status: 409, body: { error: 'Subscription is not active; cannot swap' } }
    }

    const [newVehicle] = await tx
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.id, swap.requestedVehicleId), eq(vehicles.dealerId, input.dealerId)))
      .for('update')
      .limit(1)
    if (!newVehicle) return { status: 404, body: { error: 'Requested vehicle not found' } }
    if (newVehicle.status !== 'available') {
      return { status: 409, body: { error: 'Requested vehicle is no longer available' } }
    }

    const newMonthly = Number(newVehicle.pricePerDay) * 30

    await tx.insert(rentalEvents).values({
      rentalId: rental.id,
      type: 'swap_out',
      mileage: input.mileageOut ?? null,
      conditionNotes: `Swapped out for ${newVehicle.name}`,
      recordedBy: input.actorId,
    })
    await tx.insert(rentalEvents).values({
      rentalId: rental.id,
      type: 'swap_in',
      mileage: input.mileageIn ?? null,
      conditionNotes: 'Swap-in handover',
      recordedBy: input.actorId,
    })

    // Free the old car, occupy the new one, move the subscription over.
    await releaseVehicle(tx, swap.currentVehicleId)
    await tx.update(vehicles).set({ status: 'rented' }).where(eq(vehicles.id, newVehicle.id))
    await tx
      .update(rentals)
      .set({ vehicleId: newVehicle.id, monthlyAmount: String(newMonthly) })
      .where(eq(rentals.id, rental.id))
    const [updated] = await tx
      .update(swapRequests)
      .set({ status: 'approved', resolvedAt: now })
      .where(eq(swapRequests.id, swap.id))
      .returning()

    const [customer] = await tx
      .select({ email: profiles.email })
      .from(profiles)
      .where(eq(profiles.id, swap.customerId))
      .limit(1)
    void customer

    await notifyUser(tx, {
      userId: swap.customerId,
      type: 'success',
      title: 'Car swap approved',
      message: `Your subscription has moved to ${newVehicle.year} ${newVehicle.make} ${newVehicle.model}. New monthly price: QAR ${newMonthly.toFixed(2)} from your next billing date.`,
    })
    await logAudit(tx, {
      actorId: input.actorId,
      actorRole: 'dealer',
      action: 'swap.approve',
      entityType: 'rental',
      entityId: rental.id,
      before: { vehicleId: swap.currentVehicleId, monthlyAmount: rental.monthlyAmount },
      after: { vehicleId: newVehicle.id, monthlyAmount: String(newMonthly) },
    })

    return { status: 200, body: updated }
  })
}

export async function acknowledgePickupFulfilment(input: {
  rentalId: string
  dealerId: string
  actorId: string
  status: 'scheduled' | 'delivered'
}): Promise<LifecycleResult> {
  return db.transaction(async (tx) => {
    const [rental] = await tx
      .select()
      .from(rentals)
      .where(and(eq(rentals.id, input.rentalId), eq(rentals.dealerId, input.dealerId)))
      .for('update')
      .limit(1)
    if (!rental) return { status: 404, body: { error: 'Rental not found' } }
    if (rental.status !== 'reserved' && rental.status !== 'active') {
      return {
        status: 409,
        body: { error: 'Pickup can only be acknowledged for reserved or active rentals' },
      }
    }
    const [updated] = await tx
      .update(rentals)
      .set({ pickupFulfilmentStatus: input.status })
      .where(eq(rentals.id, rental.id))
      .returning()
    await tx.insert(rentalEvents).values({
      rentalId: rental.id,
      type: 'note',
      conditionNotes:
        input.status === 'delivered'
          ? 'Vehicle delivery/handover marked as delivered.'
          : 'Vehicle delivery/handover marked as scheduled.',
      recordedBy: input.actorId,
    })
    await logAudit(tx, {
      actorId: input.actorId,
      actorRole: 'dealer',
      action: input.status === 'delivered' ? 'rental.pickup.delivered' : 'rental.pickup.scheduled',
      entityType: 'rental',
      entityId: rental.id,
      after: { pickupFulfilmentStatus: input.status },
    })
    return { status: 200, body: updated }
  })
}

/** Whether a rental is far enough into its term to request a swap. */
export async function swapEligibleFrom(activatedAt: Date | null): Promise<Date | null> {
  if (!activatedAt) return null
  const days = await getSwapEligibleDays()
  const d = new Date(activatedAt)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

export type PauseActorRole = 'customer' | 'dealer' | 'admin'

export interface PauseRentalInput {
  rentalId: string
  actor: { id: string; role: PauseActorRole }
  customerId?: string
  dealerId?: string
  days?: number
  reason?: string
}

/**
 * Pause an active subscription (travel hold). Billing stops until resume;
 * `nextBillingDate` is shifted forward by the paused span on resume.
 */
export async function pauseRental(input: PauseRentalInput): Promise<LifecycleResult> {
  return db.transaction(async (tx) => {
    const scope =
      input.actor.role === 'customer'
        ? and(eq(rentals.id, input.rentalId), eq(rentals.customerId, input.actor.id))
        : input.actor.role === 'dealer'
          ? and(eq(rentals.id, input.rentalId), eq(rentals.dealerId, input.dealerId!))
          : eq(rentals.id, input.rentalId)
    const [rental] = await tx.select().from(rentals).where(scope).for('update').limit(1)
    if (!rental) return { status: 404, body: { error: 'Rental not found' } }

    const status = rental.status as RentalStatus
    if (status === 'past_due') {
      return {
        status: 409,
        body: { error: 'Cannot pause a subscription with overdue payments. Pay outstanding invoices first.' },
      }
    }
    if (!isTransitionAllowed(status, 'paused')) {
      return { status: 409, body: { error: `Cannot pause a rental in status "${status}"` } }
    }
    if (rental.cancellationEffectiveDate) {
      return { status: 409, body: { error: 'Cannot pause a subscription that is pending cancellation' } }
    }

    const maxDays = await getMaxPauseDays()
    const requestedDays = input.days ?? maxDays
    if (!Number.isFinite(requestedDays) || requestedDays < 1 || requestedDays > maxDays) {
      return {
        status: 400,
        body: { error: `Pause duration must be between 1 and ${maxDays} days` },
      }
    }

    const now = new Date()
    const today = todayISO()
    const pausedUntil = addDays(today, requestedDays)
    const [updated] = await tx
      .update(rentals)
      .set({
        status: 'paused',
        pausedAt: now,
        pausedUntil,
        pauseReason: input.reason?.trim() || null,
      })
      .where(eq(rentals.id, rental.id))
      .returning()

    await tx.insert(rentalEvents).values({
      rentalId: rental.id,
      type: 'note',
      conditionNotes: `Subscription paused until ${pausedUntil}.${input.reason?.trim() ? ` Reason: ${input.reason.trim()}` : ''}`,
      recordedBy: input.actor.id,
    })

    await notifyUser(tx, {
      userId: rental.customerId,
      type: 'info',
      title: 'Subscription paused',
      message: `Your subscription is paused until ${pausedUntil}. Monthly billing will resume when you unpause.`,
    })
    await logAudit(tx, {
      actorId: input.actor.id,
      actorRole: input.actor.role,
      action: 'rental.pause',
      entityType: 'rental',
      entityId: rental.id,
      before: { status, nextBillingDate: rental.nextBillingDate },
      after: { status: 'paused', pausedUntil, pauseReason: input.reason?.trim() || null },
    })
    await syncDealerActiveRentals(tx, rental.dealerId)

    return { status: 200, body: updated }
  })
}

export interface ResumeRentalInput {
  rentalId: string
  actor: { id: string; role: PauseActorRole }
  customerId?: string
  dealerId?: string
}

/** Resume a paused subscription and shift billing forward by the pause span. */
export async function resumeRental(input: ResumeRentalInput): Promise<LifecycleResult> {
  return db.transaction(async (tx) => {
    const scope =
      input.actor.role === 'customer'
        ? and(eq(rentals.id, input.rentalId), eq(rentals.customerId, input.actor.id))
        : input.actor.role === 'dealer'
          ? and(eq(rentals.id, input.rentalId), eq(rentals.dealerId, input.dealerId!))
          : eq(rentals.id, input.rentalId)
    const [rental] = await tx.select().from(rentals).where(scope).for('update').limit(1)
    if (!rental) return { status: 404, body: { error: 'Rental not found' } }

    const status = rental.status as RentalStatus
    if (!isTransitionAllowed(status, 'active')) {
      return { status: 409, body: { error: `Cannot resume a rental in status "${status}"` } }
    }
    if (!rental.pausedAt) {
      return { status: 409, body: { error: 'This rental is not paused' } }
    }

    const pauseStart = dateInBillingTz(rental.pausedAt)
    const pauseEnd = todayISO()
    const pausedDays = daysBetween(pauseStart, pauseEnd)
    const patch: Record<string, unknown> = {
      status: 'active',
      pausedAt: null,
      pausedUntil: null,
      pauseReason: null,
    }
    if (rental.nextBillingDate && pausedDays > 0) {
      patch.nextBillingDate = addDays(rental.nextBillingDate, pausedDays)
    }
    if (rental.cancellationEffectiveDate && pausedDays > 0) {
      patch.cancellationEffectiveDate = addDays(rental.cancellationEffectiveDate, pausedDays)
    }
    if (rental.endDate && pausedDays > 0) {
      patch.endDate = addDays(rental.endDate, pausedDays)
    }

    const [updated] = await tx.update(rentals).set(patch).where(eq(rentals.id, rental.id)).returning()

    await tx.insert(rentalEvents).values({
      rentalId: rental.id,
      type: 'note',
      conditionNotes:
        pausedDays > 0
          ? `Subscription resumed after ${pausedDays} day${pausedDays === 1 ? '' : 's'} on hold.`
          : 'Subscription resumed.',
      recordedBy: input.actor.id,
    })

    await notifyUser(tx, {
      userId: rental.customerId,
      type: 'success',
      title: 'Subscription resumed',
      message:
        pausedDays > 0 && updated.nextBillingDate
          ? `Welcome back! Your next billing date is now ${updated.nextBillingDate}.`
          : 'Welcome back! Your subscription is active again.',
    })
    await logAudit(tx, {
      actorId: input.actor.id,
      actorRole: input.actor.role,
      action: 'rental.resume',
      entityType: 'rental',
      entityId: rental.id,
      before: {
        status,
        pausedAt: rental.pausedAt,
        nextBillingDate: rental.nextBillingDate,
      },
      after: {
        status: 'active',
        pausedDays,
        nextBillingDate: updated.nextBillingDate,
      },
    })
    await syncDealerActiveRentals(tx, rental.dealerId)

    return { status: 200, body: updated }
  })
}
