import { createHmac } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { Express } from 'express'
import request from 'supertest'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/index.js'
import {
  auditLogs,
  bookingRequests,
  commissionLedger,
  invoices,
  invoiceReminderSends,
  payments,
  rentalEvents,
  rentals,
  swapRequests,
  vehicles,
} from '../../db/schema.js'
import { generateDueInvoices, markOverdueInvoices } from '../../services/billing.js'
import { sendInvoicePaymentReminders } from '../../services/invoiceReminders.js'
import { createSkipCashPayment } from '../../services/skipcash.js'
import { buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'
import { addDays, todayISO } from '../../utils/dates.js'

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

function daysAgo(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
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
    expect(Number(rental.monthlyAmount)).toBe(450 * 30)
    expect(rental.termMonths).toBe(3)
    expect(rental.nextBillingDate).not.toBeNull()

    const invoiceRows = await db.select().from(invoices).where(eq(invoices.rentalId, rental.id))
    expect(invoiceRows).toHaveLength(1)
    expect(invoiceRows[0].status).toBe('due')
    expect(Number(invoiceRows[0].amount)).toBe(450 * 30)
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
      .send({ amount: 450 * 30 - 5000, manualConfirmed: true })
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
