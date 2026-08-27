import { createHmac } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { Express } from 'express'
import supertest from 'supertest'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/index.js'
import { bookingRequests, payments, vehicles } from '../../db/schema.js'
import { SkipCashStatus , createSkipCashPayment } from '../../services/skipcash.js'

vi.mock('../../services/skipcash.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/skipcash.js')>()
  return { ...actual, createSkipCashPayment: vi.fn() }
})
import { buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'
import { addDays, todayISO } from '../../utils/dates.js'

/** Inside MAX_START_DATE_DAYS_AHEAD, so the fixture never ages out of the window. */
const startDateSoon = addDays(todayISO(), 14)

process.env.SKIPCASH_WEBHOOK_KEY = 'test-webhook-key'

function signWebhook(payload: {
  PaymentId: string
  Amount: string
  StatusId: number
  TransactionId?: string
  Custom1?: string
  VisaId?: string
}): string {
  const fields = ['PaymentId', 'Amount', 'StatusId', 'TransactionId', 'Custom1', 'VisaId'] as const
  const combined = fields
    .filter((key) => (payload as Record<string, unknown>)[key] !== undefined)
    .map((key) => `${key}=${(payload as Record<string, unknown>)[key]}`)
    .join(',')
  return createHmac('sha256', 'test-webhook-key').update(combined).digest('base64')
}

/** ID: PAY-01..PAY-10 — SkipCash payment intent, status, and webhook tests */
describe('SkipCash payments API', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
    process.env.SKIPCASH_KEY_ID = 'key-id'
    process.env.SKIPCASH_KEY_SECRET = 'key-secret'
  })

  afterEach(async () => {
    await resetDb()
    vi.mocked(createSkipCashPayment).mockReset()
  })

  it('PAY-01: create-intent requires customer auth', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    const res = await agent
      .post('/api/payments/skipcash/create-intent')
      .send({ vehicleId: fixtures.vehicles[0].id })
    expect(res.status).toBe(403)
  })

  it('PAY-02: create-intent needs a phone number on file or in the request', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const res = await agent
      .post('/api/payments/skipcash/create-intent')
      .send({ vehicleId: fixtures.vehicles[0].id })
    expect(res.status).toBe(400)
  })

  it('PAY-03: create-intent rejects a vehicle that is not available', async () => {
    const fixtures = await seedFixtures()
    await db.update(vehicles).set({ status: 'rented' }).where(eq(vehicles.id, fixtures.vehicles[0].id))
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const res = await agent.post('/api/payments/skipcash/create-intent').send({
      vehicleId: fixtures.vehicles[0].id,
      contact: { firstName: 'Jane', lastName: 'Doe', phone: '+97455512345', email: 'jane@test.dev' },
    })
    expect(res.status).toBe(409)
  })

  it('PAY-04: create-intent creates a pending payment and returns the SkipCash pay URL', async () => {
    vi.mocked(createSkipCashPayment).mockResolvedValue({
      id: 'skipcash-ext-id',
      payUrl: 'https://skipcashtest.azurewebsites.net/pay/abc',
      statusId: SkipCashStatus.NEW,
    })
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const note = JSON.stringify({ durationMonths: 2, startDate: startDateSoon, total: 900 })
    const res = await agent.post('/api/payments/skipcash/create-intent').send({
      vehicleId: fixtures.vehicles[0].id,
      note,
      contact: { firstName: 'Jane', lastName: 'Doe', phone: '+97455512345', email: 'jane@test.dev' },
    })
    expect(res.status).toBe(201)
    expect(res.body.payUrl).toBe('https://skipcashtest.azurewebsites.net/pay/abc')

    const [row] = await db.select().from(payments).where(eq(payments.id, res.body.paymentId))
    expect(row.status).toBe('pending')
    expect(row.provider).toBe('skipcash')
    // invygo/FINN model: the online charge is the FIRST MONTH, not the term.
    expect(Number(row.amount)).toBe(450 * 30)
    // The vehicle is held by a booking request the moment the intent starts.
    expect(row.bookingRequestId).toBeTruthy()
    const [hold] = await db
      .select()
      .from(bookingRequests)
      .where(eq(bookingRequests.id, row.bookingRequestId!))
    expect(hold.status).toBe('pending')
    expect(hold.awaitingPayment).toBe(true)
    expect(createSkipCashPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 450 * 30,
        returnUrl: expect.stringMatching(/\/skipcash-pay\/return\?paymentId=/),
        webhookUrl: expect.stringMatching(/\/skipcash-pay\/callback$/),
      })
    )
  })

  it('PAY-04b: create-intent ignores client-supplied cart.total', async () => {
    vi.mocked(createSkipCashPayment).mockResolvedValue({
      id: 'skipcash-ext-id',
      payUrl: 'https://skipcashtest.azurewebsites.net/pay/abc',
      statusId: SkipCashStatus.NEW,
    })
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const note = JSON.stringify({ durationMonths: 1, total: 1 })
    const res = await agent.post('/api/payments/skipcash/create-intent').send({
      vehicleId: fixtures.vehicles[0].id,
      note,
      contact: { firstName: 'Jane', lastName: 'Doe', phone: '+97455512345', email: 'jane@test.dev' },
    })
    expect(res.status).toBe(201)
    expect(createSkipCashPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 450 * 30 })
    )
  })

  it('PAY-05: create-intent marks the payment failed if SkipCash rejects the request', async () => {
    vi.mocked(createSkipCashPayment).mockRejectedValue(new Error('SkipCash unreachable'))
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const res = await agent.post('/api/payments/skipcash/create-intent').send({
      vehicleId: fixtures.vehicles[0].id,
      contact: { firstName: 'Jane', lastName: 'Doe', phone: '+97455512345', email: 'jane@test.dev' },
    })
    expect(res.status).toBe(502)
    const rows = await db.select().from(payments)
    expect(rows[0].status).toBe('failed')
  })

  it('PAY-06: status endpoint is scoped to the owning customer', async () => {
    vi.mocked(createSkipCashPayment).mockResolvedValue({
      id: 'skipcash-ext-id',
      payUrl: 'https://skipcashtest.azurewebsites.net/pay/abc',
      statusId: SkipCashStatus.NEW,
    })
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const created = await agent.post('/api/payments/skipcash/create-intent').send({
      vehicleId: fixtures.vehicles[0].id,
      contact: { firstName: 'Jane', lastName: 'Doe', phone: '+97455512345', email: 'jane@test.dev' },
    })

    const own = await agent.get(`/api/payments/skipcash/status/${created.body.paymentId}`)
    expect(own.status).toBe(200)
    expect(own.body.status).toBe('pending')

    const { agent: otherAgent } = await loginAs(app, fixtures.customer2.email, 'customer')
    const other = await otherAgent.get(`/api/payments/skipcash/status/${created.body.paymentId}`)
    expect(other.status).toBe(404)
  })

  it('PAY-07: webhook rejects an invalid signature', async () => {
    const payload = { PaymentId: 'pay-1', Amount: '10.00', StatusId: SkipCashStatus.PAID, TransactionId: 'tx-x' }
    const res = await postWebhook(app, payload, 'wrong-signature')
    expect(res.status).toBe(401)
  })

  it('PAY-08: paid webhook creates the booking request and completes the payment', async () => {
    vi.mocked(createSkipCashPayment).mockResolvedValue({
      id: 'skipcash-ext-id',
      payUrl: 'https://skipcashtest.azurewebsites.net/pay/abc',
      statusId: SkipCashStatus.NEW,
    })
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const note = JSON.stringify({ durationMonths: 1, startDate: startDateSoon, total: 450 })
    const created = await agent.post('/api/payments/skipcash/create-intent').send({
      vehicleId: fixtures.vehicles[0].id,
      note,
      contact: { firstName: 'Jane', lastName: 'Doe', phone: '+97455512345', email: 'jane@test.dev' },
    })

    const payload = {
      PaymentId: 'skipcash-ext-id',
      Amount: '13500.00',
      StatusId: SkipCashStatus.PAID,
      TransactionId: created.body.paymentId,
    }
    const res = await postWebhook(app, payload, signWebhook(payload))
    expect(res.status).toBe(200)

    const [payment] = await db.select().from(payments).where(eq(payments.id, created.body.paymentId))
    expect(payment.status).toBe('completed')
    expect(payment.bookingRequestId).toBeTruthy()

    const [booking] = await db
      .select()
      .from(bookingRequests)
      .where(eq(bookingRequests.id, payment.bookingRequestId!))
    expect(booking.status).toBe('pending')
    expect(booking.vehicleId).toBe(fixtures.vehicles[0].id)
  })

  it('PAY-09: webhook is idempotent for repeated calls on the same payment', async () => {
    vi.mocked(createSkipCashPayment).mockResolvedValue({
      id: 'skipcash-ext-id',
      payUrl: 'https://skipcashtest.azurewebsites.net/pay/abc',
      statusId: SkipCashStatus.NEW,
    })
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const created = await agent.post('/api/payments/skipcash/create-intent').send({
      vehicleId: fixtures.vehicles[0].id,
      contact: { firstName: 'Jane', lastName: 'Doe', phone: '+97455512345', email: 'jane@test.dev' },
    })
    const payload = {
      PaymentId: 'skipcash-ext-id',
      Amount: '13500.00',
      StatusId: SkipCashStatus.PAID,
      TransactionId: created.body.paymentId,
    }
    await postWebhook(app, payload, signWebhook(payload))
    await postWebhook(app, payload, signWebhook(payload))

    const bookings = await db.select().from(bookingRequests)
    expect(bookings.length).toBe(1)
  })

  it('PAY-10: failed-status webhook marks the payment failed without creating a booking', async () => {
    vi.mocked(createSkipCashPayment).mockResolvedValue({
      id: 'skipcash-ext-id',
      payUrl: 'https://skipcashtest.azurewebsites.net/pay/abc',
      statusId: SkipCashStatus.NEW,
    })
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const created = await agent.post('/api/payments/skipcash/create-intent').send({
      vehicleId: fixtures.vehicles[0].id,
      contact: { firstName: 'Jane', lastName: 'Doe', phone: '+97455512345', email: 'jane@test.dev' },
    })
    const payload = {
      PaymentId: 'skipcash-ext-id',
      Amount: '13500.00',
      StatusId: SkipCashStatus.FAILED,
      TransactionId: created.body.paymentId,
    }
    await postWebhook(app, payload, signWebhook(payload))

    const [payment] = await db.select().from(payments).where(eq(payments.id, created.body.paymentId))
    expect(payment.status).toBe('failed')
    // The hold created at intent time is released so the car is bookable again.
    const bookings = await db.select().from(bookingRequests)
    expect(bookings.length).toBe(1)
    expect(bookings[0].status).toBe('declined')
    expect(bookings[0].awaitingPayment).toBe(false)
  })

  it('PAY-11: webhook rejects amount mismatch without creating booking', async () => {
    vi.mocked(createSkipCashPayment).mockResolvedValue({
      id: 'skipcash-ext-id',
      payUrl: 'https://skipcashtest.azurewebsites.net/pay/abc',
      statusId: SkipCashStatus.NEW,
    })
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const created = await agent.post('/api/payments/skipcash/create-intent').send({
      vehicleId: fixtures.vehicles[0].id,
      contact: { firstName: 'Jane', lastName: 'Doe', phone: '+97455512345', email: 'jane@test.dev' },
    })
    const payload = {
      PaymentId: 'skipcash-ext-id',
      Amount: '1.00',
      StatusId: SkipCashStatus.PAID,
      TransactionId: created.body.paymentId,
    }
    await postWebhook(app, payload, signWebhook(payload))
    const [payment] = await db.select().from(payments).where(eq(payments.id, created.body.paymentId))
    expect(payment.status).toBe('failed')
    // Money WAS captured at the provider for the wrong amount: flag it.
    expect(payment.needsRefund).toBe(true)
    // The hold is released rather than leaving the car blocked.
    const bookings = await db.select().from(bookingRequests)
    expect(bookings).toHaveLength(1)
    expect(bookings[0].status).toBe('declined')
  })

  it('PAY-12: portal callback path /skipcash-pay/callback accepts a valid webhook', async () => {
    vi.mocked(createSkipCashPayment).mockResolvedValue({
      id: 'skipcash-ext-id',
      payUrl: 'https://skipcashtest.azurewebsites.net/pay/abc',
      statusId: SkipCashStatus.NEW,
    })
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const note = JSON.stringify({ durationMonths: 1, startDate: startDateSoon, total: 450 })
    const created = await agent.post('/api/payments/skipcash/create-intent').send({
      vehicleId: fixtures.vehicles[0].id,
      note,
      contact: { firstName: 'Jane', lastName: 'Doe', phone: '+97455512345', email: 'jane@test.dev' },
    })

    const payload = {
      PaymentId: 'skipcash-ext-id',
      Amount: '13500.00',
      StatusId: SkipCashStatus.PAID,
      TransactionId: created.body.paymentId,
    }
    const res = await supertest(app)
      .post('/skipcash-pay/callback')
      .set('Authorization', signWebhook(payload))
      .send(payload as object)
    expect(res.status).toBe(200)

    const [payment] = await db.select().from(payments).where(eq(payments.id, created.body.paymentId))
    expect(payment.status).toBe('completed')
  })
})

function postWebhook(app: Express, payload: unknown, signature: string) {
  return supertest(app).post('/api/payments/skipcash/webhook').set('Authorization', signature).send(payload as object)
}
