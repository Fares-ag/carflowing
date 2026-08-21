import { createHmac } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { Express } from 'express'
import request from 'supertest'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/index.js'
import { bookingRequests, invoices, payments, rentals } from '../../db/schema.js'
import { SkipCashStatus, createSkipCashPayment } from '../../services/skipcash.js'
import { buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'

vi.mock('../../services/skipcash.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/skipcash.js')>()
  return { ...actual, createSkipCashPayment: vi.fn() }
})

process.env.SKIPCASH_WEBHOOK_KEY = 'test-webhook-key'
process.env.SKIPCASH_KEY_ID = 'key-id'
process.env.SKIPCASH_KEY_SECRET = 'key-secret'

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

async function bookAndApprove(app: Express, fixtures: Awaited<ReturnType<typeof seedFixtures>>) {
  const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')
  const br = await customerAgent
    .post('/api/customer/booking-requests')
    .send({ vehicleId: fixtures.vehicles[0].id, note: JSON.stringify({ durationMonths: 3 }) })
  const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
  await dealerAgent.patch(`/api/dealer/booking-requests/${br.body.id}/status`).send({ status: 'approved' })
  const [rental] = await db.select().from(rentals)
  return { rental, customerAgent, dealerAgent }
}

/** ID: RETRY-01..05 — one-tap SkipCash retry without duplicate bookings/payments */
describe('SkipCash payment retry API', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    await resetDb()
    vi.mocked(createSkipCashPayment).mockReset()
  })

  it('RETRY-01: rental retry reuses the booking hold and leaves one pending payment', async () => {
    vi.mocked(createSkipCashPayment)
      .mockResolvedValueOnce({ id: 'ext-r1', payUrl: 'https://pay/r1', statusId: SkipCashStatus.NEW })
      .mockResolvedValueOnce({ id: 'ext-r2', payUrl: 'https://pay/r2', statusId: SkipCashStatus.NEW })
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const note = JSON.stringify({ durationMonths: 2, startDate: '2030-02-01', total: 900 })
    const contact = { firstName: 'Jane', lastName: 'Doe', phone: '+97455512345', email: 'jane@test.dev' }
    const created = await agent.post('/api/payments/skipcash/create-intent').send({
      vehicleId: fixtures.vehicles[0].id,
      note,
      contact,
    })
    expect(created.status).toBe(201)
    await db.update(payments).set({ status: 'failed' }).where(eq(payments.id, created.body.paymentId))

    const retry = await agent.post(`/api/payments/skipcash/retry/${created.body.paymentId}`)
    expect(retry.status).toBe(201)
    expect(retry.body.payUrl).toBe('https://pay/r2')

    const holds = await db
      .select()
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.vehicleId, fixtures.vehicles[0].id),
          eq(bookingRequests.customerId, fixtures.customer.id)
        )
      )
    expect(holds).toHaveLength(1)
    expect(holds[0].awaitingPayment).toBe(true)

    const pending = await db
      .select()
      .from(payments)
      .where(
        and(eq(payments.bookingRequestId, holds[0].id), eq(payments.status, 'pending'))
      )
    expect(pending).toHaveLength(1)
    expect(pending[0].id).toBe(retry.body.paymentId)

    const [original] = await db.select().from(payments).where(eq(payments.id, created.body.paymentId))
    expect(original.status).toBe('failed')
  })

  it('RETRY-02: invoice retry leaves exactly one pending payment for the invoice', async () => {
    vi.mocked(createSkipCashPayment)
      .mockResolvedValueOnce({ id: 'ext-i1', payUrl: 'https://pay/i1', statusId: SkipCashStatus.NEW })
      .mockResolvedValueOnce({ id: 'ext-i2', payUrl: 'https://pay/i2', statusId: SkipCashStatus.NEW })
    const fixtures = await seedFixtures()
    const { profiles } = await import('../../db/schema.js')
    await db.update(profiles).set({ phone: '+97455512345' }).where(eq(profiles.id, fixtures.customer.id))
    const { rental, customerAgent } = await bookAndApprove(app, fixtures)
    const [invoice] = await db.select().from(invoices).where(eq(invoices.rentalId, rental.id))

    const first = await customerAgent.post('/api/payments/skipcash/invoice-intent').send({ invoiceId: invoice.id })
    expect(first.status).toBe(201)
    await db.update(payments).set({ status: 'failed' }).where(eq(payments.id, first.body.paymentId))

    const retry = await customerAgent.post(`/api/payments/skipcash/retry/${first.body.paymentId}`)
    expect(retry.status).toBe(201)

    const pending = await db
      .select()
      .from(payments)
      .where(and(eq(payments.invoiceId, invoice.id), eq(payments.status, 'pending')))
    expect(pending).toHaveLength(1)
    expect(pending[0].id).toBe(retry.body.paymentId)
  })

  it('RETRY-03: a successful retry settles normally via webhook', async () => {
    vi.mocked(createSkipCashPayment)
      .mockResolvedValueOnce({ id: 'ext-s1', payUrl: 'https://pay/s1', statusId: SkipCashStatus.NEW })
      .mockResolvedValueOnce({ id: 'ext-s2', payUrl: 'https://pay/s2', statusId: SkipCashStatus.NEW })
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const contact = { firstName: 'Jane', lastName: 'Doe', phone: '+97455512345', email: 'jane@test.dev' }
    const created = await agent.post('/api/payments/skipcash/create-intent').send({
      vehicleId: fixtures.vehicles[0].id,
      contact,
    })
    await db.update(payments).set({ status: 'failed' }).where(eq(payments.id, created.body.paymentId))

    const retry = await agent.post(`/api/payments/skipcash/retry/${created.body.paymentId}`)
    expect(retry.status).toBe(201)

    const payload = {
      PaymentId: 'ext-s2',
      Amount: (450 * 30).toFixed(2),
      StatusId: SkipCashStatus.PAID,
      TransactionId: retry.body.paymentId,
    }
    const webhook = await postWebhook(app, payload)
    expect(webhook.status).toBe(200)

    const [paid] = await db.select().from(payments).where(eq(payments.id, retry.body.paymentId))
    expect(paid.status).toBe('completed')
  })

  it('RETRY-04: retry rejects an already-completed payment', async () => {
    vi.mocked(createSkipCashPayment).mockResolvedValue({
      id: 'ext-c1',
      payUrl: 'https://pay/c1',
      statusId: SkipCashStatus.NEW,
    })
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const contact = { firstName: 'Jane', lastName: 'Doe', phone: '+97455512345', email: 'jane@test.dev' }
    const created = await agent.post('/api/payments/skipcash/create-intent').send({
      vehicleId: fixtures.vehicles[0].id,
      contact,
    })
    await db.update(payments).set({ status: 'completed' }).where(eq(payments.id, created.body.paymentId))

    const retry = await agent.post(`/api/payments/skipcash/retry/${created.body.paymentId}`)
    expect(retry.status).toBe(409)
  })

  it('RETRY-05: status exposes canRetry for failed rental and subscription payments', async () => {
    vi.mocked(createSkipCashPayment).mockResolvedValue({
      id: 'ext-st',
      payUrl: 'https://pay/st',
      statusId: SkipCashStatus.NEW,
    })
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const contact = { firstName: 'Jane', lastName: 'Doe', phone: '+97455512345', email: 'jane@test.dev' }
    const created = await agent.post('/api/payments/skipcash/create-intent').send({
      vehicleId: fixtures.vehicles[0].id,
      contact,
    })
    await db.update(payments).set({ status: 'failed' }).where(eq(payments.id, created.body.paymentId))

    const status = await agent.get(`/api/payments/skipcash/status/${created.body.paymentId}`)
    expect(status.status).toBe(200)
    expect(status.body.canRetry).toBe(true)
  })
})
