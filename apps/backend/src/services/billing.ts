import { and, eq, gt, inArray, isNotNull, lt, lte, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { bookingRequests, commissionLedger, invoices, payments, profiles, rentals } from '../db/schema.js'
import { addDays, addMonths, maxDate, nextBoundaryAfter, todayISO } from '../utils/dates.js'
import { logAudit, type DbOrTx } from './audit.js'
import { trackAnalyticsEvent } from './analyticsEvents.js'
import { getBillingGraceDays, getPaymentHoldTtlMinutes, getPlatformCommissionRate, getSubscriptionDepositAmount } from './appSettings.js'
import {
  recordCustomerPayment,
  recordDealerPayment,
  reverseCustomerPayment,
  reverseDealerPayment,
} from './counters.js'
import { dispatchCustomerTransactionalChannelsSafe } from './customerNotifications.js'
import { notifyUser } from './notify.js'
import {
  applyStoreCreditToInvoice,
  maybeGrantReferralCreditsOnFirstPayment,
  restoreStoreCreditForVoidedInvoice,
} from './referrals.js'

function defaultDepositAmount(): Promise<number> {
  return getSubscriptionDepositAmount()
}

export function computeInvoiceTax(subtotal: number): {
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
} {
  return {
    subtotal,
    taxRate: 0,
    taxAmount: 0,
    total: subtotal,
  }
}

async function recordCommissionEntry(
  tx: DbOrTx,
  params: { dealerId: string; invoiceId: string; paymentId: string; grossAmount: number }
): Promise<void> {
  const rate = await getPlatformCommissionRate()
  const commissionAmount = Math.round(params.grossAmount * rate * 100) / 100
  const netAmount = Math.round((params.grossAmount - commissionAmount) * 100) / 100
  await tx.insert(commissionLedger).values({
    dealerId: params.dealerId,
    invoiceId: params.invoiceId,
    paymentId: params.paymentId,
    grossAmount: String(params.grossAmount),
    commissionRate: String(rate),
    commissionAmount: String(commissionAmount),
    netAmount: String(netAmount),
    status: 'pending',
  })
}

function customerAppUrl(): string {
  return process.env.CUSTOMER_APP_URL || 'http://localhost:5173'
}

/**
 * Creates the first invoice for a newly approved subscription inside the
 * approval transaction. If a completed online payment already covers it, the
 * invoice is born paid and linked to that payment.
 */
export async function createFirstInvoice(
  tx: DbOrTx,
  params: {
    rentalId: string
    customerId: string
    /** Recurring list monthly price stored on the rental. */
    monthlyAmount: number
    /** First invoice charge (after promo); defaults to monthlyAmount. */
    chargeAmount?: number
    periodStart: string
    paidByPaymentId?: string | null
  }
): Promise<{ invoiceId: string; paid: boolean }> {
  const periodEnd = addMonths(params.periodStart, 1)
  const paid = !!params.paidByPaymentId
  const deposit = await defaultDepositAmount()
  const billed = params.chargeAmount ?? params.monthlyAmount
  // The online capture is the FIRST MONTH only (computeFirstPaymentAmount), so
  // rolling the refundable deposit into an invoice we mark `paid` would book
  // revenue, dealer counters and platform commission on money nobody
  // collected. The deposit is therefore always its own unpaid invoice — the
  // same shape whether the customer paid online or pays at the dealer.
  const tax = computeInvoiceTax(billed)
  if (deposit > 0) {
    await tx
      .update(rentals)
      .set({ depositAmount: String(deposit), depositRefundable: true })
      .where(eq(rentals.id, params.rentalId))
  }
  const grace = await getBillingGraceDays()
  const [invoice] = await tx
    .insert(invoices)
    .values({
      ownerId: params.customerId,
      ownerType: 'customer',
      amount: String(tax.total),
      subtotal: String(tax.subtotal),
      taxRate: String(tax.taxRate),
      taxAmount: String(tax.taxAmount),
      depositAmount: '0',
      status: paid ? 'paid' : 'due',
      date: params.periodStart,
      dueDate: paid ? params.periodStart : addDays(params.periodStart, grace),
      periodStart: params.periodStart,
      periodEnd,
      rentalId: params.rentalId,
      description: `Monthly subscription ${params.periodStart} -> ${periodEnd}`,
    })
    .returning({ id: invoices.id })
  if (deposit > 0) {
    // periodStart/periodEnd stay NULL so this row sits outside the
    // (rental_id, period_start) unique index that guards monthly billing.
    await tx.insert(invoices).values({
      ownerId: params.customerId,
      ownerType: 'customer',
      amount: String(deposit),
      subtotal: String(deposit),
      taxRate: '0',
      taxAmount: '0',
      depositAmount: String(deposit),
      status: 'due',
      date: params.periodStart,
      dueDate: addDays(params.periodStart, grace),
      rentalId: params.rentalId,
      description: `Refundable security deposit for subscription starting ${params.periodStart}`,
    })
  }
  if (!paid) {
    await applyStoreCreditToInvoice(tx, {
      customerId: params.customerId,
      invoiceId: invoice.id,
      subtotal: tax.total,
    })
  }
  await trackAnalyticsEvent(tx, {
    eventType: 'invoice_generated',
    userId: params.customerId,
    entityType: 'invoice',
    entityId: invoice.id,
    properties: { rentalId: params.rentalId, amount: tax.total },
  })
  if (paid && params.paidByPaymentId) {
    await tx
      .update(payments)
      .set({ invoiceId: invoice.id, rentalId: params.rentalId })
      .where(eq(payments.id, params.paidByPaymentId))

    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, params.paidByPaymentId))
      .limit(1)
    const [rental] = await tx
      .select()
      .from(rentals)
      .where(eq(rentals.id, params.rentalId))
      .limit(1)
    // Revenue counters and platform commission may never exceed what was
    // actually captured, whatever the invoice ends up saying.
    const settledAmount = payment ? Math.min(tax.total, Number(payment.amount)) : 0
    if (payment && rental && settledAmount > 0) {
      await recordCustomerPayment(tx, params.customerId, settledAmount)
      await recordDealerPayment(tx, rental.dealerId, settledAmount)
      await recordCommissionEntry(tx, {
        dealerId: rental.dealerId,
        invoiceId: invoice.id,
        paymentId: params.paidByPaymentId,
        grossAmount: settledAmount,
      })
      await maybeGrantReferralCreditsOnFirstPayment(tx, {
        customerId: params.customerId,
        invoiceId: invoice.id,
      })
    }
    await trackAnalyticsEvent(tx, {
      eventType: 'invoice_paid',
      userId: params.customerId,
      entityType: 'invoice',
      entityId: invoice.id,
      properties: {
        rentalId: params.rentalId,
        amount: tax.total,
        paymentId: params.paidByPaymentId,
      },
    })
  }
  return { invoiceId: invoice.id, paid }
}

