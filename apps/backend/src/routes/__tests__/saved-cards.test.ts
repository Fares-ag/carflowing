import { and, eq } from 'drizzle-orm'
import type { Express } from 'express'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/index.js'
import { invoices, paymentMethods, payments, profiles, rentals } from '../../db/schema.js'
import { SkipCashStatus, createSkipCashPayment } from '../../services/skipcash.js'
import { buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'

vi.mock('../../services/skipcash.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/skipcash.js')>()
  return {
    ...actual,
    createSkipCashPayment: vi.fn(),
    getSkipCashCardDetails: vi.fn(),
  }
})

process.env.SKIPCASH_KEY_ID = 'key-id'
process.env.SKIPCASH_KEY_SECRET = 'key-secret'

async function customerDueInvoice(app: Express, fixtures: Awaited<ReturnType<typeof seedFixtures>>) {
  await db.update(profiles).set({ phone: '+97455512345' }).where(eq(profiles.id, fixtures.customer.id))
  const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')
  const br = await customerAgent
    .post('/api/customer/booking-requests')
    .send({ vehicleId: fixtures.vehicles[0].id, note: JSON.stringify({ durationMonths: 3 }) })
  const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
  await dealerAgent.patch(`/api/dealer/booking-requests/${br.body.id}/status`).send({ status: 'approved' })
  const [rental] = await db.select().from(rentals)
  const [invoice] = await db.select().from(invoices).where(eq(invoices.rentalId, rental.id))
  return { customerAgent, invoice }
}

/** ID: SCARD-01..05 — SkipCash saved-card capability flag (default off) */
describe('SkipCash saved-card payments', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    delete process.env.SKIPCASH_SAVED_CARDS_ENABLED
    delete process.env.SKIPCASH_SAVED_CARDS_CHARGE_READY
    await resetDb()
    vi.mocked(createSkipCashPayment).mockReset()
  })

  it('SCARD-01: billing capabilities report saved cards off by default', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const res = await agent.get('/api/customer/billing-capabilities')
    expect(res.status).toBe(200)
    expect(res.body.skipcashSavedCardsEnabled).toBe(false)
    expect(res.body.skipcashSavedCardsChargeReady).toBe(false)
    expect(String(res.body.capabilityRequired)).toContain('Tokenization')
  })

  it('SCARD-02: saved-card invoice intent is unavailable when flag is off', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const res = await agent
      .post('/api/payments/skipcash/invoice-intent-saved-card')
      .send({
        invoiceId: '00000000-0000-0000-0000-000000000099',
        paymentMethodId: '00000000-0000-0000-0000-000000000001',
      })
    expect(res.status).toBe(404)
  })

  it('SCARD-03: reference-only payment methods cannot be charged when flag is on', async () => {
    process.env.SKIPCASH_SAVED_CARDS_ENABLED = 'true'
    const fixtures = await seedFixtures()
    const { customerAgent, invoice } = await customerDueInvoice(app, fixtures)
    const [method] = await db
      .insert(paymentMethods)
      .values({
        userId: fixtures.customer.id,
        brand: 'Visa',
        last4: '4242',
        expiryMonth: 12,
        expiryYear: 2030,
        provider: 'reference',
        isDefault: true,
      })
      .returning()
    const res = await customerAgent
      .post('/api/payments/skipcash/invoice-intent-saved-card')
      .send({ invoiceId: invoice.id, paymentMethodId: method.id })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/no saved SkipCash token/i)
  })

  it('SCARD-04: tokenized method falls back to hosted redirect while charge is stubbed', async () => {
    process.env.SKIPCASH_SAVED_CARDS_ENABLED = 'true'
    vi.mocked(createSkipCashPayment).mockResolvedValue({
      id: 'ext-inv',
      payUrl: 'https://pay/invoice',
      statusId: SkipCashStatus.NEW,
    })
    const fixtures = await seedFixtures()
    const { customerAgent, invoice } = await customerDueInvoice(app, fixtures)
    const [method] = await db
      .insert(paymentMethods)
      .values({
        userId: fixtures.customer.id,
        brand: 'Visa',
        last4: '1111',
        expiryMonth: 3,
        expiryYear: 2028,
        provider: 'skipcash',
        providerTokenId: 'tok-test-uuid',
        isDefault: true,
      })
      .returning()
    const res = await customerAgent
      .post('/api/payments/skipcash/invoice-intent-saved-card')
      .send({ invoiceId: invoice.id, paymentMethodId: method.id })
    expect(res.status).toBe(201)
    expect(res.body.payUrl).toBe('https://pay/invoice')
    expect(res.body.savedCardAttempted).toBe(true)
    expect(res.body.savedCardUsed).toBe(false)
    expect(res.body.message).toMatch(/hosted checkout/i)
    const pending = await db
      .select()
      .from(payments)
      .where(and(eq(payments.invoiceId, invoice.id), eq(payments.status, 'pending')))
    expect(pending).toHaveLength(1)
  })

  it('SCARD-05: payment method API never exposes provider token id', async () => {
    const fixtures = await seedFixtures()
    await db.insert(paymentMethods).values({
      userId: fixtures.customer.id,
      brand: 'Visa',
      last4: '1111',
      expiryMonth: 3,
      expiryYear: 2028,
      provider: 'skipcash',
      providerTokenId: 'secret-token-id',
      isDefault: true,
    })
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const res = await agent.get('/api/customer/payment-methods')
    expect(res.status).toBe(200)
    expect(res.body[0].hasProviderToken).toBe(true)
    expect(res.body[0].provider).toBe('skipcash')
    expect(JSON.stringify(res.body)).not.toContain('secret-token-id')
    expect(res.body[0].providerTokenId).toBeUndefined()
  })
})
