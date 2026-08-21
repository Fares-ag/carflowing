import { createHmac } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { Express } from 'express'
import request from 'supertest'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/index.js'
import { bookingRequests, invoices, payments, rentals, vehicles } from '../../db/schema.js'
import { generateDueInvoices, markOverdueInvoices } from '../../services/billing.js'
import { runJobsOnce } from '../../services/scheduler.js'
import { createSkipCashPayment } from '../../services/skipcash.js'
import { buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'
import { nextBoundaryAfter, nextBoundaryOnOrAfter } from '../../utils/dates.js'

vi.mock('../../services/skipcash.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/skipcash.js')>()
  return { ...actual, createSkipCashPayment: vi.fn() }
})

process.env.SKIPCASH_WEBHOOK_KEY = 'test-webhook-key'

function signWebhook(payload: {
  PaymentId: string
  Amount: string
  StatusId: number
  TransactionId?: string
}): string {
  const fields = ['PaymentId', 'Amount', 'StatusId', 'TransactionId', 'Custom1', 'VisaId'] as const
  const combined = fields
    .filter((key) => (payload as Record<string, unknown>)[key] !== undefined)
    .map((key) => `${key}=${(payload as Record<string, unknown>)[key]}`)
    .join(',')
  return createHmac('sha256', 'test-webhook-key').update(combined).digest('base64')
}

