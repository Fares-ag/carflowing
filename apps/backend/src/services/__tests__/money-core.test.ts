import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/index.js'
import {
  auditLogs,
  bookingRequests,
  commissionLedger,
  customerCredits,
  invoices,
  payments,
  promoCodes,
  rentals,
} from '../../db/schema.js'
import { resetDb, seedFixtures } from '../../test/helpers.js'
import { invalidateAppSettingsCache } from '../appSettings.js'
import { addDays, todayISO } from '../../utils/dates.js'
import {
  createFirstInvoice,
  voidInvoiceByAdmin,
  voidOpenInvoicesForRental,
} from '../billing.js'
import { applyStoreCreditToInvoice, getCustomerCreditBalance } from '../referrals.js'
import { applySkipCashOutcome, expireStaleSkipCashIntent } from '../paymentSettlement.js'
import { reconcilePendingSkipCashPayments, resetReconcileCursor } from '../reconciliation.js'
import { SkipCashStatus } from '../skipcash.js'

vi.mock('../skipcash.js', async () => {
  const actual = await vi.importActual<typeof import('../skipcash.js')>('../skipcash.js')
  return { ...actual, getSkipCashPayment: vi.fn() }
})
const { getSkipCashPayment } = await import('../skipcash.js')

type Fixtures = Awaited<ReturnType<typeof seedFixtures>>

async function seedRental(fixtures: Fixtures, overrides: Record<string, unknown> = {}) {
  const [rental] = await db
    .insert(rentals)
    .values({
      customerId: fixtures.customer.id,
      dealerId: fixtures.dealer.dealerId,
      vehicleId: fixtures.vehicles[0].id,
      startDate: todayISO(),
      endDate: addDays(todayISO(), 30),
      status: 'active',
      totalAmount: '13500',
      monthlyAmount: '13500',
      termMonths: 1,
      ...overrides,
    })
    .returning()
  return rental
}

describe('money-core: first invoice and the subscription deposit', () => {
  beforeEach(() => {
    invalidateAppSettingsCache()
  })

  afterEach(async () => {
    delete process.env.SUBSCRIPTION_DEPOSIT_AMOUNT
    invalidateAppSettingsCache()
    await resetDb()
  })

  it('never marks a deposit paid out of a first payment that only covered the month', async () => {
    process.env.SUBSCRIPTION_DEPOSIT_AMOUNT = '2000'
    invalidateAppSettingsCache()
    const fixtures = await seedFixtures()
    const rental = await seedRental(fixtures)
    // What the SkipCash hosted page actually captured: the first month only.
    const [payment] = await db
      .insert(payments)
      .values({
        customerId: fixtures.customer.id,
        dealerId: fixtures.dealer.dealerId,
        rentalId: rental.id,
        amount: '13500',
        status: 'completed',
        type: 'rental',
        method: 'card',
        provider: 'skipcash',
      })
      .returning()

    await db.transaction(async (tx) => {
      await createFirstInvoice(tx, {
        rentalId: rental.id,
        customerId: fixtures.customer.id,
        monthlyAmount: 13500,
        periodStart: rental.startDate,
        paidByPaymentId: payment.id,
      })
    })

    const rows = await db.select().from(invoices).where(eq(invoices.rentalId, rental.id))
    const paidInvoice = rows.find((r) => r.status === 'paid')!
    const depositInvoice = rows.find((r) => r.status === 'due')!

    // The invoice marked paid is exactly the captured amount — no deposit.
    expect(Number(paidInvoice.amount)).toBe(13500)
    expect(Number(paidInvoice.depositAmount)).toBe(0)
    // The uncollected deposit is its own unpaid invoice, outside the
    // (rental_id, period_start) monthly-billing unique index.
    expect(Number(depositInvoice.amount)).toBe(2000)
    expect(depositInvoice.periodStart).toBeNull()
    expect(depositInvoice.description).toMatch(/deposit/i)

    // Commission is booked on captured money only.
    const ledger = await db
      .select()
      .from(commissionLedger)
      .where(eq(commissionLedger.dealerId, fixtures.dealer.dealerId))
    expect(ledger).toHaveLength(1)
    expect(Number(ledger[0].grossAmount)).toBe(13500)

    const [updatedRental] = await db.select().from(rentals).where(eq(rentals.id, rental.id))
    expect(Number(updatedRental.depositAmount)).toBe(2000)
    expect(updatedRental.depositRefundable).toBe(true)
  })

  it('creates exactly one invoice when no deposit is configured', async () => {
    const fixtures = await seedFixtures()
    const rental = await seedRental(fixtures)
    await db.transaction(async (tx) => {
      await createFirstInvoice(tx, {
        rentalId: rental.id,
        customerId: fixtures.customer.id,
        monthlyAmount: 13500,
        periodStart: rental.startDate,
      })
    })
    const rows = await db.select().from(invoices).where(eq(invoices.rentalId, rental.id))
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('due')
    expect(Number(rows[0].amount)).toBe(13500)
  })
})

