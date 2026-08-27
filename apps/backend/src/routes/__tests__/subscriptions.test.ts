import { createHmac } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import type { Express } from 'express'
import request from 'supertest'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/index.js'
import {
  auditLogs,
  bookingRequests,
  commissionLedger,
  dealerInvoices,
  dealerPlans,
  dealerSubscriptions,
  invoices,
  invoiceReminderSends,
  payments,
  rentalEvents,
  rentals,
  swapRequests,
  vehicles,
} from '../../db/schema.js'
import { generateDueInvoices, markOverdueInvoices } from '../../services/billing.js'
import { computeMonthlyAmount } from '../../services/booking.js'
import {
  generateDueDealerInvoices,
  markPastDueDealerInvoices,
  runDealerBillingSweep,
  settleDealerInvoice,
} from '../../services/dealerBilling.js'
import { sendInvoicePaymentReminders } from '../../services/invoiceReminders.js'
import { createSkipCashPayment } from '../../services/skipcash.js'
import { buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'
import { addDays, dateInBillingTz, todayISO } from '../../utils/dates.js'

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

/**
 * Billing-timezone relative date. The services compute "today" in the billing
 * timezone (utils/dates todayISO), so a UTC-based helper disagrees with them
 * between 21:00 and 24:00 UTC and shifts every derived date by a day.
 */
function daysAgo(n: number): string {
  return addDays(todayISO(), -n)
}

/** Books vehicle[0] pay-at-shop and approves it; returns the rental row. */
async function bookAndApprove(app: Express, fixtures: Awaited<ReturnType<typeof seedFixtures>>) {
  const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')
  const note = JSON.stringify({ durationMonths: 3 })
  const br = await customerAgent
    .post('/api/customer/booking-requests')
    .send({ vehicleId: fixtures.vehicles[0].id, note })
  expect(br.status).toBe(201)
  const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
  const approved = await dealerAgent
    .patch(`/api/dealer/booking-requests/${br.body.id}/status`)
    .send({ status: 'approved' })
  expect(approved.status).toBe(200)
  const [rental] = await db.select().from(rentals)
  return rental
}

/** ID: SUB-01..SUB-12 — invygo/FINN-style subscription lifecycle */
describe('Subscription lifecycle', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    await resetDb()
    vi.mocked(createSkipCashPayment).mockReset()
  })

  it('SUB-01: approval creates the first due invoice and a monthly billing anchor', async () => {
    const fixtures = await seedFixtures()
    const rental = await bookAndApprove(app, fixtures)
    // bookAndApprove books a 3-month term, which now carries the multi-month
    // discount (services/booking.ts TERM_DISCOUNTS) — assert against the
    // server-authoritative helper rather than a hard-coded list price.
    expect(Number(rental.monthlyAmount)).toBe(computeMonthlyAmount(450, 3))
    expect(rental.termMonths).toBe(3)
    expect(rental.nextBillingDate).not.toBeNull()

    const invoiceRows = await db.select().from(invoices).where(eq(invoices.rentalId, rental.id))
    expect(invoiceRows).toHaveLength(1)
    expect(invoiceRows[0].status).toBe('due')
    expect(Number(invoiceRows[0].amount)).toBe(computeMonthlyAmount(450, 3))
  })

  it('SUB-02 (BUG-01 regression): online-paid booking approves into a PAID rental, no double charge', async () => {
    vi.mocked(createSkipCashPayment).mockResolvedValue({
      id: 'ext-1',
      payUrl: 'https://pay.test/1',
      statusId: 0,
    })
    const fixtures = await seedFixtures()
    const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')
    const created = await customerAgent.post('/api/payments/skipcash/create-intent').send({
      vehicleId: fixtures.vehicles[0].id,
      note: JSON.stringify({ durationMonths: 2 }),
      contact: { firstName: 'Jane', lastName: 'Doe', phone: '+97455512345', email: 'j@test.dev' },
    })
    expect(created.status).toBe(201)

    const payload = {
      PaymentId: 'ext-1',
      Amount: (450 * 30).toFixed(2),
      StatusId: 2, // PAID
      TransactionId: created.body.paymentId,
    }
    await request(app)
      .post('/api/payments/skipcash/webhook')
      .set('Authorization', signWebhook(payload))
      .send(payload)

    const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    const [br] = await db.select().from(bookingRequests)
    expect(br.awaitingPayment).toBe(false)
    await dealerAgent.patch(`/api/dealer/booking-requests/${br.id}/status`).send({ status: 'approved' })

    const [rental] = await db.select().from(rentals)
    // The completed online payment pays the first month: rental is NOT unpaid.
    expect(rental.paymentStatus).toBe('completed')
    const [firstInvoice] = await db.select().from(invoices).where(eq(invoices.rentalId, rental.id))
    expect(firstInvoice.status).toBe('paid')
    const [payment] = await db.select().from(payments).where(eq(payments.id, created.body.paymentId))
    expect(payment.rentalId).toBe(rental.id)
    expect(payment.invoiceId).toBe(firstInvoice.id)

    // Recording an offline payment now reports "nothing due" instead of
    // double-charging the customer.
    const dup = await dealerAgent.post('/api/dealer/payments/offline').send({ rentalId: rental.id })
    expect([200, 409]).toContain(dup.status)
    const charges = await db
      .select()
      .from(payments)
      .where(and(eq(payments.rentalId, rental.id), eq(payments.status, 'completed')))
    expect(charges).toHaveLength(1)

    const ledger = await db
      .select()
      .from(commissionLedger)
      .where(eq(commissionLedger.invoiceId, firstInvoice.id))
    expect(ledger).toHaveLength(1)
    expect(Number(ledger[0].grossAmount)).toBe(450 * 30)
  })

  it('SUB-03: handover requires payment, then activates with a pickup event', async () => {
    const fixtures = await seedFixtures()
    const rental = await bookAndApprove(app, fixtures)
    const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')

    // Unpaid → handover refused.
    const early = await dealerAgent
      .post(`/api/dealer/rentals/${rental.id}/handover`)
      .send({ mileage: 42000 })
    expect(early.status).toBe(409)

    await dealerAgent.post('/api/dealer/payments/offline').send({ rentalId: rental.id })
    const handover = await dealerAgent
      .post(`/api/dealer/rentals/${rental.id}/handover`)
      .send({ mileage: 42000, fuelLevel: 'full', conditionNotes: 'No scratches' })
    expect(handover.status).toBe(200)
    expect(handover.body.status).toBe('active')

    const events = await db.select().from(rentalEvents).where(eq(rentalEvents.rentalId, rental.id))
    expect(events.some((e) => e.type === 'pickup' && e.mileage === 42000)).toBe(true)
  })

  it('SUB-04: monthly billing sweep generates the next invoice exactly once', async () => {
    const fixtures = await seedFixtures()
    const rental = await bookAndApprove(app, fixtures)
    const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    await dealerAgent.post('/api/dealer/payments/offline').send({ rentalId: rental.id })
    await dealerAgent.post(`/api/dealer/rentals/${rental.id}/handover`).send({})

    // Time-travel: the next billing date has arrived.
    await db.update(rentals).set({ nextBillingDate: daysAgo(1) }).where(eq(rentals.id, rental.id))
    const first = await generateDueInvoices()
    expect(first).toBe(1)
    const second = await generateDueInvoices()
    expect(second).toBe(0) // idempotent — anchor advanced, unique period index

    const invoiceRows = await db.select().from(invoices).where(eq(invoices.rentalId, rental.id))
    expect(invoiceRows).toHaveLength(2)
  })

  it('SUB-05: dunning marks overdue invoices and drops the subscription to past_due; paying restores it', async () => {
    const fixtures = await seedFixtures()
    const rental = await bookAndApprove(app, fixtures)
    const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    await dealerAgent.post('/api/dealer/payments/offline').send({ rentalId: rental.id })
    await dealerAgent.post(`/api/dealer/rentals/${rental.id}/handover`).send({})

    await db.update(rentals).set({ nextBillingDate: daysAgo(10) }).where(eq(rentals.id, rental.id))
    await generateDueInvoices()
    // Grace expired:
    await db
      .update(invoices)
      .set({ dueDate: daysAgo(2) })
      .where(and(eq(invoices.rentalId, rental.id), eq(invoices.status, 'due')))
    const flipped = await markOverdueInvoices()
    expect(flipped).toBe(1)
    const [pastDue] = await db.select().from(rentals).where(eq(rentals.id, rental.id))
    expect(pastDue.status).toBe('past_due')
    expect(pastDue.paymentStatus).toBe('pending')

    // Dealer records the offline payment for the overdue invoice → restored.
    const pay = await dealerAgent.post('/api/dealer/payments/offline').send({ rentalId: rental.id })
    expect(pay.status).toBe(201)
    const [restored] = await db.select().from(rentals).where(eq(rentals.id, rental.id))
    expect(restored.status).toBe('active')
    expect(restored.paymentStatus).toBe('completed')
  })

  it('SUB-06: customer cancellation honors notice and minimum term at a billing boundary', async () => {
    const fixtures = await seedFixtures()
    const rental = await bookAndApprove(app, fixtures)
    const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    await dealerAgent.post('/api/dealer/payments/offline').send({ rentalId: rental.id })
    await dealerAgent.post(`/api/dealer/rentals/${rental.id}/handover`).send({})

    const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')
    const res = await customerAgent
      .post(`/api/customer/rentals/${rental.id}/cancel`)
      .send({ reason: 'Moving abroad' })
    expect(res.status).toBe(200)
    const effective = res.body.cancellationEffectiveDate as string
    expect(effective).toBeTruthy()

    // ≥ 30-day notice and ≥ minimum term (3 months from start).
    const notice = new Date()
    notice.setUTCDate(notice.getUTCDate() + 30)
    expect(effective >= notice.toISOString().slice(0, 10)).toBe(true)
    const [row] = await db.select().from(rentals).where(eq(rentals.id, rental.id))
    const minTermEnd = new Date(`${row.startDate}T00:00:00Z`)
    minTermEnd.setUTCMonth(minTermEnd.getUTCMonth() + 3)
    expect(effective >= minTermEnd.toISOString().slice(0, 10)).toBe(true)
    // Still active until the dealer takes the car back.
    expect(row.status).toBe('active')
  })

  it('SUB-07: reserved cancellation is immediate, frees the car, and flags paid money for refund', async () => {
    const fixtures = await seedFixtures()
    const rental = await bookAndApprove(app, fixtures)
    const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    await dealerAgent.post('/api/dealer/payments/offline').send({ rentalId: rental.id })

    const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')
    const res = await customerAgent.post(`/api/customer/rentals/${rental.id}/cancel`).send({})
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('cancelled')

    const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, rental.vehicleId))
    expect(vehicle.status).toBe('available')
    const [payment] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.rentalId, rental.id), eq(payments.status, 'completed')))
    expect(payment.needsRefund).toBe(true)
  })

  it('SUB-08 (BUG-02 regression): customer cannot force arbitrary rental statuses', async () => {
    const fixtures = await seedFixtures()
    const rental = await bookAndApprove(app, fixtures)
    const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')
    for (const status of ['active', 'completed', 'past_due']) {
      const res = await customerAgent
        .patch(`/api/customer/rentals/${rental.id}/status`)
        .send({ status })
      expect(res.status).toBe(403)
    }
    const [row] = await db.select().from(rentals).where(eq(rentals.id, rental.id))
    expect(row.status).toBe('reserved')
  })

  it('SUB-09: return completes the subscription, records mileage, and frees or parks the car', async () => {
    const fixtures = await seedFixtures()
    const rental = await bookAndApprove(app, fixtures)
    const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    await dealerAgent.post('/api/dealer/payments/offline').send({ rentalId: rental.id })
    await dealerAgent.post(`/api/dealer/rentals/${rental.id}/handover`).send({ mileage: 40000 })

    const ret = await dealerAgent.post(`/api/dealer/rentals/${rental.id}/return`).send({
      mileage: 43500,
      conditionNotes: 'Small scratch on rear bumper',
      vehicleNextStatus: 'maintenance',
    })
    expect(ret.status).toBe(200)
    expect(ret.body.status).toBe('completed')

    const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, rental.vehicleId))
    expect(vehicle.status).toBe('maintenance')
    expect(vehicle.mileage).toBe(43500)
    const events = await db.select().from(rentalEvents).where(eq(rentalEvents.rentalId, rental.id))
    expect(events.some((e) => e.type === 'return' && e.mileage === 43500)).toBe(true)
    // Billing stops with the subscription.
    const open = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.rentalId, rental.id), eq(invoices.status, 'due')))
    expect(open).toHaveLength(0)
  })

  it('SUB-10: swap request flows from customer to dealer approval and moves the subscription', async () => {
    const fixtures = await seedFixtures()
    const rental = await bookAndApprove(app, fixtures)
    const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    await dealerAgent.post('/api/dealer/payments/offline').send({ rentalId: rental.id })
    await dealerAgent.post(`/api/dealer/rentals/${rental.id}/handover`).send({})

    const target = fixtures.vehicles[1]
    const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')

    // Not eligible before the 30-day window.
    const tooEarly = await customerAgent
      .post(`/api/customer/rentals/${rental.id}/swap-requests`)
      .send({ vehicleId: target.id })
    expect(tooEarly.status).toBe(409)

    await db
      .update(rentals)
      .set({ activatedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) })
      .where(eq(rentals.id, rental.id))
    const created = await customerAgent
      .post(`/api/customer/rentals/${rental.id}/swap-requests`)
      .send({ vehicleId: target.id, note: 'Need a bigger car' })
    expect(created.status).toBe(201)

    const decision = await dealerAgent
      .patch(`/api/dealer/swap-requests/${created.body.id}/status`)
      .send({ status: 'approved', mileageOut: 45000, mileageIn: 12000 })
    expect(decision.status).toBe(200)

    const [moved] = await db.select().from(rentals).where(eq(rentals.id, rental.id))
    expect(moved.vehicleId).toBe(target.id)
    const [oldV] = await db.select().from(vehicles).where(eq(vehicles.id, rental.vehicleId))
    const [newV] = await db.select().from(vehicles).where(eq(vehicles.id, target.id))
    expect(oldV.status).toBe('available')
    expect(newV.status).toBe('rented')
    const events = await db.select().from(rentalEvents).where(eq(rentalEvents.rentalId, rental.id))
    expect(events.some((e) => e.type === 'swap_out')).toBe(true)
    expect(events.some((e) => e.type === 'swap_in')).toBe(true)
    const [swap] = await db.select().from(swapRequests)
    expect(swap.status).toBe('approved')
  })

  it('SUB-11: refunds are honest — no provider success and no attestation means no refund recorded', async () => {
    const fixtures = await seedFixtures()
    const rental = await bookAndApprove(app, fixtures)
    const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    await dealerAgent.post('/api/dealer/payments/offline').send({ rentalId: rental.id })
    const [payment] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.rentalId, rental.id), eq(payments.status, 'completed')))

    const { agent: adminAgent } = await loginAs(app, fixtures.admin.email, 'admin')
    // Manual provider (no SkipCash id) + no attestation → refused, honest 409.
    const refused = await adminAgent.post(`/api/admin/payments/${payment.id}/refund`).send({})
    expect(refused.status).toBe(409)
    expect(refused.body.requiresManualConfirmation).toBe(true)
    const [unchanged] = await db.select().from(payments).where(eq(payments.id, payment.id))
    expect(unchanged.status).toBe('completed')
    expect(Number(unchanged.refundedAmount)).toBe(0)

    // Partial manual refund with attestation → refund row + accumulation.
    const partial = await adminAgent
      .post(`/api/admin/payments/${payment.id}/refund`)
      .send({ amount: 5000, manualConfirmed: true })
    expect(partial.status).toBe(200)
    const [after] = await db.select().from(payments).where(eq(payments.id, payment.id))
    expect(after.status).toBe('completed') // not fully refunded yet
    expect(Number(after.refundedAmount)).toBe(5000)
    const refundRows = await db
      .select()
      .from(payments)
      .where(eq(payments.refundOfPaymentId, payment.id))
    expect(refundRows).toHaveLength(1)
    expect(refundRows[0].type).toBe('refund')

    // Completing the refund flips the original to refunded.
    const rest = await adminAgent
      .post(`/api/admin/payments/${payment.id}/refund`)
      .send({ amount: computeMonthlyAmount(450, 3) - 5000, manualConfirmed: true })
    expect(rest.status).toBe(200)
    const [final] = await db.select().from(payments).where(eq(payments.id, payment.id))
    expect(final.status).toBe('refunded')

    // Audited.
    const audit = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, 'payment'), eq(auditLogs.action, 'payment.refund')))
    expect(audit.length).toBe(2)
  })

  it('SUB-12 (BUG-03 regression): vehicles and dealers with rental history cannot be deleted', async () => {
    const fixtures = await seedFixtures()
    const rental = await bookAndApprove(app, fixtures)
    const { agent: adminAgent } = await loginAs(app, fixtures.admin.email, 'admin')

    const delVehicle = await adminAgent.delete(`/api/admin/vehicles/${rental.vehicleId}`)
    expect(delVehicle.status).toBe(200)
    expect(delVehicle.body.softDeleted).toBe(true)
    const delDealer = await adminAgent.delete(`/api/admin/dealers/${fixtures.dealer.dealerId}`)
    expect(delDealer.status).toBe(409)
    // Vehicle retired in place; dealer row still exists.
    expect((await db.select().from(vehicles).where(eq(vehicles.id, rental.vehicleId))).length).toBe(1)

    // Dealer can no longer hand-flip a rented car back to available.
    const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    const flip = await dealerAgent
      .patch(`/api/dealer/vehicles/${rental.vehicleId}/status`)
      .send({ status: 'available' })
    expect(flip.status).toBe(409)
  })

  it('SUB-13: payment reminder ladder is idempotent per invoice stage', async () => {
    const fixtures = await seedFixtures()
    const rental = await bookAndApprove(app, fixtures)
    const [invoice] = await db.select().from(invoices).where(eq(invoices.rentalId, rental.id))
    const reminderDay = todayISO()
    const dueDate = addDays(reminderDay, 3)
    await db.update(invoices).set({ dueDate, status: 'due' }).where(eq(invoices.id, invoice.id))

    const first = await sendInvoicePaymentReminders(reminderDay)
    expect(first).toBe(1)

    const sends = await db
      .select()
      .from(invoiceReminderSends)
      .where(eq(invoiceReminderSends.invoiceId, invoice.id))
    expect(sends.length).toBe(1)
    expect(sends[0].stage).toBe('pre_due_3')

    const second = await sendInvoicePaymentReminders(reminderDay)
    expect(second).toBe(0)
  })

  async function activateRental(app: Express, rentalId: string, fixtures: Awaited<ReturnType<typeof seedFixtures>>) {
    const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    await dealerAgent.post('/api/dealer/payments/offline').send({ rentalId })
    await dealerAgent.post(`/api/dealer/rentals/${rentalId}/handover`).send({})
  }

  it('SUB-14: pausing stops invoice generation; resume shifts next billing date', async () => {
    const fixtures = await seedFixtures()
    const rental = await bookAndApprove(app, fixtures)
    await activateRental(app, rental.id, fixtures)
    await db.update(rentals).set({ nextBillingDate: daysAgo(1) }).where(eq(rentals.id, rental.id))
    const billingBeforePause = daysAgo(1)

    const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')
    const paused = await customerAgent.post(`/api/customer/rentals/${rental.id}/pause`).send({ days: 14 })
    expect(paused.status).toBe(200)
    expect(paused.body.status).toBe('paused')

    const duringPause = await generateDueInvoices()
    expect(duringPause).toBe(0)
    const invoiceCountWhilePaused = await db
      .select()
      .from(invoices)
      .where(eq(invoices.rentalId, rental.id))
    expect(invoiceCountWhilePaused).toHaveLength(1)

    const pauseStart = daysAgo(7)
    await db
      .update(rentals)
      .set({ pausedAt: new Date(`${pauseStart}T12:00:00Z`) })
      .where(eq(rentals.id, rental.id))

    const resumed = await customerAgent.post(`/api/customer/rentals/${rental.id}/resume`)
    expect(resumed.status).toBe(200)
    expect(resumed.body.status).toBe('active')

    const [after] = await db.select().from(rentals).where(eq(rentals.id, rental.id))
    expect(after.nextBillingDate).toBe(addDays(billingBeforePause, 7))

    await db.update(rentals).set({ nextBillingDate: daysAgo(1) }).where(eq(rentals.id, rental.id))
    const afterResume = await generateDueInvoices()
    expect(afterResume).toBe(1)
  })

  it('SUB-15: past_due subscriptions cannot be paused', async () => {
    const fixtures = await seedFixtures()
    const rental = await bookAndApprove(app, fixtures)
    await activateRental(app, rental.id, fixtures)
    await db.update(rentals).set({ status: 'past_due' }).where(eq(rentals.id, rental.id))

    const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')
    const res = await customerAgent.post(`/api/customer/rentals/${rental.id}/pause`).send({ days: 7 })
    expect(res.status).toBe(409)
  })

  it('SUB-16: pause and resume are audited; illegal resume returns 409', async () => {
    const fixtures = await seedFixtures()
    const rental = await bookAndApprove(app, fixtures)
    await activateRental(app, rental.id, fixtures)
    const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')

    const pause = await customerAgent.post(`/api/customer/rentals/${rental.id}/pause`).send({ days: 7 })
    expect(pause.status).toBe(200)

    const badResume = await customerAgent.post(`/api/customer/rentals/${rental.id}/pause`).send({ days: 7 })
    expect(badResume.status).toBe(409)

    const resume = await customerAgent.post(`/api/customer/rentals/${rental.id}/resume`)
    expect(resume.status).toBe(200)

    const doubleResume = await customerAgent.post(`/api/customer/rentals/${rental.id}/resume`)
    expect(doubleResume.status).toBe(409)

    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, rental.id))
    expect(logs.some((l) => l.action === 'rental.pause')).toBe(true)
    expect(logs.some((l) => l.action === 'rental.resume')).toBe(true)
  })
})

