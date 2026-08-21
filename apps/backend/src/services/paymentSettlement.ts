import { and, eq, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { bookingRequests, payments, vehicles } from '../db/schema.js'
import { logAudit } from './audit.js'
import { settleInvoice } from './billing.js'
import { parseCartNote } from './booking.js'
import { redeemPromoCode } from './promoCodes.js'
import { notifyUser, notifyDealerOwner } from './notify.js'
import { SkipCashStatus } from './skipcash.js'

export interface SettlementResult {
  handled: boolean
  action: string
}

function appendNote(existing: string | null, extra: string): string {
  return [existing, extra].filter(Boolean).join('\n')
}

/**
 * Applies a SkipCash transaction outcome to our payment row. This is the ONE
 * place payment state advances, shared by the webhook and the reconciliation
 * job, and it runs inside a row-locked transaction so duplicate/concurrent
 * deliveries cannot double-process (each delivery re-reads state under lock).
 */
export async function applySkipCashOutcome(params: {
  paymentId: string
  statusId: number
  reportedAmount?: string | null
}): Promise<SettlementResult> {
  const { paymentId, statusId } = params
  return db.transaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId))
      .for('update')
      .limit(1)
    if (!payment) return { handled: false, action: 'unknown-payment' }

    // ------------------------------------------------------------------ PAID
    if (statusId === SkipCashStatus.PAID) {
      if (payment.status === 'failed' && !payment.needsRefund) {
        // The provider captured money for a payment we had locally abandoned
        // (stale payUrl after a checkout retry, or a hold that expired while
        // the customer sat on the payment page). Never swallow captured money.
        await tx
          .update(payments)
          .set({
            needsRefund: true,
            note: appendNote(
              payment.note,
              'Provider reports PAID for a payment abandoned locally (stale checkout/expired hold). Needs refund or manual rebooking.'
            ),
          })
          .where(eq(payments.id, payment.id))
        await logAudit(tx, {
          action: 'payment.paid_after_local_failure',
          entityType: 'payment',
          entityId: payment.id,
        })
        return { handled: true, action: 'paid-after-local-failure' }
      }
      if (payment.status !== 'pending') {
        return { handled: true, action: 'already-processed' }
      }

      if (params.reportedAmount !== undefined && params.reportedAmount !== null) {
        const expected = Number(payment.amount)
        const received = Number(params.reportedAmount)
        if (!Number.isFinite(received) || Math.abs(expected - received) > 0.01) {
          await tx
            .update(payments)
            .set({
              status: 'failed',
              needsRefund: true,
              note: appendNote(
                payment.note,
                `Amount mismatch: expected ${expected.toFixed(2)}, provider reported ${params.reportedAmount}. Charged amount needs manual refund.`
              ),
            })
            .where(eq(payments.id, payment.id))
          await releaseHold(tx, payment.bookingRequestId)
          await logAudit(tx, {
            action: 'payment.amount_mismatch',
            entityType: 'payment',
            entityId: payment.id,
            after: { expected, reported: params.reportedAmount },
          })
          return { handled: true, action: 'amount-mismatch' }
        }
      }

      await tx.update(payments).set({ status: 'completed' }).where(eq(payments.id, payment.id))

      // Subscription-invoice payment (monthly renewal paid online).
      if (payment.invoiceId) {
        const outcome = await settleInvoice(tx, {
          invoiceId: payment.invoiceId,
          paymentId: payment.id,
        })
        if (outcome !== 'settled') {
          // Invoice was voided (subscription ended) or already paid by another
          // payment before this webhook landed. The money WAS captured: flag
          // it for refund instead of throwing/rolling back (a throw here put
          // the payment in a permanent webhook/reconcile retry loop).
          await tx
            .update(payments)
            .set({
              needsRefund: true,
              note: appendNote(
                payment.note,
                `Captured for an invoice that is ${outcome === 'already-paid' ? 'already paid' : 'no longer payable'}. Needs refund.`
              ),
            })
            .where(eq(payments.id, payment.id))
          await logAudit(tx, {
            action: 'payment.invoice.unsettleable',
            entityType: 'payment',
            entityId: payment.id,
            after: { invoiceId: payment.invoiceId, outcome },
          })
          return { handled: true, action: `invoice-${outcome}` }
        }
        if (payment.customerId) {
          await notifyUser(tx, {
            userId: payment.customerId,
            type: 'success',
            title: 'Payment received',
            message: `We received your subscription payment of QAR ${Number(payment.amount).toFixed(2)}. Thank you!`,
          })
        }
        await logAudit(tx, {
          action: 'payment.invoice.completed',
          entityType: 'payment',
          entityId: payment.id,
          after: { invoiceId: payment.invoiceId },
        })
        return { handled: true, action: 'invoice-paid' }
      }

      // Initial booking payment: the hold becomes a visible booking request.
      if (payment.bookingRequestId) {
        // Another payment already completed for this booking (two tabs, retry
        // races): this second capture is surplus money, not a second booking.
        const [completedSibling] = await tx
          .select({ id: payments.id })
          .from(payments)
          .where(
            and(
              eq(payments.bookingRequestId, payment.bookingRequestId),
              eq(payments.status, 'completed'),
              sql`${payments.id} <> ${payment.id}`
            )
          )
          .limit(1)
        if (completedSibling) {
          await tx
            .update(payments)
            .set({
              needsRefund: true,
              note: appendNote(payment.note, 'Duplicate payment for an already-paid booking. Needs refund.'),
            })
            .where(eq(payments.id, payment.id))
          await logAudit(tx, {
            action: 'payment.duplicate_booking_payment',
            entityType: 'payment',
            entityId: payment.id,
            after: { originalPaymentId: completedSibling.id },
          })
          return { handled: true, action: 'duplicate-booking-payment' }
        }

        const [br] = await tx
          .select()
          .from(bookingRequests)
          .where(eq(bookingRequests.id, payment.bookingRequestId))
          .for('update')
          .limit(1)
        if (br && br.status === 'pending' && br.awaitingPayment) {
          // The vehicle may have been rented through another path between
          // intent and webhook (TOCTOU): don't surface an unfulfillable
          // request — release the hold and flag the money.
          const [heldVehicle] = await tx
            .select({ status: vehicles.status })
            .from(vehicles)
            .where(eq(vehicles.id, br.vehicleId))
            .for('update')
            .limit(1)
          if (!heldVehicle || heldVehicle.status !== 'available') {
            await tx
              .update(bookingRequests)
              .set({
                status: 'declined',
                declineReason: 'Vehicle became unavailable before payment completed',
                awaitingPayment: false,
              })
              .where(eq(bookingRequests.id, br.id))
            await tx
              .update(payments)
              .set({
                needsRefund: true,
                note: appendNote(payment.note, 'Vehicle unavailable after payment; needs refund.'),
              })
              .where(eq(payments.id, payment.id))
            await logAudit(tx, {
              action: 'payment.paid_but_vehicle_unavailable',
              entityType: 'payment',
              entityId: payment.id,
            })
            return { handled: true, action: 'paid-but-unavailable' }
          }
          await tx
            .update(bookingRequests)
            .set({ awaitingPayment: false })
            .where(eq(bookingRequests.id, br.id))
        }
        if (br && br.status === 'declined') {
          // Hold expired (or was declined) before the webhook arrived, but the
          // customer WAS charged: surface for refund instead of losing money.
          await tx
            .update(payments)
            .set({
              needsRefund: true,
              note: appendNote(payment.note, 'Paid after the hold was released; needs refund or manual rebooking.'),
            })
            .where(eq(payments.id, payment.id))
          await logAudit(tx, {
            action: 'payment.paid_after_hold_release',
            entityType: 'payment',
            entityId: payment.id,
          })
          return { handled: true, action: 'paid-after-hold-release' }
        }
        if (br && payment.customerId) {
          await notifyUser(tx, {
            userId: payment.customerId,
            type: 'success',
            title: 'Payment received',
            message: 'Your payment was received. Your booking request is now with the dealer for approval.',
          })
        }
        if (payment.dealerId) {
          await notifyDealerOwner(tx, payment.dealerId, {
            type: 'info',
            title: 'New paid booking request',
            message: 'A customer paid online and is awaiting your approval.',
          })
        }
        await logAudit(tx, {
          action: 'payment.booking.completed',
          entityType: 'payment',
          entityId: payment.id,
          after: { bookingRequestId: payment.bookingRequestId },
        })
        const cart = parseCartNote(br?.note ?? payment.note)
        if (cart.promo?.promoCodeId && payment.customerId && cart.promo.discountAmount) {
          await redeemPromoCode(tx, {
            promoCodeId: cart.promo.promoCodeId,
            customerId: payment.customerId,
            discountAmount: cart.promo.discountAmount,
            bookingRequestId: payment.bookingRequestId ?? undefined,
          })
        }
        return { handled: true, action: 'booking-paid' }
      }

      // Legacy path (payment created before hold-at-intent existed): create
      // the booking request now that payment is confirmed.
      if (payment.customerId && payment.vehicleId) {
        const [vehicle] = await tx
          .select()
          .from(vehicles)
          .where(eq(vehicles.id, payment.vehicleId))
          .for('update')
          .limit(1)
        if (vehicle && vehicle.status === 'available') {
          try {
            const [br] = await tx
              .insert(bookingRequests)
              .values({ customerId: payment.customerId, vehicleId: payment.vehicleId, note: payment.note })
              .returning()
            await tx
              .update(payments)
              .set({ bookingRequestId: br.id })
              .where(eq(payments.id, payment.id))
            return { handled: true, action: 'booking-created-legacy' }
          } catch (err) {
            if ((err as { code?: string }).code !== '23505') throw err
          }
        }
        await tx
          .update(payments)
          .set({
            needsRefund: true,
            note: appendNote(payment.note, 'Vehicle unavailable after payment; needs refund.'),
          })
          .where(eq(payments.id, payment.id))
        return { handled: true, action: 'paid-but-unavailable' }
      }

      return { handled: true, action: 'paid-unlinked' }
    }

    // -------------------------------------------------- CANCELED / FAILED
    if (
      statusId === SkipCashStatus.CANCELED ||
      statusId === SkipCashStatus.FAILED ||
      statusId === SkipCashStatus.REJECTED
    ) {
      if (payment.status !== 'pending') {
        return { handled: true, action: 'already-processed' }
      }
      await tx.update(payments).set({ status: 'failed' }).where(eq(payments.id, payment.id))
      await releaseHold(tx, payment.bookingRequestId)
      if (payment.customerId && !payment.invoiceId) {
        await notifyUser(tx, {
          userId: payment.customerId,
          type: 'error',
          title: 'Payment not completed',
          message: 'Your online payment did not complete. The vehicle has been released — you can try booking again.',
        })
      }
      return { handled: true, action: 'failed' }
    }

    // ------------------------------------------------------------- REFUNDS
    if (statusId === SkipCashStatus.REFUNDED) {
      if (payment.status === 'refunded') return { handled: true, action: 'already-refunded' }
      await tx
        .update(payments)
        .set({
          status: 'refunded',
          refundedAmount: payment.amount,
          needsRefund: false,
          note: appendNote(payment.note, 'Refund confirmed by SkipCash.'),
        })
        .where(eq(payments.id, payment.id))
      await logAudit(tx, {
        action: 'payment.refunded.provider',
        entityType: 'payment',
        entityId: payment.id,
      })
      return { handled: true, action: 'refunded' }
    }
    if (statusId === SkipCashStatus.PENDING_REFUND) {
      await tx
        .update(payments)
        .set({ note: appendNote(payment.note, 'Refund pending at SkipCash.') })
        .where(eq(payments.id, payment.id))
      return { handled: true, action: 'refund-pending' }
    }
    if (statusId === SkipCashStatus.REFUND_FAILED) {
      // The money did NOT come back — keep the payment in its real state.
      await tx
        .update(payments)
        .set({
          needsRefund: true,
          note: appendNote(payment.note, 'SkipCash refund FAILED — needs manual follow-up.'),
        })
        .where(eq(payments.id, payment.id))
      await logAudit(tx, {
        action: 'payment.refund_failed.provider',
        entityType: 'payment',
        entityId: payment.id,
      })
      return { handled: true, action: 'refund-failed' }
    }

    // NEW / PENDING — transaction still in flight.
    return { handled: true, action: 'still-pending' }
  })
}

/** Releases an online-payment hold if the booking request is still an unpaid hold. */
async function releaseHold(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  bookingRequestId: string | null
): Promise<void> {
  if (!bookingRequestId) return
  const [br] = await tx
    .select()
    .from(bookingRequests)
    .where(eq(bookingRequests.id, bookingRequestId))
    .for('update')
    .limit(1)
  if (!br || br.status !== 'pending' || !br.awaitingPayment) return
  // Another (retried) pending payment may still be in flight for this hold.
  const [otherPending] = await tx
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.bookingRequestId, br.id), eq(payments.status, 'pending')))
    .limit(1)
  if (otherPending) return
  await tx
    .update(bookingRequests)
    .set({ status: 'declined', declineReason: 'Payment was not completed', awaitingPayment: false })
    .where(eq(bookingRequests.id, br.id))
}
