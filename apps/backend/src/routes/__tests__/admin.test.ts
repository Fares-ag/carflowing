import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Express } from 'express'
import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  appSettings,
  bookingRequests,
  complaints,
  dealers,
  messages,
  payments,
  plans,
  profiles,
  rentals,
} from '../../db/schema.js'
import { buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'

/** ID: ADM-01..ADM-35 — admin route integration tests */
describe('Admin API', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    await resetDb()
  })

  it('ADM-01..ADM-03: dashboard, customer-stats, analytics', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')

    const dash = await agent.get('/api/admin/dashboard')
    expect(dash.status).toBe(200)
    expect(Array.isArray(dash.body.kpis)).toBe(true)
    expect(dash.body.kpis.some((k: { label: string }) => k.label === 'Total Vehicles')).toBe(true)

    const stats = await agent.get('/api/admin/customer-stats')
    expect(stats.body.total).toBeGreaterThanOrEqual(2)

    const analytics = await agent.get('/api/admin/analytics')
    expect(Array.isArray(analytics.body.kpis)).toBe(true)
  })

  it('ADM-04..ADM-07: vehicles list/create/delete/status', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')

    const list = await agent.get('/api/admin/vehicles')
    expect(list.body.items.length).toBeGreaterThan(0)

    const created = await agent.post('/api/admin/vehicles').send({
      dealerId: fixtures.dealer.dealerId,
      name: 'Admin Added',
      make: 'Kia',
      model: 'Sportage',
      year: 2024,
      category: 'suv',
      pricePerDay: 220,
      transmission: 'automatic',
      fuelType: 'gas',
      seats: 5,
    })
    expect(created.status).toBe(201)

    await agent.patch(`/api/admin/vehicles/${created.body.id}/status`).send({ status: 'inactive' })
    await agent.delete(`/api/admin/vehicles/${created.body.id}`)
  })

  it('ADM-08..ADM-12: customers list/with-stats/get/suspend/verification', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')

    const list = await agent.get('/api/admin/customers')
    expect(list.body.items.length).toBeGreaterThan(0)

    const withStats = await agent.get('/api/admin/customers/with-stats')
    expect(withStats.body.items[0]).toHaveProperty('customerStatus')

    const one = await agent.get(`/api/admin/customers/${fixtures.customer.id}`)
    expect(one.body.email).toBe(fixtures.customer.email)

    await agent.patch(`/api/admin/customers/${fixtures.customer.id}/status`).send({ status: 'suspended' })
    await agent.patch(`/api/admin/customers/${fixtures.customer.id}/verification`).send({ status: 'verified' })
  })

  it('ADM-13..ADM-15: rentals list/details/status', async () => {
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
        totalAmount: '300',
        paymentStatus: 'pending',
      })
      .returning()

    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')
    const list = await agent.get('/api/admin/rentals')
    expect(list.body.items.length).toBe(1)

    const details = await agent.get('/api/admin/rentals/details')
    expect(details.body.items[0].customer?.email).toBe(fixtures.customer.email)

    const patched = await agent.patch(`/api/admin/rentals/${rental.id}/status`).send({ status: 'active' })
    expect(patched.body.status).toBe('active')
  })

  it('ADM-16..ADM-18: dealers list/create/status/delete', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')

    const list = await agent.get('/api/admin/dealers')
    expect(list.body.items.length).toBeGreaterThan(0)

    const created = await agent.post('/api/admin/dealers').send({
      email: fixtures.customer2.email,
      name: 'Promoted Dealer',
      contactEmail: fixtures.customer2.email,
    })
    expect(created.status).toBe(201)
    expect(created.body.accountCreated).toBe(false)

    const brandNew = await agent.post('/api/admin/dealers').send({
      email: 'new-dealer-owner@carflow.dev',
      name: 'Brand New Motors',
      contactEmail: 'new-dealer-owner@carflow.dev',
    })
    expect(brandNew.status).toBe(201)
    expect(brandNew.body.accountCreated).toBe(true)
    expect(typeof brandNew.body.temporaryPassword).toBe('string')
    expect(brandNew.body.temporaryPassword.length).toBeGreaterThanOrEqual(6)
    const [owner] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.email, 'new-dealer-owner@carflow.dev'))
    expect(owner.role).toBe('dealer')

    await agent.patch(`/api/admin/dealers/${created.body.id}/status`).send({ status: 'suspended' })
    await agent.delete(`/api/admin/dealers/${created.body.id}`)
  })

  it('ADM-19..ADM-20: payments list/details', async () => {
    const fixtures = await seedFixtures()
    await db.insert(payments).values({
      customerId: fixtures.customer.id,
      dealerId: fixtures.dealer.dealerId,
      amount: '100',
      status: 'completed',
      type: 'rental',
      method: 'card',
    })
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')
    const list = await agent.get('/api/admin/payments')
    expect(list.body.items.length).toBe(1)
    const details = await agent.get('/api/admin/payments/details')
    expect(details.body.items[0].customer).toBeTruthy()
  })

  it('ADM-21..ADM-22: plans CRUD and plan-stats', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')

    const stats = await agent.get('/api/admin/plan-stats')
    expect(stats.body.totalPlans).toBeGreaterThan(0)

    const created = await agent.post('/api/admin/plans').send({
      name: 'Enterprise Plus',
      tier: 'enterprise',
      status: 'active',
      priceMonthly: 499,
      priceYearly: 4990,
      features: ['Unlimited'],
    })
    expect(created.status).toBe(201)

    await agent.patch(`/api/admin/plans/${created.body.id}`).send({ name: 'Enterprise Plus Updated' })
    const all = await agent.get('/api/admin/plans')
    expect(all.body.some((p: { id: string }) => p.id === created.body.id)).toBe(true)
    await agent.delete(`/api/admin/plans/${created.body.id}`)
  })

  it('ADM-23..ADM-24: complaints list/status', async () => {
    const fixtures = await seedFixtures()
    const [c] = await db
      .insert(complaints)
      .values({
        customerId: fixtures.customer.id,
        category: 'billing',
        subject: 'Overcharge',
        description: 'Charged twice',
      })
      .returning()
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')
    const list = await agent.get('/api/admin/complaints')
    expect(list.body.items.length).toBe(1)
    expect(list.body.items[0].customerName).toBe(fixtures.customer.name)
    expect(list.body.items[0].customerEmail).toBe(fixtures.customer.email)
    const patched = await agent.patch(`/api/admin/complaints/${c.id}/status`).send({ status: 'in_progress' })
    expect(patched.body.status).toBe('in_progress')
  })

  it('ADM-25..ADM-29: messages inbox/sent/compose/folder counts/read/folder', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')

    const counts = await agent.get('/api/admin/messages/folder-counts')
    expect(counts.body).toHaveProperty('inbox')

    const composed = await agent.post('/api/admin/messages').send({
      toUserId: fixtures.customer.id,
      subject: 'Hello',
      body: 'Welcome to CarFlow',
    })
    expect(composed.status).toBe(201)

    const inbox = await agent.get('/api/admin/messages').query({ folder: 'inbox' })
    expect(inbox.status).toBe(200)

    const activity = await agent.get('/api/admin/messages/activity')
    expect(Array.isArray(activity.body)).toBe(true)

    await agent.patch(`/api/admin/messages/${composed.body.id}/read`).send({ read: true })
    await agent.patch(`/api/admin/messages/${composed.body.id}/folder`).send({ folder: 'archived' })
  })

  it('ADM-30..ADM-33: booking requests list/get/delete/status override', async () => {
    const fixtures = await seedFixtures()
    const [br] = await db
      .insert(bookingRequests)
      .values({ customerId: fixtures.customer.id, vehicleId: fixtures.vehicles[0].id, status: 'pending' })
      .returning()

    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')
    const list = await agent.get('/api/admin/booking-requests')
    expect(list.body.items.length).toBe(1)

    const one = await agent.get(`/api/admin/booking-requests/${br.id}`)
    expect(one.body.id).toBe(br.id)

    await agent.patch(`/api/admin/booking-requests/${br.id}/status`).send({ status: 'approved' })
    await agent.delete(`/api/admin/booking-requests/${br.id}`)
  })

  it('ADM-34: platform settings get/patch', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')
    const settings = await agent.get('/api/admin/settings')
    expect(settings.status).toBe(200)

    const patched = await agent.patch('/api/admin/settings').send({
      companyName: 'CarFlow QA',
      defaultTaxRate: 0.07,
    })
    expect(patched.body.companyName).toBe('CarFlow QA')
    expect(patched.body.defaultTaxRate).toBe(0.07)

    const [row] = await db.select().from(appSettings).limit(1)
    expect(row.companyName).toBe('CarFlow QA')
  })

  it('ADM-35: non-admin gets 403', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    expect((await agent.get('/api/admin/dashboard')).status).toBe(403)
  })

  it('ADM-N04: deleting dealer demotes owner profile to customer when no dealers remain', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')
    await agent.delete(`/api/admin/dealers/${fixtures.dealer.dealerId}`)
    const [owner] = await db.select().from(profiles).where(eq(profiles.id, fixtures.dealer.id))
    expect(owner.role).toBe('customer')
    const remainingDealers = await db.select().from(dealers)
    expect(remainingDealers.some((d) => d.id === fixtures.dealer.dealerId)).toBe(false)
  })

  it('ADM-N20: invalid tax rate is rejected with 400', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')
    const res = await agent.patch('/api/admin/settings').send({ defaultTaxRate: -1 })
    expect(res.status).toBe(400)
  })
})