/** Same upsert-by-code helper as dealer.test.ts: dealer_plans survives resetDb(). */
async function seedDealerPlans() {
  const rows = await db
    .insert(dealerPlans)
    .values([
      { code: 'free', name: 'Free', priceQar: '0', vehicleLimit: 1, features: [] },
      { code: 'starter', name: 'Starter', priceQar: '99', vehicleLimit: 10, features: [] },
      { code: 'professional', name: 'Professional', priceQar: '299', vehicleLimit: 25, features: [] },
    ])
    .onConflictDoUpdate({
      target: dealerPlans.code,
      set: {
        name: sql`excluded.name`,
        priceQar: sql`excluded.price_qar`,
        vehicleLimit: sql`excluded.vehicle_limit`,
        active: sql`excluded.active`,
      },
    })
    .returning()
  return Object.fromEntries(rows.map((r) => [r.code, r])) as Record<
    'free' | 'starter' | 'professional',
    typeof dealerPlans.$inferSelect
  >
}

/** Default BILLING_GRACE_DAYS (appSettings.ts). */
const DEALER_GRACE_DAYS = 3

/** ID: DSUB-01..DSUB-04 — dealer subscription billing lifecycle */
describe('Dealer subscription billing lifecycle', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    await resetDb()
  })

  it('DSUB-01: an unpaid plan invoice drives the subscription past_due, then down to the free tier', async () => {
    const fixtures = await seedFixtures()
    const plans = await seedDealerPlans()
    const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')

    const change = await agent.patch('/api/dealer/subscription/plan').send({ planCode: 'professional' })
    expect(change.status).toBe(200)
    expect(change.body.invoice.amount).toBe(299)

    // Inside the grace window nothing moves.
    expect(await runDealerBillingSweep(todayISO())).toMatchObject({ pastDue: 0, downgraded: 0 })

    // Grace expires: invoice and subscription both go past_due.
    const afterGrace = addDays(todayISO(), DEALER_GRACE_DAYS + 1)
    expect(await runDealerBillingSweep(afterGrace)).toMatchObject({ pastDue: 1, downgraded: 0 })
    let [subscription] = await db.select().from(dealerSubscriptions)
    expect(subscription.status).toBe('past_due')
    let [invoice] = await db.select().from(dealerInvoices)
    expect(invoice.status).toBe('past_due')

    // Still unpaid a grace window later: drop to the free tier.
    const afterDunning = addDays(todayISO(), DEALER_GRACE_DAYS * 2 + 2)
    expect(await runDealerBillingSweep(afterDunning)).toMatchObject({ downgraded: 1 })
    ;[subscription] = await db.select().from(dealerSubscriptions)
    expect(subscription.planId).toBe(plans.free.id)
    expect(subscription.status).toBe('active')

    // The debt is not forgiven and the fleet is not deleted — the surplus
    // listing over the free cap is simply deactivated.
    ;[invoice] = await db.select().from(dealerInvoices)
    expect(invoice.status).toBe('past_due')
    const fleet = await db.select().from(vehicles).where(eq(vehicles.dealerId, fixtures.dealer.dealerId))
    expect(fleet).toHaveLength(2)
    expect(fleet.filter((v) => v.status === 'inactive')).toHaveLength(1)

    // Re-running the sweep is idempotent.
    expect(await runDealerBillingSweep(afterDunning)).toMatchObject({ pastDue: 0, downgraded: 0 })

    // And the dealer cannot re-subscribe around the invoice they never paid.
    const retry = await agent.patch('/api/dealer/subscription/plan').send({ planCode: 'professional' })
    expect(retry.status).toBe(402)
  })

  it('DSUB-02: the monthly sweep bills each period exactly once and settling restores the plan', async () => {
    const fixtures = await seedFixtures()
    await seedDealerPlans()
    const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    await agent.patch('/api/dealer/subscription/plan').send({ planCode: 'starter' })

    const [initial] = await db.select().from(dealerSubscriptions)
    const periodEnd = dateInBillingTz(initial.currentPeriodEnd)

    expect(await generateDueDealerInvoices(periodEnd)).toBe(1)
    expect(await generateDueDealerInvoices(periodEnd)).toBe(0)

    const invoiceRows = await db.select().from(dealerInvoices).orderBy(dealerInvoices.periodStart)
    expect(invoiceRows).toHaveLength(2)
    expect(Number(invoiceRows[1].amount)).toBe(99)
    expect(dateInBillingTz(invoiceRows[1].periodStart)).toBe(periodEnd)

    // Missing both payments flips the subscription; paying everything restores it.
    await markPastDueDealerInvoices(addDays(periodEnd, DEALER_GRACE_DAYS + 1))
    let [subscription] = await db.select().from(dealerSubscriptions)
    expect(subscription.status).toBe('past_due')

    await db.transaction(async (tx) => {
      for (const invoice of invoiceRows) {
        expect(await settleDealerInvoice(tx, { invoiceId: invoice.id })).toBe('settled')
      }
    })
    ;[subscription] = await db.select().from(dealerSubscriptions)
    expect(subscription.status).toBe('active')
    const settled = await db.select().from(dealerInvoices)
    expect(settled.every((i) => i.status === 'paid' && i.paidAt !== null)).toBe(true)

    // Settling twice is not an error and does not double-count.
    await db.transaction(async (tx) => {
      expect(await settleDealerInvoice(tx, { invoiceId: invoiceRows[0].id })).toBe('already-paid')
    })

    const history = await agent.get('/api/dealer/billing/invoices')
    expect(history.body).toHaveLength(2)
    expect(history.body[0].periodStart >= history.body[1].periodStart).toBe(true)
  })

  it('DSUB-03: cancellation is scheduled at a billing boundary and ends the plan there', async () => {
    const fixtures = await seedFixtures()
    const plans = await seedDealerPlans()
    const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    await agent.patch('/api/dealer/subscription/plan').send({ planCode: 'professional' })

    const cancel = await agent.post('/api/dealer/subscription/cancel')
    expect(cancel.status).toBe(200)
    const effective: string = cancel.body.effectiveDate
    const [scheduled] = await db.select().from(dealerSubscriptions)
    expect(effective > todayISO()).toBe(true)
    expect(effective >= dateInBillingTz(scheduled.currentPeriodEnd)).toBe(true)
    expect(scheduled.status).toBe('active')

    expect((await agent.post('/api/dealer/subscription/cancel')).status).toBe(409)

    const sweep = await runDealerBillingSweep(effective)
    expect(sweep.cancellations).toBe(1)
    expect(sweep.invoices).toBe(0)

    const [ended] = await db.select().from(dealerSubscriptions)
    expect(ended.planId).toBe(plans.free.id)
    expect(ended.cancelAt).toBeNull()
    expect(await db.select().from(dealerInvoices)).toHaveLength(1)

    const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, scheduled.id))
    expect(logs.some((l) => l.action === 'dealer.billing.cancel_scheduled')).toBe(true)
    expect(logs.some((l) => l.action === 'dealer.billing.downgraded.cancelled')).toBe(true)
  })

  it('DSUB-04: mid-period upgrades are pro-rated and a past_due dealer cannot upgrade', async () => {
    const fixtures = await seedFixtures()
    await seedDealerPlans()
    const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    await agent.patch('/api/dealer/subscription/plan').send({ planCode: 'starter' })

    const upgrade = await agent.patch('/api/dealer/subscription/plan').send({ planCode: 'professional' })
    expect(upgrade.status).toBe(200)
    expect(upgrade.body.change).toBe('upgraded')
    // Same-day upgrade: the whole period is still ahead, so the dealer pays the
    // full difference and never twice for the same days.
    expect(upgrade.body.invoice.amount).toBe(299 - 99)
    const invoiceRows = await db.select().from(dealerInvoices)
    expect(invoiceRows).toHaveLength(2)
    expect(invoiceRows.reduce((sum, i) => sum + Number(i.amount), 0)).toBe(299)

    // Re-selecting the same plan is not a second charge.
    const again = await agent.patch('/api/dealer/subscription/plan').send({ planCode: 'professional' })
    expect(again.body.change).toBe('unchanged')
    expect(again.body.invoice).toBeNull()
    expect(await db.select().from(dealerInvoices)).toHaveLength(2)

    // A dealer who has not paid cannot buy their way further up.
    await markPastDueDealerInvoices(addDays(todayISO(), DEALER_GRACE_DAYS + 1))
    await db.update(dealerPlans).set({ priceQar: '999' }).where(eq(dealerPlans.code, 'free'))
    const blocked = await agent.patch('/api/dealer/subscription/plan').send({ planCode: 'free' })
    expect(blocked.status).toBe(402)
  })
})
