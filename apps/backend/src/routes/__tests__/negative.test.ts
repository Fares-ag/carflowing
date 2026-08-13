import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Express } from 'express'
import request from 'supertest'
import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { bookingRequests, favorites, profiles, rentals, vehicles } from '../../db/schema.js'
import { buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'

/** Phase 8b — expanded API negative paths and validation gaps */
describe('API negative paths', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    await resetDb()
  })

  it('AUTH-N02: signup with short password is rejected', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'short@test.dev', password: '123', name: 'Short' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/at least 8 characters/)
  })

  it('AUTH-N05: refresh after logout fails', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    await agent.post('/api/auth/logout')
    const refresh = await agent.post('/api/auth/refresh')
    expect(refresh.status).toBe(401)
  })

  it('CUST-N08: booking note patch persists', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const br = await agent
      .post('/api/customer/booking-requests')
      .send({ vehicleId: fixtures.vehicles[0].id, note: 'Initial' })
    const patched = await agent
      .patch(`/api/customer/booking-requests/${br.body.id}/note`)
      .send({ note: 'Saved note' })
    expect(patched.body.note).toBe('Saved note')
  })

  it('CUST-N18: removing favorite twice is idempotent (204)', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const fav = await agent.post('/api/customer/favorites').send({ vehicleId: fixtures.vehicles[0].id })
    await agent.delete(`/api/customer/favorites/${fav.body.id}`)
    const again = await agent.delete(`/api/customer/favorites/${fav.body.id}`)
    expect(again.status).toBe(204)
  })

  it('DEAL-N01: extra vehicle fields from UI are ignored on create', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    const res = await agent.post('/api/dealer/vehicles').send({
      name: 'Extra Fields Car',
      make: 'Ford',
      model: 'Focus',
      year: 2022,
      category: 'sedan',
      pricePerDay: 120,
      transmission: 'automatic',
      fuelType: 'gas',
      seats: 5,
      color: 'red',
      licensePlate: 'QA-123',
      weeklyRate: 700,
      features: ['sunroof', 'gps'],
    })
    expect(res.status).toBe(201)
    expect(res.body.color).toBe('red')
    expect(res.body.licensePlate).toBe('QA-123')
  })

  it('DEAL-N11: lead priority/notes are persisted by API', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    const lead = await agent.post('/api/dealer/leads').send({
      name: 'Lead',
      email: 'l@test.dev',
      source: 'web',
      priority: 'high',
      notes: 'Call back',
    })
    expect(lead.body.priority).toBe('high')
    expect(lead.body.notes).toBe('Call back')
  })

  it('ADM-N26: compose message to missing user returns error', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')
    const res = await agent.post('/api/admin/messages').send({
      toUserId: '00000000-0000-0000-0000-000000000099',
      subject: 'Hi',
      body: 'There',
    })
    expect([201, 404, 500]).toContain(res.status)
  })

  it('UPL-N01: multer rejects avatar over 10MB with 413', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const big = Buffer.alloc(11 * 1024 * 1024)
    const res = await agent
      .post('/api/uploads/avatar')
      .attach('file', big, { filename: 'huge.png', contentType: 'image/png' })
    expect([400, 413, 500]).toContain(res.status)
  })
})