/**
 * Recurring billing sweep (idempotent). For every active subscription whose
 * next billing date has arrived — and that isn't past its scheduled
 * cancellation — generate the next monthly invoice, advance the anchor, and
 * notify the customer with a payment link.
 */
export async function generateDueInvoices(now = todayISO()): Promise<number> {
  const due = await db
    .select({ id: rentals.id })
    .from(rentals)
    .where(and(eq(rentals.status, 'active'), isNotNull(rentals.nextBillingDate), lte(rentals.nextBillingDate, now)))
    .limit(500)

  let generated = 0
  for (const row of due) {
    const created = await db.transaction(async (tx) => {
      const [rental] = await tx
        .select()
        .from(rentals)
        .where(eq(rentals.id, row.id))
        .for('update')
        .limit(1)
      if (!rental || rental.status !== 'active' || !rental.nextBillingDate) return false
      if (rental.nextBillingDate > now) return false
      const periodStart = rental.nextBillingDate
      // Stop billing at the cancellation boundary.
      if (rental.cancellationEffectiveDate && periodStart >= rental.cancellationEffectiveDate) {
        await tx.update(rentals).set({ nextBillingDate: null }).where(eq(rentals.id, rental.id))
        return false
      }
      // Anchor-based boundary (month-end safe): the end of this period is the
      // next boundary of the subscription's start date, not periodStart+1mo.
      const periodEnd = nextBoundaryAfter(rental.startDate, periodStart)
      const tax = computeInvoiceTax(Number(rental.monthlyAmount))
      const grace = await getBillingGraceDays()
      const inserted = await tx
        .insert(invoices)
        .values({
          ownerId: rental.customerId,
          ownerType: 'customer',
          amount: String(tax.total),
          subtotal: String(tax.subtotal),
          taxRate: String(tax.taxRate),
          taxAmount: String(tax.taxAmount),
          status: 'due',
          date: periodStart,
          dueDate: addDays(periodStart, grace),
          periodStart,
          periodEnd,
          rentalId: rental.id,
          description: `Monthly subscription ${periodStart} -> ${periodEnd}`,
        })
        .onConflictDoNothing()
        .returning({ id: invoices.id })
      await tx
        .update(rentals)
        .set({ nextBillingDate: periodEnd, endDate: maxDate(rental.endDate, periodEnd) })
        .where(eq(rentals.id, rental.id))
      if (inserted.length === 0) return false

      const credit = await applyStoreCreditToInvoice(tx, {
        customerId: rental.customerId,
        invoiceId: inserted[0].id,
        subtotal: tax.total,
      })

      await notifyUser(tx, {
        userId: rental.customerId,
        ...(credit.fullyCovered
          ? {
              type: 'success' as const,
              title: 'Monthly payment covered by credit',
              message: `Your store credit covered this month's subscription payment of QAR ${credit.creditApplied.toFixed(2)} for ${periodStart}. Nothing is due.`,
            }
          : {
              type: 'info' as const,
              title: 'Monthly payment due',
              message: `Your subscription payment of QAR ${Number(rental.monthlyAmount).toFixed(2)} for ${periodStart} is due. Pay online from My Booking, or at your dealer.`,
            }),
      })
      await logAudit(tx, {
        action: 'billing.invoice.generated',
        entityType: 'rental',
        entityId: rental.id,
        after: { periodStart, periodEnd, amount: rental.monthlyAmount },
      })
      await trackAnalyticsEvent(tx, {
        eventType: 'invoice_generated',
        userId: rental.customerId,
        entityType: 'invoice',
        entityId: inserted[0].id,
        properties: { rentalId: rental.id, amount: tax.total, periodStart },
      })
      return {
        customerId: rental.customerId,
        amount: rental.monthlyAmount,
        periodStart,
        fullyCovered: credit.fullyCovered,
      }
    })

    if (created) {
      generated += 1
      // A credit-covered invoice is already settled — don't chase it for money.
      if (created.fullyCovered) continue
      const [customer] = await db
        .select({ email: profiles.email, name: profiles.name })
        .from(profiles)
        .where(eq(profiles.id, created.customerId))
        .limit(1)
      dispatchCustomerTransactionalChannelsSafe({
        userId: created.customerId,
        event: 'invoice_due',
        parameters: [
          customer?.name ?? 'Customer',
          Number(created.amount).toFixed(2),
          created.periodStart,
        ],
        email: customer?.email
          ? {
              subject: 'Your CarFlow monthly payment is due',
              html: `<p>Hi ${customer.name},</p>
<p>Your monthly subscription payment of <strong>QAR ${Number(created.amount).toFixed(2)}</strong> (period starting ${created.periodStart}) is due.</p>
<p><a href="${customerAppUrl()}/my-booking">Pay online from My Booking</a>, or pay at your dealer.</p>`,
            }
          : undefined,
      })
    }
  }
  return generated
}