describe('money-core: store credit survives a void', () => {
  afterEach(async () => {
    await resetDb()
  })

  async function invoiceWithCredit(fixtures: Fixtures, creditAmount: number, subtotal: number) {
    const rental = await seedRental(fixtures)
    await db.insert(customerCredits).values({
      userId: fixtures.customer.id,
      amount: String(creditAmount),
      remainingAmount: String(creditAmount),
      source: 'referral_referred',
    })
    const [invoice] = await db
      .insert(invoices)
      .values({
        ownerId: fixtures.customer.id,
        ownerType: 'customer',
        amount: String(subtotal),
        subtotal: String(subtotal),
        status: 'due',
        date: todayISO(),
        dueDate: addDays(todayISO(), 5),
        periodStart: todayISO(),
        periodEnd: addDays(todayISO(), 30),
        rentalId: rental.id,
        description: 'Monthly subscription',
      })
      .returning()
    const applied = await db.transaction((tx) =>
      applyStoreCreditToInvoice(tx, {
        customerId: fixtures.customer.id,
        invoiceId: invoice.id,
        subtotal,
      })
    )
    return { rental, invoice, applied }
  }

  it('restores credit consumed by an invoice an admin voids', async () => {
    const fixtures = await seedFixtures()
    const { invoice } = await invoiceWithCredit(fixtures, 50, 13500)
    expect(await getCustomerCreditBalance(fixtures.customer.id)).toBe(0)

    expect(await voidInvoiceByAdmin(invoice.id)).toBe('voided')

    expect(await getCustomerCreditBalance(fixtures.customer.id)).toBe(50)
    const restored = await db
      .select()
      .from(customerCredits)
      .where(eq(customerCredits.source, `invoice_void_restore:${invoice.id}`))
    expect(restored).toHaveLength(1)
    expect(Number(restored[0].amount)).toBe(50)
    const audits = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, invoice.id), eq(auditLogs.action, 'billing.credit.restored')))
    expect(audits).toHaveLength(1)
  })

  it('does not mint credit twice when the void is retried', async () => {
    const fixtures = await seedFixtures()
    const { invoice } = await invoiceWithCredit(fixtures, 50, 13500)
    expect(await voidInvoiceByAdmin(invoice.id)).toBe('voided')
    expect(await voidInvoiceByAdmin(invoice.id)).toBe('not-voidable')
    expect(await getCustomerCreditBalance(fixtures.customer.id)).toBe(50)
  })

  it('restores credit when a subscription void sweeps the rental (return/cancel path)', async () => {
    const fixtures = await seedFixtures()
    const { rental, invoice } = await invoiceWithCredit(fixtures, 50, 13500)

    const result = await db.transaction((tx) => voidOpenInvoicesForRental(tx, rental.id))

    expect(result).toEqual({ voided: 1, creditRestored: 50 })
    expect(await getCustomerCreditBalance(fixtures.customer.id)).toBe(50)
    const [after] = await db.select().from(invoices).where(eq(invoices.id, invoice.id))
    expect(after.status).toBe('void')
    expect(Number(after.creditApplied)).toBe(0)
  })

  it('settles an invoice fully covered by credit instead of leaving a 0.01 residue', async () => {
    const fixtures = await seedFixtures()
    const { invoice, applied } = await invoiceWithCredit(fixtures, 500, 400)

    expect(applied).toEqual({ subtotal: 0, creditApplied: 400, fullyCovered: true })
    const [after] = await db.select().from(invoices).where(eq(invoices.id, invoice.id))
    expect(after.status).toBe('paid')
    expect(Number(after.amount)).toBe(0)
    expect(Number(after.subtotal)).toBe(0)
    expect(Number(after.creditApplied)).toBe(400)
    // 100 of the 500 credit is left over.
    expect(await getCustomerCreditBalance(fixtures.customer.id)).toBe(100)
  })
})