function postWebhook(app: Express, payload: Parameters<typeof signWebhook>[0]) {
  return request(app)
    .post('/api/payments/skipcash/webhook')
    .set('Authorization', signWebhook(payload))
    .send(payload)
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

async function bookAndApprove(app: Express, fixtures: Awaited<ReturnType<typeof seedFixtures>>) {
  const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')
  const br = await customerAgent
    .post('/api/customer/booking-requests')
    .send({ vehicleId: fixtures.vehicles[0].id, note: JSON.stringify({ durationMonths: 3 }) })
  const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
  await dealerAgent.patch(`/api/dealer/booking-requests/${br.body.id}/status`).send({ status: 'approved' })
  const [rental] = await db.select().from(rentals)
  return { rental, dealerAgent, customerAgent }
}

/** ID: RA-01..RA-13 — regression tests for re-audit findings */
describe('Re-audit regressions', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    await resetDb()
    vi.mocked(createSkipCashPayment).mockReset()
  })

  it('RA-01 (F1): job sweeps acquire/release the advisory lock repeatedly on a pooled client', async () => {
    const first = await runJobsOnce()
    expect(first).not.toBeNull()
    const second = await runJobsOnce()
    expect(second).not.toBeNull() // pre-fix: the wedged lock made this null forever
    const third = await runJobsOnce()
    expect(third).not.toBeNull()
  })

  it('RA-02 (F2): provider PAID for a locally-failed payment is flagged, never swallowed', async () => {
    vi.mocked(createSkipCashPayment)
      .mockResolvedValueOnce({ id: 'ext-A', payUrl: 'https://pay/a', statusId: 0 })
      .mockResolvedValueOnce({ id: 'ext-B', payUrl: 'https://pay/b', statusId: 0 })
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const contact = { firstName: 'J', lastName: 'D', phone: '+97455512345', email: 'j@test.dev' }
    const first = await agent
      .post('/api/payments/skipcash/create-intent')
      .send({ vehicleId: fixtures.vehicles[0].id, contact })
    expect(first.status).toBe(201)
    // Retry marks the first attempt failed and issues a new payUrl.
    const second = await agent
      .post('/api/payments/skipcash/create-intent')
      .send({ vehicleId: fixtures.vehicles[0].id, contact })
    expect(second.status).toBe(201)
    const [p1] = await db.select().from(payments).where(eq(payments.id, first.body.paymentId))
    expect(p1.status).toBe('failed')

    // Customer pays the STALE payUrl anyway → money captured at provider.
    const res = await postWebhook(app, {
      PaymentId: 'ext-A',
      Amount: (450 * 30).toFixed(2),
      StatusId: 2,
      TransactionId: first.body.paymentId,
    })
    expect(res.status).toBe(200)
    const [after] = await db.select().from(payments).where(eq(payments.id, first.body.paymentId))
    expect(after.needsRefund).toBe(true) // pre-fix: silently 'already-processed'
    // Exactly one pending attempt survives per booking request.
    const pending = await db
      .select()
      .from(payments)
      .where(and(eq(payments.bookingRequestId, p1.bookingRequestId!), eq(payments.status, 'pending')))
    expect(pending).toHaveLength(1)
  })

  it('RA-03 (F3): a second capture against an already-paid invoice is flagged for refund', async () => {
    const fixtures = await seedFixtures()
    const { rental, dealerAgent } = await bookAndApprove(app, fixtures)
    await dealerAgent.post('/api/dealer/payments/offline').send({ rentalId: rental.id })
    const [invoice] = await db.select().from(invoices).where(eq(invoices.rentalId, rental.id))
    expect(invoice.status).toBe('paid')

    // A stray online payment for the same (already paid) invoice completes.
    const [stray] = await db
      .insert(payments)
      .values({
        customerId: rental.customerId,
        dealerId: rental.dealerId,
        rentalId: rental.id,
        invoiceId: invoice.id,
        amount: invoice.amount,
        status: 'pending',
        type: 'subscription',
        method: 'card',
        provider: 'skipcash',
        externalTransactionId: 'ext-stray',
      })
      .returning()
    const res = await postWebhook(app, {
      PaymentId: 'ext-stray',
      Amount: Number(invoice.amount).toFixed(2),
      StatusId: 2,
      TransactionId: stray.id,
    })
    expect(res.status).toBe(200)
    const [after] = await db.select().from(payments).where(eq(payments.id, stray.id))
    expect(after.status).toBe('completed')
    expect(after.needsRefund).toBe(true) // pre-fix: silent double collection
  })

  it('RA-04 (F5): PAID for a voided invoice settles cleanly with a refund flag (no retry loop)', async () => {
    vi.mocked(createSkipCashPayment).mockResolvedValue({ id: 'ext-inv', payUrl: 'https://pay/i', statusId: 0 })
    const fixtures = await seedFixtures()
    const { profiles } = await import('../../db/schema.js')
    await db.update(profiles).set({ phone: '+97455512345' }).where(eq(profiles.id, fixtures.customer.id))
    const { rental, customerAgent } = await bookAndApprove(app, fixtures)
    const [invoice] = await db.select().from(invoices).where(eq(invoices.rentalId, rental.id))
    const intent = await customerAgent
      .post('/api/payments/skipcash/invoice-intent')
      .send({ invoiceId: invoice.id })
    expect(intent.status).toBe(201)

    // Admin cancels the subscription → invoice voided while payUrl is live.
    const { agent: adminAgent } = await loginAs(app, fixtures.admin.email, 'admin')
    await adminAgent.post(`/api/admin/rentals/${rental.id}/cancel`).send({ reason: 'ops' })
    const [voided] = await db.select().from(invoices).where(eq(invoices.id, invoice.id))
    expect(voided.status).toBe('void')

    const res = await postWebhook(app, {
      PaymentId: 'ext-inv',
      Amount: Number(invoice.amount).toFixed(2),
      StatusId: 2,
      TransactionId: intent.body.paymentId,
    })
    expect(res.status).toBe(200) // pre-fix: 500 + permanent reconcile loop
    const [paid] = await db.select().from(payments).where(eq(payments.id, intent.body.paymentId))
    expect(paid.status).toBe('completed')
    expect(paid.needsRefund).toBe(true)
  })

  it('RA-05 (L1): billing boundaries stay anchored to the start date across month-ends', () => {
    // Jan 31 anchor: Feb clamps to 28, but March must return to the 31st.
    expect(nextBoundaryOnOrAfter('2026-01-31', '2026-02-01')).toBe('2026-02-28')
    expect(nextBoundaryAfter('2026-01-31', '2026-02-28')).toBe('2026-03-31')
    expect(nextBoundaryAfter('2026-01-31', '2026-03-31')).toBe('2026-04-30')
    expect(nextBoundaryAfter('2026-01-31', '2026-04-30')).toBe('2026-05-31')
    // 12-month min term from Jan 31 lands exactly on Jan 31 next year.
    expect(nextBoundaryOnOrAfter('2026-01-31', '2027-01-29')).toBe('2027-01-31')
  })

  it('RA-06 (F6): concurrent partial refunds can never exceed the payment amount', async () => {
    const fixtures = await seedFixtures()
    const { rental, dealerAgent } = await bookAndApprove(app, fixtures)
    await dealerAgent.post('/api/dealer/payments/offline').send({ rentalId: rental.id })
    const [payment] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.rentalId, rental.id), eq(payments.status, 'completed')))
    const full = Number(payment.amount)

    const { agent: adminAgent } = await loginAs(app, fixtures.admin.email, 'admin')
    const [a, b] = await Promise.all([
      adminAgent.post(`/api/admin/payments/${payment.id}/refund`).send({ amount: full, manualConfirmed: true }),
      adminAgent.post(`/api/admin/payments/${payment.id}/refund`).send({ amount: full, manualConfirmed: true }),
    ])
    const codes = [a.status, b.status].sort()
    expect(codes[0]).toBe(200)
    expect([400, 409]).toContain(codes[1]) // pre-fix: both 200 → 2× over-refund
    const [after] = await db.select().from(payments).where(eq(payments.id, payment.id))
    expect(Number(after.refundedAmount)).toBeLessThanOrEqual(full + 0.001)
    const refundRows = await db.select().from(payments).where(eq(payments.refundOfPaymentId, payment.id))
    const refunded = refundRows.reduce((s, r) => s + Number(r.amount), 0)
    expect(refunded).toBeLessThanOrEqual(full + 0.001)
  })

  it('RA-07 (F10): returning a past_due rental preserves the overdue receivable and it stays payable', async () => {
    const fixtures = await seedFixtures()
    const { rental, dealerAgent } = await bookAndApprove(app, fixtures)
    await dealerAgent.post('/api/dealer/payments/offline').send({ rentalId: rental.id })
    await dealerAgent.post(`/api/dealer/rentals/${rental.id}/handover`).send({})
    // Month 2 invoice → overdue → past_due.
    await db.update(rentals).set({ nextBillingDate: daysAgo(10) }).where(eq(rentals.id, rental.id))
    await generateDueInvoices()
    await db
      .update(invoices)
      .set({ dueDate: daysAgo(2) })
      .where(and(eq(invoices.rentalId, rental.id), eq(invoices.status, 'due')))
    await markOverdueInvoices()

    // Repossession/return does NOT erase the debt.
    const ret = await dealerAgent.post(`/api/dealer/rentals/${rental.id}/return`).send({ mileage: 50000 })
    expect(ret.status).toBe(200)
    const [debt] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.rentalId, rental.id), eq(invoices.status, 'overdue')))
    expect(debt).toBeTruthy() // pre-fix: voided

    // And the dealer can still collect it after completion.
    const pay = await dealerAgent.post('/api/dealer/payments/offline').send({ rentalId: rental.id })
    expect(pay.status).toBe(201)
    const [settled] = await db.select().from(invoices).where(eq(invoices.id, debt.id))
    expect(settled.status).toBe('paid')
  })

  it('RA-08 (L4): admin cannot override reserved → active past the payment gate', async () => {
    const fixtures = await seedFixtures()
    const { rental } = await bookAndApprove(app, fixtures)
    const { agent: adminAgent } = await loginAs(app, fixtures.admin.email, 'admin')
    const res = await adminAgent.patch(`/api/admin/rentals/${rental.id}/status`).send({ status: 'active' })
    expect(res.status).toBe(409)
    const [row] = await db.select().from(rentals).where(eq(rentals.id, rental.id))
    expect(row.status).toBe('reserved')
  })

  it('RA-09 (L5): vehicle status "rented" cannot be set manually', async () => {
    const fixtures = await seedFixtures()
    const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    const res = await dealerAgent
      .patch(`/api/dealer/vehicles/${fixtures.vehicles[0].id}/status`)
      .send({ status: 'rented' })
    expect(res.status).toBe(400)
    const { agent: adminAgent } = await loginAs(app, fixtures.admin.email, 'admin')
    const res2 = await adminAgent
      .patch(`/api/admin/vehicles/${fixtures.vehicles[0].id}/status`)
      .send({ status: 'rented' })
    expect(res2.status).toBe(400)
  })

  it('RA-11 (F3): retrying invoice-intent leaves exactly one live payment attempt', async () => {
    vi.mocked(createSkipCashPayment)
      .mockResolvedValueOnce({ id: 'ext-i1', payUrl: 'https://pay/1', statusId: 0 })
      .mockResolvedValueOnce({ id: 'ext-i2', payUrl: 'https://pay/2', statusId: 0 })
    const fixtures = await seedFixtures()
    const { profiles } = await import('../../db/schema.js')
    await db.update(profiles).set({ phone: '+97455512345' }).where(eq(profiles.id, fixtures.customer.id))
    const { rental, customerAgent } = await bookAndApprove(app, fixtures)
    const [invoice] = await db.select().from(invoices).where(eq(invoices.rentalId, rental.id))
    const one = await customerAgent.post('/api/payments/skipcash/invoice-intent').send({ invoiceId: invoice.id })
    const two = await customerAgent.post('/api/payments/skipcash/invoice-intent').send({ invoiceId: invoice.id })
    expect(one.status).toBe(201)
    expect(two.status).toBe(201)
    const pending = await db
      .select()
      .from(payments)
      .where(and(eq(payments.invoiceId, invoice.id), eq(payments.status, 'pending')))
    expect(pending).toHaveLength(1)
    expect(pending[0].id).toBe(two.body.paymentId)
  })

  it('RA-12 (F13): declining a booking request kills its in-flight payment attempts', async () => {
    vi.mocked(createSkipCashPayment).mockResolvedValue({ id: 'ext-d', payUrl: 'https://pay/d', statusId: 0 })
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const contact = { firstName: 'J', lastName: 'D', phone: '+97455512345', email: 'j@test.dev' }
    const intent = await agent
      .post('/api/payments/skipcash/create-intent')
      .send({ vehicleId: fixtures.vehicles[0].id, contact })
    expect(intent.status).toBe(201)
    const [p] = await db.select().from(payments).where(eq(payments.id, intent.body.paymentId))

    // Webhook marks it paid-visible first so the dealer can see and decline it.
    await postWebhook(app, {
      PaymentId: 'ext-d',
      Amount: (450 * 30).toFixed(2),
      StatusId: 2,
      TransactionId: intent.body.paymentId,
    })
    // Second attempt lingers pending (simulated stray).
    const [stray] = await db
      .insert(payments)
      .values({
        customerId: p.customerId,
        dealerId: p.dealerId,
        vehicleId: p.vehicleId,
        bookingRequestId: p.bookingRequestId,
        amount: p.amount,
        status: 'pending',
        type: 'rental',
        method: 'card',
        provider: 'skipcash',
      })
      .returning()
    const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    const decline = await dealerAgent
      .patch(`/api/dealer/booking-requests/${p.bookingRequestId}/status`)
      .send({ status: 'declined', declineReason: 'not available anymore' })
    expect(decline.status).toBe(200)
    const [strayAfter] = await db.select().from(payments).where(eq(payments.id, stray.id))
    expect(strayAfter.status).toBe('failed')
    const [paidAfter] = await db.select().from(payments).where(eq(payments.id, p.id))
    expect(paidAfter.needsRefund).toBe(true)
  })

  it('RA-13 (L2): dealer loses document access once the rental is closed', async () => {
    const fixtures = await seedFixtures()
    const { rental, dealerAgent } = await bookAndApprove(app, fixtures)
    await dealerAgent.post('/api/dealer/payments/offline').send({ rentalId: rental.id })
    await dealerAgent.post(`/api/dealer/rentals/${rental.id}/handover`).send({})
    const open = await dealerAgent.get(`/api/dealer/customer-documents/${rental.customerId}`)
    expect(open.status).toBe(200)

    await dealerAgent.post(`/api/dealer/rentals/${rental.id}/return`).send({})
    const closed = await dealerAgent.get(`/api/dealer/customer-documents/${rental.customerId}`)
    expect(closed.status).toBe(403) // pre-fix: access forever
  })

  it('RA-14 (F7): approval honors the monthly price the customer actually paid online', async () => {
    vi.mocked(createSkipCashPayment).mockResolvedValue({ id: 'ext-p', payUrl: 'https://pay/p', statusId: 0 })
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const contact = { firstName: 'J', lastName: 'D', phone: '+97455512345', email: 'j@test.dev' }
    const intent = await agent
      .post('/api/payments/skipcash/create-intent')
      .send({ vehicleId: fixtures.vehicles[0].id, note: JSON.stringify({ durationMonths: 2 }), contact })
    await postWebhook(app, {
      PaymentId: 'ext-p',
      Amount: (450 * 30).toFixed(2),
      StatusId: 2,
      TransactionId: intent.body.paymentId,
    })

    // Dealer hikes the price BEFORE approving.
    await db.update(vehicles).set({ pricePerDay: '600' }).where(eq(vehicles.id, fixtures.vehicles[0].id))
    const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    const [br] = await db.select().from(bookingRequests)
    await dealerAgent.patch(`/api/dealer/booking-requests/${br.id}/status`).send({ status: 'approved' })

    const [rental] = await db.select().from(rentals)
    // The paid price wins: 450×30, not 600×30.
    expect(Number(rental.monthlyAmount)).toBe(450 * 30)
    const [invoice] = await db.select().from(invoices).where(eq(invoices.rentalId, rental.id))
    expect(Number(invoice.amount)).toBe(450 * 30)
    expect(invoice.status).toBe('paid')
  })
})