/**
 * Dunning sweep: invoices past their grace period become overdue and the
 * subscription drops to past_due until the invoice is settled.
 */
export async function markOverdueInvoices(now = todayISO()): Promise<number> {
  const overdue = await db
    .select({ id: invoices.id, rentalId: invoices.rentalId })
    .from(invoices)
    .where(and(eq(invoices.status, 'due'), isNotNull(invoices.dueDate), lt(invoices.dueDate, now), isNotNull(invoices.rentalId)))
    .limit(500)

  let flipped = 0
  for (const inv of overdue) {
    const overdueNotify = await db.transaction(async (tx) => {
      const [invoice] = await tx
        .select()
        .from(invoices)
        .where(eq(invoices.id, inv.id))
        .for('update')
        .limit(1)
      if (!invoice || invoice.status !== 'due' || !invoice.rentalId) return null
      await tx.update(invoices).set({ status: 'overdue' }).where(eq(invoices.id, invoice.id))
      const [rental] = await tx
        .select()
        .from(rentals)
        .where(eq(rentals.id, invoice.rentalId))
        .for('update')
        .limit(1)
      if (rental && rental.status === 'active') {
        await tx
          .update(rentals)
          .set({ status: 'past_due', paymentStatus: 'pending' })
          .where(eq(rentals.id, rental.id))
        await trackAnalyticsEvent(tx, {
          eventType: 'invoice_overdue',
          userId: rental.customerId,
          entityType: 'invoice',
          entityId: invoice.id,
          properties: { rentalId: rental.id, amount: Number(invoice.amount) },
        })
        await notifyUser(tx, {
          userId: rental.customerId,
          type: 'error',
          title: 'Payment overdue',
          message: `Your subscription payment of QAR ${Number(invoice.amount).toFixed(2)} is overdue. Please pay to keep your subscription active.`,
        })
        await logAudit(tx, {
          action: 'billing.rental.past_due',
          entityType: 'rental',
          entityId: rental.id,
          after: { invoiceId: invoice.id },
        })
        return {
          customerId: rental.customerId,
          amount: Number(invoice.amount),
        }
      }
      return null
    })
    if (overdueNotify) {
      flipped += 1
      const [customer] = await db
        .select({ email: profiles.email, name: profiles.name })
        .from(profiles)
        .where(eq(profiles.id, overdueNotify.customerId))
        .limit(1)
      dispatchCustomerTransactionalChannelsSafe({
        userId: overdueNotify.customerId,
        event: 'invoice_overdue',
        parameters: [customer?.name ?? 'Customer', overdueNotify.amount.toFixed(2)],
        email: customer?.email
          ? {
              subject: 'Your CarFlow payment is overdue',
              html: `<p>Hi ${customer.name},</p>
<p>Your subscription payment of <strong>QAR ${overdueNotify.amount.toFixed(2)}</strong> is overdue.</p>
<p><a href="${customerAppUrl()}/my-booking">Pay online from My Booking</a> to restore your subscription.</p>`,
            }
          : undefined,
      })
    }
  }
  return flipped
}