describe('money-core: promo redemption failure at settlement', () => {
  afterEach(async () => {
    await resetDb()
  })

  it('flags the payment instead of silently honouring an unredeemable promo', async () => {
    const fixtures = await seedFixtures()
    const [promo] = await db
      .insert(promoCodes)
      .values({
        code: 'CAPPED10',
        discountType: 'percent',
        discountValue: '10',
        maxUses: 1,
        usedCount: 1, // already exhausted by the time the webhook lands
        active: true,
      })
      .returning()

    const cart = {
      durationMonths: 1,
      promo: { code: 'CAPPED10', promoCodeId: promo.id, discountAmount: 1350 },
    }
    const [hold] = await db
      .insert(bookingRequests)
      .values({
        customerId: fixtures.customer.id,
        vehicleId: fixtures.vehicles[0].id,
        note: JSON.stringify(cart),
        awaitingPayment: true,
      })
      .returning()
    const [payment] = await db
      .insert(payments)
      .values({
        customerId: fixtures.customer.id,
        dealerId: fixtures.dealer.dealerId,
        vehicleId: fixtures.vehicles[0].id,
        bookingRequestId: hold.id,
        note: JSON.stringify(cart),
        amount: '12150',
        status: 'pending',
        type: 'rental',
        method: 'card',
        provider: 'skipcash',
      })
      .returning()

    const result = await applySkipCashOutcome({
      paymentId: payment.id,
      statusId: SkipCashStatus.PAID,
    })
    expect(result).toEqual({ handled: true, action: 'booking-paid' })

    const [settled] = await db.select().from(payments).where(eq(payments.id, payment.id))
    expect(settled.status).toBe('completed')
    expect(settled.note).toMatch(/could NOT be redeemed/)
    expect(settled.note).toMatch(/needs ops review/i)

    const audits = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'payment.promo.redeem_failed'))
    expect(audits).toHaveLength(1)
    expect((audits[0].after as Record<string, unknown>).discountAmount).toBe(1350)

    // The cap still holds — the code was not quietly spent a second time.
    const [afterPromo] = await db.select().from(promoCodes).where(eq(promoCodes.id, promo.id))
    expect(afterPromo.usedCount).toBe(1)
  })
})

