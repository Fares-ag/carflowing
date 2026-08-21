import crypto from 'crypto'
import { eq } from 'drizzle-orm'
import type { Express } from 'express'
import request from 'supertest'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../../db/index.js'
import {
  bookingRequests,
  favorites,
  passwordResetTokens,
  rentals,
  subscriptions,
} from '../../db/schema.js'
import { buildTestApp, DEMO_PASSWORD, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'

/** ID: FLOW-01..FLOW-07 — end-to-end API business flows */
describe('Business flow integration', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    await resetDb()
  })

  it('FLOW-01: customer signup → browse → create booking request (pending)', async () => {
    const fixtures = await seedFixtures()
    await request(app)
      .post('/api/auth/signup')
      .send({ email: 'flow1@test.dev', password: 'password123', name: 'Flow Customer' })

    const { agent } = await loginAs(app, 'flow1@test.dev', 'customer')
    const vehicles = await agent.get('/api/customer/vehicles')
    expect(vehicles.body.items.length).toBeGreaterThan(0)
    const br = await agent
      .post('/api/customer/booking-requests')
      .send({ vehicleId: fixtures.vehicles[0].id })
    expect(br.status).toBe(201)
    expect(br.body.status).toBe('pending')
  })

  it('FLOW-02: dealer approves booking → rental created', async () => {
    const fixtures = await seedFixtures()
    const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')
    const br = await customerAgent
      .post('/api/customer/booking-requests')
      .send({ vehicleId: fixtures.vehicles[0].id })
    const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    await dealerAgent.patch(`/api/dealer/booking-requests/${br.body.id}/status`).send({ status: 'approved' })
    const rows = await db.select().from(rentals)
    expect(rows.length).toBe(1)
    expect(rows[0].customerId).toBe(fixtures.customer.id)
  })

  it('FLOW-03: dealer records offline payment → paymentStatus paid', async () => {
    const fixtures = await seedFixtures()
    const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')
    const br = await customerAgent
      .post('/api/customer/booking-requests')
      .send({ vehicleId: fixtures.vehicles[0].id })
    const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    await dealerAgent.patch(`/api/dealer/booking-requests/${br.body.id}/status`).send({ status: 'approved' })
    const [rental] = await db.select().from(rentals)
    await dealerAgent.post('/api/dealer/payments/offline').send({
      rentalId: rental.id,
      customerId: fixtures.customer.id,
      amount: Number(rental.totalAmount),
      method: 'bank',
    })
    const [updated] = await db.select().from(rentals).where(eq(rentals.id, rental.id))
    expect(updated.paymentStatus).toBe('completed')
  })

  it('FLOW-04: customer adds favorite → lists favorites', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    await agent.post('/api/customer/favorites').send({ vehicleId: fixtures.vehicles[0].id })
    const list = await agent.get('/api/customer/favorites')
    expect(list.body.items.some((f: { vehicleId: string }) => f.vehicleId === fixtures.vehicles[0].id)).toBe(true)
    const rows = await db.select().from(favorites)
    expect(rows.length).toBe(1)
  })

  it('FLOW-05: admin suspends customer → login fails', async () => {
    const fixtures = await seedFixtures()
    const { agent: adminAgent } = await loginAs(app, fixtures.admin.email, 'admin')
    await adminAgent.patch(`/api/admin/customers/${fixtures.customer.id}/status`).send({ status: 'suspended' })
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: fixtures.customer.email, password: DEMO_PASSWORD, expectedRole: 'customer' })
    expect(login.status).toBe(403)
  })

  it('FLOW-06: admin creates plan → dealer subscription can reference it', async () => {
    const fixtures = await seedFixtures()
    const { agent: adminAgent } = await loginAs(app, fixtures.admin.email, 'admin')
    const plan = await adminAgent.post('/api/admin/plans').send({
      name: 'Flow Plan',
      tier: 'professional',
      status: 'active',
      priceMonthly: 199,
      priceYearly: 1990,
      features: ['analytics'],
    })
    await db.insert(subscriptions).values({
      ownerId: fixtures.dealer.id,
      ownerType: 'dealer',
      planId: plan.body.id,
      status: 'active',
    })
    const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    const sub = await dealerAgent.get('/api/dealer/subscription')
    expect(sub.body?.planId).toBe(plan.body.id)
  })

  it('FLOW-07: password reset full cycle with single-use token', async () => {
    const fixtures = await seedFixtures()
    await request(app).post('/api/auth/forgot-password').send({ email: fixtures.customer.email })
    const raw = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex')
    await db.insert(passwordResetTokens).values({
      userId: fixtures.customer.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 3600000),
    })
    const reset = await request(app).post('/api/auth/reset-password').send({ token: raw, password: 'newpass123' })
    expect(reset.status).toBe(200)
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: fixtures.customer.email, password: 'newpass123', expectedRole: 'customer' })
    expect(login.status).toBe(200)
    const reuse = await request(app).post('/api/auth/reset-password').send({ token: raw, password: 'x' })
    expect(reuse.status).toBe(400)
  })

  it('FLOW-08 (closes GAP-P1-012): approve honors the checkout cart duration/total instead of a fixed 3-day estimate', async () => {
    const fixtures = await seedFixtures()
    const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')
    // Start dates are server-clamped to [today, today+3 months]; use a valid one.
    const start = new Date()
    start.setUTCDate(start.getUTCDate() + 30)
    const startDate = start.toISOString().slice(0, 10)
    const note = JSON.stringify({ durationMonths: 3, startDate, total: 1234 })
    const br = await customerAgent
      .post('/api/customer/booking-requests')
      .send({ vehicleId: fixtures.vehicles[0].id, note })
    const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    await dealerAgent.patch(`/api/dealer/booking-requests/${br.body.id}/status`).send({ status: 'approved' })
    const [rental] = await db.select().from(rentals)
    expect(rental.startDate).toBe(startDate)
    const expectedEnd = new Date(`${startDate}T00:00:00Z`)
    expectedEnd.setUTCMonth(expectedEnd.getUTCMonth() + 3)
    expect(rental.endDate).toBe(expectedEnd.toISOString().slice(0, 10))
    expect(Number(rental.totalAmount)).toBe(450 * 30 * 3)
    // Subscription fields captured at approval (invygo-style monthly cycle):
    expect(Number(rental.monthlyAmount)).toBe(450 * 30)
    expect(rental.termMonths).toBe(3)
    expect(rental.nextBillingDate).not.toBeNull()
  })

  it('RACE-01: two customers booking the same vehicle - only one pending request wins', async () => {
    const fixtures = await seedFixtures()
    const { agent: c1 } = await loginAs(app, fixtures.customer.email, 'customer')
    const { agent: c2 } = await loginAs(app, fixtures.customer2.email, 'customer')
    const [a, b] = await Promise.all([
      c1.post('/api/customer/booking-requests').send({ vehicleId: fixtures.vehicles[0].id }),
      c2.post('/api/customer/booking-requests').send({ vehicleId: fixtures.vehicles[0].id }),
    ])
    expect([a.status, b.status].sort()).toEqual([201, 409])
    const rows = await db.select().from(bookingRequests)
    expect(rows.length).toBe(1)
  })
})