export type SettleInvoiceOutcome = 'settled' | 'already-paid' | 'not-payable'

/**
 * Marks an invoice paid inside the caller's transaction and restores the
 * subscription's standing (past_due → active when nothing else is owed).
 *
 * Never throws for state conflicts (a throw here rolled back webhook
 * settlements and looped forever — re-audit F5): callers decide what to do
 * with money captured against an already-paid or voided invoice.
 */
export async function settleInvoice(
  tx: DbOrTx,
  params: { invoiceId: string; paymentId: string }
): Promise<SettleInvoiceOutcome> {
  const [invoice] = await tx
    .select()
    .from(invoices)
    .where(eq(invoices.id, params.invoiceId))
    .for('update')
    .limit(1)
  if (!invoice) throw Object.assign(new Error('Invoice not found'), { status: 404 })
  if (invoice.status === 'paid') return 'already-paid'
  if (invoice.status === 'void' || invoice.status === 'refunded') {
    return 'not-payable'
  }
  await tx.update(invoices).set({ status: 'paid' }).where(eq(invoices.id, invoice.id))
  await tx.update(payments).set({ invoiceId: invoice.id }).where(eq(payments.id, params.paymentId))

  const settledAmount = Number(invoice.amount)
  if (invoice.ownerType === 'customer' && settledAmount > 0) {
    await recordCustomerPayment(tx, invoice.ownerId, settledAmount)
  }

  if (invoice.rentalId) {
    const [rental] = await tx
      .select()
      .from(rentals)
      .where(eq(rentals.id, invoice.rentalId))
      .for('update')
      .limit(1)
    if (rental && settledAmount > 0) {
      await recordDealerPayment(tx, rental.dealerId, settledAmount)
      await recordCommissionEntry(tx, {
        dealerId: rental.dealerId,
        invoiceId: invoice.id,
        paymentId: params.paymentId,
        grossAmount: settledAmount,
      })
    }
    const [outstanding] = await tx
      .select({ count: sql<number>`count(*)` })
      .from(invoices)
      .where(
        and(
          eq(invoices.rentalId, invoice.rentalId),
          inArray(invoices.status, ['due', 'overdue']),
          sql`${invoices.id} <> ${invoice.id}`
        )
      )
    const clear = Number(outstanding?.count ?? 0) === 0
    if (rental) {
      const patch: Record<string, unknown> = {}
      if (clear) patch.paymentStatus = 'completed'
      if (clear && rental.status === 'past_due') patch.status = 'active'
      if (Object.keys(patch).length > 0) {
        await tx.update(rentals).set(patch).where(eq(rentals.id, rental.id))
      }
    }
  }
  await trackAnalyticsEvent(tx, {
    eventType: 'invoice_paid',
    userId: invoice.ownerId,
    entityType: 'invoice',
    entityId: invoice.id,
    properties: {
      rentalId: invoice.rentalId ?? undefined,
      amount: settledAmount,
      paymentId: params.paymentId,
    },
  })
  if (invoice.ownerType === 'customer') {
    await maybeGrantReferralCreditsOnFirstPayment(tx, {
      customerId: invoice.ownerId,
      invoiceId: invoice.id,
    })
  }
  return 'settled'
}

