import { and, eq } from 'drizzle-orm'
import type { Express } from 'express'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../../db/index.js'
import {
  commissionLedger,
  customerProfiles,
  dealers,
  invoices,
  payments,
  payouts,
  rentals,
} from '../../db/schema.js'
import { settleInvoice } from '../../services/billing.js'
import { buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'

describe('Money integrity — refunds and payouts', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    await resetDb()
  })

  it('MONEY-01: full refund of a settled invoice reverses commission, counters, and marks invoice refunded', async () => {
    const fixtures = await seedFixtures()
    const invoiceAmount = 13500
    const today = new Date().toISOString().slice(0, 10)
    const [rental] = await db
      .insert(rentals)
      .values({
        customerId: fixtures.customer.id,
        dealerId: fixtures.dealer.dealerId,
        vehicleId: fixtures.vehicles[0].id,
        startDate: today,
        endDate: today,
        status: 'active',
        totalAmount: String(invoiceAmount),
        monthlyAmount: String(invoiceAmount),
        paymentStatus: 'pending',
      })
      .returning()
    const [invoice] = await db
      .insert(invoices)
      .values({
        rentalId: rental.id,
        ownerType: 'customer',
        ownerId: fixtures.customer.id,
        amount: String(invoiceAmount),
        subtotal: String(invoiceAmount),
        description: 'Monthly subscription',
        status: 'due',
        periodStart: '2026-01-01',
        periodEnd: '2026-02-01',
        dueDate: '2026-01-01',
      })
      .returning()
    const [payment] = await db
      .insert(payments)
      .values({
        customerId: fixtures.customer.id,
        dealerId: fixtures.dealer.dealerId,
        invoiceId: invoice.id,
        amount: String(invoiceAmount),
        status: 'completed',
        type: 'subscription',
        method: 'card',
      })
      .returning()

    await db.transaction(async (tx) => {
      await settleInvoice(tx, { invoiceId: invoice.id, paymentId: payment.id })
    })

    const [customerBefore] = await db
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, fixtures.customer.id))
    const [dealerBefore] = await db
      .select()
      .from(dealers)
      .where(eq(dealers.id, fixtures.dealer.dealerId))
    expect(Number(customerBefore.totalSpent)).toBe(invoiceAmount)
    expect(Number(dealerBefore.totalRevenue)).toBe(invoiceAmount)
    const ledgerBefore = await db
      .select()
      .from(commissionLedger)
      .where(eq(commissionLedger.paymentId, payment.id))
    expect(ledgerBefore).toHaveLength(1)
    expect(Number(ledgerBefore[0].netAmount)).toBe(Math.round(invoiceAmount * 0.9 * 100) / 100)

    const { agent: adminAgent } = await loginAs(app, fixtures.admin.email, 'admin')
    const refund = await adminAgent
      .post(`/api/admin/payments/${payment.id}/refund`)
      .send({ manualConfirmed: true })
    expect(refund.status).toBe(200)
    expect(refund.body.status).toBe('refunded')

    const [invoiceAfter] = await db.select().from(invoices).where(eq(invoices.id, invoice.id))
    expect(invoiceAfter.status).toBe('refunded')

    const [customerAfter] = await db
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, fixtures.customer.id))
    const [dealerAfter] = await db
      .select()
      .from(dealers)
      .where(eq(dealers.id, fixtures.dealer.dealerId))
    expect(Number(customerAfter.totalSpent)).toBe(0)
    expect(Number(dealerAfter.totalRevenue)).toBe(0)

    const ledger = await db
      .select()
      .from(commissionLedger)
      .where(eq(commissionLedger.paymentId, payment.id))
    expect(ledger).toHaveLength(2)
    const reversal = ledger.find((row) => Number(row.netAmount) < 0)
    expect(reversal).toBeTruthy()
    expect(Number(reversal!.netAmount)).toBe(-Number(ledgerBefore[0].netAmount))
  })

  it('MONEY-02: payout batching only includes rows locked in the transaction; late rows stay pending', async () => {
    const fixtures = await seedFixtures()
    await db
      .update(dealers)
      .set({
        bankAccountName: 'Premium Cars QA',
        bankName: 'QNB',
        bankIban: 'QA58QNBA000000000000000000001',
        bankDetailsVerifiedAt: new Date(),
      })
      .where(eq(dealers.id, fixtures.dealer.dealerId))

    const [first] = await db
      .insert(commissionLedger)
      .values({
        dealerId: fixtures.dealer.dealerId,
        grossAmount: '200',
        commissionRate: '0.1',
        commissionAmount: '20',
        netAmount: '180',
        status: 'pending',
      })
      .returning()

    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')
    const firstBatch = await agent.post('/api/admin/payouts/generate')
    expect(firstBatch.status).toBe(200)
    expect(firstBatch.body.created).toBe(1)

    const [late] = await db
      .insert(commissionLedger)
      .values({
        dealerId: fixtures.dealer.dealerId,
        grossAmount: '100',
        commissionRate: '0.1',
        commissionAmount: '10',
        netAmount: '90',
        status: 'pending',
      })
      .returning()

    const [firstRow] = await db.select().from(commissionLedger).where(eq(commissionLedger.id, first.id))
    expect(firstRow.status).toBe('batched')
    expect(firstRow.payoutId).toBeTruthy()

    const [payout] = await db.select().from(payouts).where(eq(payouts.id, firstRow.payoutId!))
    expect(Number(payout.amount)).toBe(180)

    const batchedForPayout = await db
      .select()
      .from(commissionLedger)
      .where(and(eq(commissionLedger.payoutId, firstRow.payoutId!), eq(commissionLedger.status, 'batched')))
    expect(batchedForPayout).toHaveLength(1)
    expect(batchedForPayout[0].id).toBe(first.id)

    const secondBatch = await agent.post('/api/admin/payouts/generate')
    expect(secondBatch.status).toBe(200)
    expect(secondBatch.body.created).toBe(1)

    const [lateRow] = await db.select().from(commissionLedger).where(eq(commissionLedger.id, late.id))
    expect(lateRow.status).toBe('batched')
    expect(lateRow.payoutId).not.toBe(firstRow.payoutId)

    const [secondPayout] = await db.select().from(payouts).where(eq(payouts.id, lateRow.payoutId!))
    expect(Number(secondPayout.amount)).toBe(90)
  })
})