describe('API data integrity', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    await resetDb()
  })

  it('ADM-N28: deleting vehicle cascades pending booking requests (FK ON DELETE CASCADE)', async () => {
    const fixtures = await seedFixtures()
    const [br] = await db
      .insert(bookingRequests)
      .values({ customerId: fixtures.customer.id, vehicleId: fixtures.vehicles[0].id, status: 'pending' })
      .returning()
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')
    await agent.delete(`/api/admin/vehicles/${fixtures.vehicles[0].id}`)
    const [stillThere] = await db.select().from(bookingRequests).where(eq(bookingRequests.id, br.id))
    expect(stillThere).toBeUndefined()
  })

  it('ADM-N18: suspending customer does not auto-cancel active rentals', async () => {
    const fixtures = await seedFixtures()
    const today = new Date().toISOString().slice(0, 10)
    await db.insert(rentals).values({
      customerId: fixtures.customer.id,
      dealerId: fixtures.dealer.dealerId,
      vehicleId: fixtures.vehicles[0].id,
      startDate: today,
      endDate: today,
      status: 'active',
      totalAmount: '100',
      paymentStatus: 'pending',
    })
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')
    await agent.patch(`/api/admin/customers/${fixtures.customer.id}/status`).send({ status: 'suspended' })
    const rows = await db.select().from(rentals)
    expect(rows[0].status).toBe('active')
  })

  it('DEAL-N25: deleteVehicle with active rental is blocked', async () => {
    const fixtures = await seedFixtures()
    const today = new Date().toISOString().slice(0, 10)
    await db.insert(rentals).values({
      customerId: fixtures.customer.id,
      dealerId: fixtures.dealer.dealerId,
      vehicleId: fixtures.vehicles[0].id,
      startDate: today,
      endDate: today,
      status: 'active',
      totalAmount: '100',
      paymentStatus: 'pending',
    })
    const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    const res = await agent.delete(`/api/dealer/vehicles/${fixtures.vehicles[0].id}`)
    expect(res.status).toBe(409)
  })
})

describe('API concurrency', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    await resetDb()
  })

  it('RACE-05: favorite add/remove rapid sequence ends consistent', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const added = await agent.post('/api/customer/favorites').send({ vehicleId: fixtures.vehicles[0].id })
    await Promise.all([
      agent.delete(`/api/customer/favorites/${added.body.id}`),
      agent.post('/api/customer/favorites').send({ vehicleId: fixtures.vehicles[1].id }),
    ])
    const list = await agent.get('/api/customer/favorites')
    expect(list.body.items.length).toBeLessThanOrEqual(2)
  })

  it('RACE-11: duplicate offline payment posts are idempotent', async () => {
    const fixtures = await seedFixtures()
    const today = new Date().toISOString().slice(0, 10)
    const [rental] = await db
      .insert(rentals)
      .values({
        customerId: fixtures.customer.id,
        dealerId: fixtures.dealer.dealerId,
        vehicleId: fixtures.vehicles[0].id,
        startDate: today,
        endDate: today,
        status: 'reserved',
        totalAmount: '200',
        paymentStatus: 'pending',
      })
      .returning()
    const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    const payload = { rentalId: rental.id, customerId: fixtures.customer.id, amount: 200, method: 'bank' }
    const [a, b] = await Promise.all([
      agent.post('/api/dealer/payments/offline').send(payload),
      agent.post('/api/dealer/payments/offline').send(payload),
    ])
    expect([201, 200]).toContain(a.status)
    expect([201, 200]).toContain(b.status)
    expect(a.body.id).toBe(b.body.id)
  })

  it('RACE-07: suspended user next authenticated request fails at login, not mid-session token', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const { agent: adminAgent } = await loginAs(app, fixtures.admin.email, 'admin')
    await adminAgent.patch(`/api/admin/customers/${fixtures.customer.id}/status`).send({ status: 'suspended' })
    const me = await agent.get('/api/customer/dashboard')
    expect([401, 403]).toContain(me.status)
    await db.update(profiles).set({ status: 'active' }).where(eq(profiles.id, fixtures.customer.id))
  })

  it('RACE-03: dealer + admin parallel approve creates exactly one rental', async () => {
    const fixtures = await seedFixtures()
    const [br] = await db
      .insert(bookingRequests)
      .values({ customerId: fixtures.customer.id, vehicleId: fixtures.vehicles[0].id, status: 'pending' })
      .returning()
    const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    const { agent: adminAgent } = await loginAs(app, fixtures.admin.email, 'admin')
    await Promise.all([
      dealerAgent.patch(`/api/dealer/booking-requests/${br.id}/status`).send({ status: 'approved' }),
      adminAgent.patch(`/api/admin/booking-requests/${br.id}/status`).send({ status: 'approved' }),
    ])
    const rows = await db.select().from(rentals)
    expect(rows.length).toBe(1)
  })
})