/**
 * Reverses commission, denormalized counters, and (when fully refunded) invoice
 * status for an invoice-linked payment refund. Partial refunds are proportional
 * to the payment amount.
 */
export async function reverseInvoicePaymentRefund(
  tx: DbOrTx,
  params: {
    paymentId: string
    invoiceId: string
    customerId: string
    dealerId: string
    paymentAmount: number
    refundAmount: number
    fullyRefunded: boolean
  }
): Promise<void> {
  const paid = params.paymentAmount
  const refund = params.refundAmount
  if (!Number.isFinite(paid) || paid <= 0 || !Number.isFinite(refund) || refund <= 0) return

  const ratio = refund / paid
  const grossReversal = Math.round(refund * 100) / 100

  const [original] = await tx
    .select()
    .from(commissionLedger)
    .where(
      and(
        eq(commissionLedger.paymentId, params.paymentId),
        sql`${commissionLedger.grossAmount}::numeric > 0`
      )
    )
    .orderBy(commissionLedger.createdAt)
    .limit(1)

  if (original) {
    const commissionReversal =
      Math.round(Number(original.commissionAmount) * ratio * 100) / 100
    const netReversal = Math.round(Number(original.netAmount) * ratio * 100) / 100
    await tx.insert(commissionLedger).values({
      dealerId: params.dealerId,
      invoiceId: params.invoiceId,
      paymentId: params.paymentId,
      grossAmount: String(-grossReversal),
      commissionRate: original.commissionRate,
      commissionAmount: String(-commissionReversal),
      netAmount: String(-netReversal),
      status: 'pending',
    })
  }

  await reverseCustomerPayment(tx, params.customerId, grossReversal)
  await reverseDealerPayment(tx, params.dealerId, grossReversal)

  if (params.fullyRefunded) {
    await tx.update(invoices).set({ status: 'refunded' }).where(eq(invoices.id, params.invoiceId))
  }
}

/** Oldest unpaid invoice for a rental, if any. Row-locked to serialize settlement. */
export async function findOldestUnpaidInvoice(executor: DbOrTx, rentalId: string) {
  const rows = await executor
    .select()
    .from(invoices)
    .where(and(eq(invoices.rentalId, rentalId), inArray(invoices.status, ['due', 'overdue'])))
    .orderBy(invoices.periodStart)
    .for('update')
    .limit(1)
  return rows[0]
}