describe('money-core: reconciliation sweep', () => {
  beforeEach(() => {
    resetReconcileCursor()
    vi.mocked(getSkipCashPayment).mockReset()
  })

  afterEach(async () => {
    delete process.env.PAYMENT_INTENT_TTL_MINUTES
    await resetDb()
  })

  async function stalePayment(fixtures: Fixtures, status: 'pending' | 'failed', minutesAgo: number) {
    const [row] = await db
      .insert(payments)
      .values({
        customerId: fixtures.customer.id,
        dealerId: fixtures.dealer.dealerId,
        vehicleId: fixtures.vehicles[0].id,
        amount: '13500',
        status,
        type: 'rental',
        method: 'card',
        provider: 'skipcash',
        externalTransactionId: `ext-${status}-${minutesAgo}`,
        createdAt: new Date(Date.now() - minutesAgo * 60 * 1000),
      })
      .returning()
    return row
  }

  it('recovers money captured on a payment we had already marked failed', async () => {
    const fixtures = await seedFixtures()
    const payment = await stalePayment(fixtures, 'failed', 120)
    vi.mocked(getSkipCashPayment).mockResolvedValue({ statusId: SkipCashStatus.PAID })

    expect(await reconcilePendingSkipCashPayments()).toBe(1)

    const [after] = await db.select().from(payments).where(eq(payments.id, payment.id))
    expect(after.needsRefund).toBe(true)
    expect(after.note).toMatch(/abandoned locally/)
  })

  it('ignores a failed payment older than the 7-day lookback', async () => {
    const fixtures = await seedFixtures()
    await stalePayment(fixtures, 'failed', 8 * 24 * 60)
    vi.mocked(getSkipCashPayment).mockResolvedValue({ statusId: SkipCashStatus.PAID })

    expect(await reconcilePendingSkipCashPayments()).toBe(0)
    expect(getSkipCashPayment).not.toHaveBeenCalled()
  })

  it('expires a pending intent the provider still reports as NEW past its TTL', async () => {
    process.env.PAYMENT_INTENT_TTL_MINUTES = '60'
    const fixtures = await seedFixtures()
    const payment = await stalePayment(fixtures, 'pending', 180)
    vi.mocked(getSkipCashPayment).mockResolvedValue({ statusId: SkipCashStatus.NEW })

    expect(await reconcilePendingSkipCashPayments()).toBe(1)

    const [after] = await db.select().from(payments).where(eq(payments.id, payment.id))
    expect(after.status).toBe('failed')
    expect(after.note).toMatch(/Expired locally/)
    // Still carries its external id, so a late capture is still recoverable.
    expect(after.externalTransactionId).toBeTruthy()
  })

  it('leaves a still-in-flight intent alone while it is inside its TTL', async () => {
    process.env.PAYMENT_INTENT_TTL_MINUTES = '600'
    const fixtures = await seedFixtures()
    const payment = await stalePayment(fixtures, 'pending', 30)
    vi.mocked(getSkipCashPayment).mockResolvedValue({ statusId: SkipCashStatus.PENDING })

    expect(await reconcilePendingSkipCashPayments()).toBe(0)

    const [after] = await db.select().from(payments).where(eq(payments.id, payment.id))
    expect(after.status).toBe('pending')
  })

  it('expireStaleSkipCashIntent releases the checkout hold it was holding', async () => {
    const fixtures = await seedFixtures()
    const [hold] = await db
      .insert(bookingRequests)
      .values({
        customerId: fixtures.customer.id,
        vehicleId: fixtures.vehicles[0].id,
        awaitingPayment: true,
      })
      .returning()
    const [payment] = await db
      .insert(payments)
      .values({
        customerId: fixtures.customer.id,
        vehicleId: fixtures.vehicles[0].id,
        bookingRequestId: hold.id,
        amount: '13500',
        status: 'pending',
        type: 'rental',
        method: 'card',
        provider: 'skipcash',
        externalTransactionId: 'ext-hold-1',
      })
      .returning()

    expect(await expireStaleSkipCashIntent(payment.id)).toEqual({
      handled: true,
      action: 'intent-expired',
    })
    // Idempotent: a second sweep finds nothing left to do.
    expect((await expireStaleSkipCashIntent(payment.id)).handled).toBe(false)

    const [releasedHold] = await db
      .select()
      .from(bookingRequests)
      .where(eq(bookingRequests.id, hold.id))
    expect(releasedHold.status).toBe('declined')
    expect(releasedHold.awaitingPayment).toBe(false)
  })
})
