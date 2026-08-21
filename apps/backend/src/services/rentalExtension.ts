import { and, eq, type SQL } from 'drizzle-orm'
import { db } from '../db/index.js'
import { mapRental } from '../db/mappers.js'
import { rentalEvents, rentalExtensions, rentals } from '../db/schema.js'
import { addMonths } from '../utils/dates.js'
import { logAuditSafe } from './audit.js'

export type ExtendRentalActor = {
  id: string
  role: 'customer' | 'dealer'
}

export type ExtendRentalScope =
  | { customerId: string; dealerId?: never }
  | { dealerId: string; customerId?: never }

function scopeWhere(scope: ExtendRentalScope): SQL {
  if ('customerId' in scope && scope.customerId) {
    return eq(rentals.customerId, scope.customerId)
  }
  return eq(rentals.dealerId, scope.dealerId!)
}

export async function extendRentalTerm(input: {
  rentalId: string
  scope: ExtendRentalScope
  actor: ExtendRentalActor
  months: number
}): Promise<{ status: number; body: unknown }> {
  const months = Math.floor(input.months)
  if (months < 1 || months > 12) {
    return { status: 400, body: { error: 'Extension must be between 1 and 12 months' } }
  }

  const updated = await db.transaction(async (tx) => {
    const [rental] = await tx
      .select()
      .from(rentals)
      .where(and(eq(rentals.id, input.rentalId), scopeWhere(input.scope)))
      .for('update')
      .limit(1)
    if (!rental) {
      return { status: 404 as const, body: { error: 'Rental not found' } }
    }
    if (!['active', 'reserved', 'past_due'].includes(rental.status)) {
      return { status: 409 as const, body: { error: 'Only active subscriptions can be extended' } }
    }
    if (rental.cancelRequestedAt) {
      return {
        status: 409 as const,
        body: { error: 'Cannot extend a subscription that is pending cancellation' },
      }
    }

    const previousEndDate = String(rental.endDate)
    const newEndDate = addMonths(previousEndDate, months)
    const previousTermMonths = rental.termMonths
    const newTermMonths = rental.termMonths + months
    const monthly = Number(rental.monthlyAmount)
    const addedAmount = monthly * months
    const newTotal = Number(rental.totalAmount) + addedAmount

    const [row] = await tx
      .update(rentals)
      .set({
        endDate: newEndDate,
        termMonths: newTermMonths,
        totalAmount: String(newTotal),
        cancellationEffectiveDate: null,
        cancelRequestedAt: null,
        cancelReason: null,
      })
      .where(eq(rentals.id, rental.id))
      .returning()

    await tx.insert(rentalExtensions).values({
      rentalId: rental.id,
      months,
      previousEndDate,
      newEndDate,
      previousTermMonths,
      newTermMonths,
    })

    const actorLabel = input.actor.role === 'dealer' ? 'Dealer extended' : 'Subscription extended'
    await tx.insert(rentalEvents).values({
      rentalId: rental.id,
      type: 'note',
      conditionNotes: `${actorLabel} by ${months} month(s). New end date: ${newEndDate}.`,
      recordedBy: input.actor.id,
    })

    return {
      status: 200 as const,
      body: mapRental(row),
      audit: { rentalId: rental.id, newEndDate, newTermMonths, addedAmount, months },
    }
  })

  if (updated.status !== 200) {
    return { status: updated.status, body: updated.body }
  }

  await logAuditSafe({
    actorId: input.actor.id,
    actorRole: input.actor.role,
    action: 'rental.extend',
    entityType: 'rental',
    entityId: updated.audit.rentalId,
    after: {
      months: updated.audit.months,
      newEndDate: updated.audit.newEndDate,
      newTermMonths: updated.audit.newTermMonths,
      addedAmount: updated.audit.addedAmount,
    },
  })

  return { status: 200, body: updated.body }
}