export async function releaseExpiredHolds(): Promise<number> {
  const ttlMinutes = await getPaymentHoldTtlMinutes()
  const cutoff = new Date(Date.now() - ttlMinutes * 60 * 1000)
  const stale = await db
    .select({ id: bookingRequests.id })
    .from(bookingRequests)
    .where(
      and(
        eq(bookingRequests.status, 'pending'),
        eq(bookingRequests.awaitingPayment, true),
        lt(bookingRequests.createdAt, cutoff)
      )
    )
    .limit(200)

  let released = 0
  for (const hold of stale) {
    await db.transaction(async (tx) => {
      const [br] = await tx
        .select()
        .from(bookingRequests)
        .where(eq(bookingRequests.id, hold.id))
        .for('update')
        .limit(1)
      if (!br || br.status !== 'pending' || !br.awaitingPayment) return
      // A completed payment means the webhook already landed; leave it alone.
      const [paid] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.bookingRequestId, br.id), eq(payments.status, 'completed')))
        .limit(1)
      if (paid) {
        await tx.update(bookingRequests).set({ awaitingPayment: false }).where(eq(bookingRequests.id, br.id))
        return
      }
      // TTL must follow the LATEST payment attempt, not the hold's creation:
      // a customer who came back and restarted checkout gets a fresh window
      // (re-audit F9 — expiring a fresh retry fed the paid-after-failure hole).
      const [freshAttempt] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(
          and(
            eq(payments.bookingRequestId, br.id),
            eq(payments.status, 'pending'),
            gt(payments.createdAt, cutoff)
          )
        )
        .limit(1)
      if (freshAttempt) return
      await tx
        .update(bookingRequests)
        .set({ status: 'declined', declineReason: 'Payment was not completed', awaitingPayment: false })
        .where(eq(bookingRequests.id, br.id))
      await tx
        .update(payments)
        .set({ status: 'failed' })
        .where(and(eq(payments.bookingRequestId, br.id), eq(payments.status, 'pending')))
      await logAudit(tx, {
        action: 'billing.hold.expired',
        entityType: 'booking_request',
        entityId: br.id,
      })
      released += 1
    })
  }
  return released
}

export type VoidInvoiceOutcome = 'voided' | 'not-found' | 'not-voidable'

/**
 * Voids every open invoice for a rental and gives back any store credit those
 * invoices had already consumed.
 *
 * By default only `due` (future/current period) invoices are voided —
 * `overdue` invoices are real receivables and must survive a return so the
 * debt isn't silently erased (re-audit F10). Cancellations may forgive
 * everything explicitly.
 *
 * Exported so every void path (rental return/cancel/force-complete as well as
 * the admin void below) restores credit the same way: referrals consume credit
 * at invoice GENERATION, so voiding without this destroys it outright.
 */
export async function voidOpenInvoicesForRental(
  tx: DbOrTx,
  rentalId: string,
  opts: { includeOverdue?: boolean } = {}
): Promise<{ voided: number; creditRestored: number }> {
  const voidedRows = await tx
    .update(invoices)
    .set({ status: 'void' })
    .where(
      and(
        eq(invoices.rentalId, rentalId),
        inArray(invoices.status, opts.includeOverdue ? ['due', 'overdue'] : ['due'])
      )
    )
    .returning({ id: invoices.id })

  let creditRestored = 0
  for (const row of voidedRows) {
    creditRestored += await restoreStoreCreditForVoidedInvoice(tx, { invoiceId: row.id })
  }
  return { voided: voidedRows.length, creditRestored }
}

/** Admin reversal: void an unpaid invoice (due/overdue only). */
export async function voidInvoiceByAdmin(invoiceId: string): Promise<VoidInvoiceOutcome> {
  return db.transaction(async (tx) => {
    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .for('update')
      .limit(1)
    if (!invoice) return 'not-found'
    if (invoice.status !== 'due' && invoice.status !== 'overdue') return 'not-voidable'
    await tx.update(invoices).set({ status: 'void' }).where(eq(invoices.id, invoiceId))
    // Credit consumed by this invoice goes back to the customer's balance —
    // the status guard above makes this idempotent (a re-void is 'not-voidable').
    await restoreStoreCreditForVoidedInvoice(tx, { invoiceId })
    return 'voided'
  })
}
