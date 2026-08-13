import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Express } from 'express'
import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { bookingRequests, rentals } from '../../db/schema.js'
import { buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'

/** ID: DEAL-01..DEAL-20 — dealer route integration tests */
describe('Dealer API', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    await resetDb()
  })

  it('DEAL-01/DEAL-02: dashboard KPIs and analytics metrics', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    const dash = await agent.get('/api/dealer/dashboard')
    expect(dash.status).toBe(200)
    expect(Array.isArray(dash.body.kpis)).toBe(true)

    const analytics = await agent.get('/api/dealer/analytics')
    expect(analytics.status).toBe(200)
    expect(typeof analytics.body.totalRevenue).toBe('number')
    expect(Array.isArray(analytics.body.customerDemographics)).toBe(true)
  })

  it('DEAL-03..DEAL-07: inventory CRUD and status toggle scoped to own dealer', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')

    const inv = await agent.get('/api/dealer/inventory')
    expect(inv.body.items.every((v: { dealerId: string }) => v.dealerId === fixtures.dealer.dealerId)).toBe(true)

    const created = await agent.post('/api/dealer/vehicles').send({
      name: 'QA Car',
      make: 'Toyota',
      model: 'Corolla',
      year: 2024,
      category: 'sedan',
      pricePerDay: 150,
      mileage: 100,
      transmission: 'automatic',
      fuelType: 'gas',
      seats: 5,
    })
    expect(created.status).toBe(201)

    const patched = await agent.patch(`/api/dealer/vehicles/${created.body.id}`).send({ name: 'QA Car Updated' })
    expect(patched.body.name).toBe('QA Car Updated')

    const status = await agent
      .patch(`/api/dealer/vehicles/${created.body.id}/status`)
      .send({ status: 'maintenance' })
    expect(status.body.status).toBe('maintenance')

    await agent.delete(`/api/dealer/vehicles/${created.body.id}`)
    const count = await agent.get('/api/dealer/vehicle-count')
    expect(count.body.count).toBeGreaterThanOrEqual(2)
  })

  it('DEAL-08..DEAL-10: booking requests list/approve/decline', async () => {
    const fixtures = await seedFixtures()
    const [br] = await db
      .insert(bookingRequests)
      .values({ customerId: fixtures.customer.id, vehicleId: fixtures.vehicles[0].id, status: 'pending' })
      .returning()

    const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    const list = await agent.get('/api/dealer/booking-requests')
    const listed = list.body.items.find((i: { id: string }) => i.id === br.id)
    expect(listed).toBeTruthy()
    expect(listed.customer).toMatchObject({
      id: fixtures.customer.id,
      email: fixtures.customer.email,
      name: fixtures.customer.name,
    })

    const approved = await agent
      .patch(`/api/dealer/booking-requests/${br.id}/status`)
      .send({ status: 'approved' })
    expect(approved.body.status).toBe('approved')

    const rentalRows = await db.select().from(rentals)
    expect(rentalRows.length).toBe(1)

    const [br2] = await db
      .insert(bookingRequests)
      .values({ customerId: fixtures.customer.id, vehicleId: fixtures.vehicles[1].id, status: 'pending' })
      .returning()
    const declined = await agent
      .patch(`/api/dealer/booking-requests/${br2.id}/status`)
      .send({ status: 'declined', declineReason: 'Unavailable' })
    expect(declined.body.declineReason).toBe('Unavailable')
  })

  it('DEAL-11: offline payment updates rental paymentStatus', async () => {
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
        totalAmount: '450',
        paymentStatus: 'pending',
      })
      .returning()

    const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    const pay = await agent.post('/api/dealer/payments/offline').send({
      rentalId: rental.id,
      customerId: fixtures.customer.id,
      amount: 450,
      method: 'bank',
    })
    expect(pay.status).toBe(201)

    const [updated] = await db.select().from(rentals).where(eq(rentals.id, rental.id))
    expect(updated.paymentStatus).toBe('completed')
    expect(updated.status).toBe('active')
  })

  it('DEAL-12..DEAL-13: leads CRUD and stage transitions', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')

    const created = await agent.post('/api/dealer/leads').send({
      name: 'Lead One',
      email: 'lead@test.dev',
      phone: '+974',
      source: 'web',
      stage: 'new',
    })
    expect(created.status).toBe(201)

    const updated = await agent.patch(`/api/dealer/leads/${created.body.id}`).send({ stage: 'contacted' })
    expect(updated.body.stage).toBe('contacted')

    const list = await agent.get('/api/dealer/leads')
    expect(list.body.items.length).toBe(1)

    await agent.delete(`/api/dealer/leads/${created.body.id}`)
  })

  it('DEAL-14: customer documents endpoint requires dealer-customer relationship', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    const denied = await agent.get(`/api/dealer/customer-documents/${fixtures.customer2.id}`)
    expect(denied.status).toBe(403)

    await db.insert(bookingRequests).values({
      customerId: fixtures.customer.id,
      vehicleId: fixtures.vehicles[0].id,
      status: 'pending',
    })
    const res = await agent.get(`/api/dealer/customer-documents/${fixtures.customer.id}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('qidDocumentPath')
  })

  it('DEAL-15: notifications list/read/read-all', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    const list = await agent.get('/api/dealer/notifications')
    expect(list.status).toBe(200)
    await agent.post('/api/dealer/notifications/read-all')
  })

  it('DEAL-16..DEAL-19: settings/subscription/payment-methods/billing-history', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')

    const settings = await agent.get('/api/dealer/settings')
    expect(settings.status).toBe(200)

    await agent.patch('/api/dealer/settings').send({ name: 'Updated Motors' })
    const sub = await agent.get('/api/dealer/subscription')
    expect(sub.status).toBe(200)

    const pms = await agent.get('/api/dealer/payment-methods')
    expect(Array.isArray(pms.body)).toBe(true)

    const billing = await agent.get('/api/dealer/billing-history')
    expect(Array.isArray(billing.body)).toBe(true)
  })

  it('DEAL-20: customer/admin wrong role gets 403', async () => {
    const fixtures = await seedFixtures()
    const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')
    const { agent: adminAgent } = await loginAs(app, fixtures.admin.email, 'admin')
    expect((await customerAgent.get('/api/dealer/dashboard')).status).toBe(403)
    expect((await adminAgent.get('/api/dealer/dashboard')).status).toBe(403)
  })

  it('DEAL-N07: double approve is idempotent and does not create duplicate rentals', async () => {
    const fixtures = await seedFixtures()
    const [br] = await db
      .insert(bookingRequests)
      .values({ customerId: fixtures.customer.id, vehicleId: fixtures.vehicles[0].id, status: 'pending' })
      .returning()
    const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    const first = await agent.patch(`/api/dealer/booking-requests/${br.id}/status`).send({ status: 'approved' })
    const second = await agent.patch(`/api/dealer/booking-requests/${br.id}/status`).send({ status: 'approved' })
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    const rows = await db.select().from(rentals)
    expect(rows.length).toBe(1)
  })

  it('DEAL-N10: dealer booking list excludes other dealer vehicles', async () => {
    const fixtures = await seedFixtures()
    await db.insert(bookingRequests).values({
      customerId: fixtures.customer.id,
      vehicleId: fixtures.dealer2Vehicle.id,
      status: 'pending',
    })
    const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    const list = await agent.get('/api/dealer/booking-requests')
    expect(list.body.items.length).toBe(0)
  })
})
