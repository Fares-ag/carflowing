import { eq, sql } from 'drizzle-orm'
import type { Express } from 'express'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../../db/index.js'
import { auditLogs, bookingRequests, dealerInvoices, dealerPlans, dealerSubscriptions, invoices, maintenanceRecords, notifications, rentalExtensions, rentals, vehicles } from '../../db/schema.js'
import { buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'
import { checkDealerVehicleQuota, getDealerVehicleQuota } from '../../services/dealerBilling.js'
import { extendRentalTerm } from '../../services/rentalExtension.js'

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

  it('DEAL-11: offline payment settles the due invoice and updates rental paymentStatus', async () => {
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
        monthlyAmount: '450',
        termMonths: 1,
        paymentStatus: 'pending',
      })
      .returning()
    // Approval normally creates the first invoice; seed it here.
    await db.insert(invoices).values({
      ownerId: fixtures.customer.id,
      ownerType: 'customer',
      amount: '450',
      status: 'due',
      date: today,
      dueDate: today,
      periodStart: today,
      rentalId: rental.id,
      description: 'First month',
    })

    const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    // Amount/customer are now server-derived from the invoice (BUG-13 fix).
    const pay = await agent.post('/api/dealer/payments/offline').send({
      rentalId: rental.id,
      method: 'bank',
    })
    expect(pay.status).toBe(201)
    expect(Number(pay.body.amount)).toBe(450)
    expect(pay.body.customerId).toBe(fixtures.customer.id)

    const [updated] = await db.select().from(rentals).where(eq(rentals.id, rental.id))
    expect(updated.paymentStatus).toBe('completed')
    // Payment no longer auto-activates; activation happens at handover.
    expect(updated.status).toBe('reserved')
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

  it('DEAL-21: dealer can extend own rental; other dealer blocked; concurrent extend is atomic', async () => {
    const fixtures = await seedFixtures()
    const [rental] = await db
      .insert(rentals)
      .values({
        customerId: fixtures.customer.id,
        dealerId: fixtures.dealer.dealerId,
        vehicleId: fixtures.vehicles[0].id,
        startDate: '2026-01-01',
        endDate: '2026-04-01',
        status: 'active',
        totalAmount: '9000',
        monthlyAmount: '3000',
        termMonths: 3,
      })
      .returning()

    const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    const extended = await dealerAgent.post(`/api/dealer/rentals/${rental.id}/extend`).send({ months: 2 })
    expect(extended.status).toBe(200)
    expect(extended.body.termMonths).toBe(5)
    expect(extended.body.endDate).toBe('2026-06-01')
    expect(Number(extended.body.totalAmount)).toBe(15000)

    const audit = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, rental.id))
    const extendAudit = audit.find((row) => row.action === 'rental.extend' && row.actorRole === 'dealer')
    expect(extendAudit).toBeTruthy()
    expect(extendAudit?.after).toMatchObject({ months: 2, newTermMonths: 5, addedAmount: 6000 })

    const { agent: dealer2Agent } = await loginAs(app, fixtures.dealer2.email, 'dealer')
    const blocked = await dealer2Agent.post(`/api/dealer/rentals/${rental.id}/extend`).send({ months: 1 })
    expect(blocked.status).toBe(404)

    const [freshRental] = await db
      .insert(rentals)
      .values({
        customerId: fixtures.customer.id,
        dealerId: fixtures.dealer.dealerId,
        vehicleId: fixtures.vehicles[1].id,
        startDate: '2026-02-01',
        endDate: '2026-05-01',
        status: 'active',
        totalAmount: '9000',
        monthlyAmount: '3000',
        termMonths: 3,
      })
      .returning()

    const [first, second] = await Promise.all([
      extendRentalTerm({
        rentalId: freshRental.id,
        scope: { dealerId: fixtures.dealer.dealerId },
        actor: { id: fixtures.dealer.id, role: 'dealer' },
        months: 2,
      }),
      extendRentalTerm({
        rentalId: freshRental.id,
        scope: { dealerId: fixtures.dealer.dealerId },
        actor: { id: fixtures.dealer.id, role: 'dealer' },
        months: 2,
      }),
    ])
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)

    const [updated] = await db.select().from(rentals).where(eq(rentals.id, freshRental.id))
    expect(Number(updated.totalAmount)).toBe(21000)
    expect(updated.termMonths).toBe(7)

    const extensions = await db
      .select()
      .from(rentalExtensions)
      .where(eq(rentalExtensions.rentalId, freshRental.id))
    expect(extensions).toHaveLength(2)
  })

  it('DEAL-22: dealer can acknowledge delivery scheduled/delivered on own rental', async () => {
    const fixtures = await seedFixtures()
    const [rental] = await db
      .insert(rentals)
      .values({
        customerId: fixtures.customer.id,
        dealerId: fixtures.dealer.dealerId,
        vehicleId: fixtures.vehicles[0].id,
        startDate: '2026-01-01',
        endDate: '2026-04-01',
        status: 'reserved',
        totalAmount: '9000',
        monthlyAmount: '3000',
        termMonths: 3,
        pickupLocation: 'West Bay',
        pickupDate: '2026-01-05',
        pickupTime: '09:00–12:00',
      })
      .returning()

    const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    const scheduled = await agent
      .post(`/api/dealer/rentals/${rental.id}/pickup-fulfilment`)
      .send({ status: 'scheduled' })
    expect(scheduled.status).toBe(200)
    expect(scheduled.body.pickupFulfilmentStatus).toBe('scheduled')

    const delivered = await agent
      .post(`/api/dealer/rentals/${rental.id}/pickup-fulfilment`)
      .send({ status: 'delivered' })
    expect(delivered.status).toBe(200)
    expect(delivered.body.pickupFulfilmentStatus).toBe('delivered')

    const { agent: dealer2Agent } = await loginAs(app, fixtures.dealer2.email, 'dealer')
    const blocked = await dealer2Agent
      .post(`/api/dealer/rentals/${rental.id}/pickup-fulfilment`)
      .send({ status: 'scheduled' })
    expect(blocked.status).toBe(404)
  })

  it('DEAL-23: dealer can accept, schedule, and complete customer maintenance requests', async () => {
    const fixtures = await seedFixtures()
    const [rental] = await db
      .insert(rentals)
      .values({
        customerId: fixtures.customer.id,
        dealerId: fixtures.dealer.dealerId,
        vehicleId: fixtures.vehicles[0].id,
        startDate: '2026-01-01',
        endDate: '2026-04-01',
        status: 'active',
        totalAmount: '9000',
        monthlyAmount: '3000',
        termMonths: 3,
      })
      .returning()

    const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')
    const created = await customerAgent
      .post(`/api/customer/rentals/${rental.id}/maintenance-requests`)
      .send({ description: 'Engine warning light' })
    expect(created.status).toBe(201)

    const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    const list = await agent.get('/api/dealer/maintenance')
    expect(list.status).toBe(200)
    expect(list.body.items.some((item: { id: string }) => item.id === created.body.id)).toBe(true)

    const scheduled = await agent
      .patch(`/api/dealer/maintenance/${created.body.id}/schedule`)
      .send({ scheduledAt: '2026-02-15' })
    expect(scheduled.status).toBe(200)
    expect(scheduled.body.status).toBe('scheduled')

    const completed = await agent.patch(`/api/dealer/maintenance/${created.body.id}/complete`)
    expect(completed.status).toBe(200)

    const [record] = await db
      .select()
      .from(maintenanceRecords)
      .where(eq(maintenanceRecords.id, created.body.id))
    expect(record.status).toBe('completed')
    expect(record.completedAt).toBeTruthy()

    const customerNotifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, fixtures.customer.id))
    expect(customerNotifs.some((n) => n.title === 'Service completed')).toBe(true)

    const customerList = await customerAgent.get(`/api/customer/rentals/${rental.id}/maintenance-requests`)
    expect(customerList.body.items[0].status).toBe('completed')

    const acceptFlow = await customerAgent
      .post(`/api/customer/rentals/${rental.id}/maintenance-requests`)
      .send({ description: 'AC not cooling' })
    const accepted = await agent.patch(`/api/dealer/maintenance/${acceptFlow.body.id}/accept`)
    expect(accepted.status).toBe(200)
    expect(accepted.body.status).toBe('open')

    const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, fixtures.vehicles[0].id))
    expect(vehicle.status).toBe('maintenance')
  })
})

/**
 * dealer_plans is not referenced by anything resetDb() truncates, so plan rows
 * survive between tests: upsert by code instead of inserting blindly.
 */
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

/** ID: DEAL-B01..DEAL-B04 — dealer subscription billing */
describe('Dealer billing API', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    await resetDb()
  })

  it('DEAL-B01: moving onto a paid tier is never free — it raises an open invoice', async () => {
    const fixtures = await seedFixtures()
    await seedDealerPlans()
    const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')

    const list = await agent.get('/api/dealer/billing/plans')
    expect(list.status).toBe(200)
    expect(list.body.map((p: { code: string }) => p.code)).toEqual(['free', 'starter', 'professional'])

    const change = await agent.patch('/api/dealer/subscription/plan').send({ planCode: 'professional' })
    expect(change.status).toBe(200)
    expect(change.body.change).toBe('subscribed')
    expect(change.body.subscription.status).toBe('active')
    expect(change.body.subscription.planCode).toBe('professional')
    // The defect being fixed: the dealer used to land on QAR 299/mo unbilled.
    expect(change.body.invoice).not.toBeNull()
    expect(change.body.invoice.amount).toBe(299)
    expect(change.body.invoice.status).toBe('open')

    const invoiceRows = await db.select().from(dealerInvoices)
    expect(invoiceRows).toHaveLength(1)
    expect(Number(invoiceRows[0].amount)).toBe(299)
    expect(invoiceRows[0].dealerId).toBe(fixtures.dealer.dealerId)

    const history = await agent.get('/api/dealer/billing/invoices')
    expect(history.status).toBe(200)
    expect(history.body).toHaveLength(1)
    expect(history.body[0]).toMatchObject({ amount: 299, status: 'open' })
    expect(typeof history.body[0].dueDate).toBe('string')

    const current = await agent.get('/api/dealer/billing/subscription')
    expect(current.status).toBe(200)
    expect(current.body.plan.code).toBe('professional')
    expect(current.body.quota).toMatchObject({ limit: 25, used: 2, remaining: 23, enforced: true })
  })

  it('DEAL-B02: an unknown or inactive plan cannot be self-assigned', async () => {
    const fixtures = await seedFixtures()
    const plans = await seedDealerPlans()
    await db.update(dealerPlans).set({ active: false }).where(eq(dealerPlans.code, 'professional'))
    const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')

    const inactive = await agent
      .patch('/api/dealer/subscription/plan')
      .send({ planId: plans.professional.id })
    expect(inactive.status).toBe(404)

    const missing = await agent.patch('/api/dealer/subscription/plan').send({})
    expect(missing.status).toBe(400)

    expect(await db.select().from(dealerSubscriptions)).toHaveLength(0)
  })

  it('DEAL-B03: the vehicle cap is enforced server-side and rejects creation over the cap', async () => {
    const fixtures = await seedFixtures()
    await seedDealerPlans()
    const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')

    // Starter allows 10: the seeded fleet of 2 leaves headroom.
    await agent.patch('/api/dealer/subscription/plan').send({ planCode: 'starter' })
    const starterQuota = await checkDealerVehicleQuota(fixtures.dealer.dealerId)
    expect(starterQuota).toMatchObject({ limit: 10, used: 2, overLimit: false })

    // Free allows 1: the surplus listing is shelved, not deleted...
    const downgrade = await agent.patch('/api/dealer/subscription/plan').send({ planCode: 'free' })
    expect(downgrade.status).toBe(200)
    expect(downgrade.body.change).toBe('downgraded')
    expect(downgrade.body.invoice).toBeNull()
    expect(downgrade.body.deactivatedVehicles).toBe(1)
    const fleet = await db.select().from(vehicles).where(eq(vehicles.dealerId, fixtures.dealer.dealerId))
    expect(fleet).toHaveLength(2)
    expect(fleet.filter((v) => v.status === 'inactive')).toHaveLength(1)

    // ...and creating another vehicle is refused while the dealer is at the cap.
    const quota = await getDealerVehicleQuota(fixtures.dealer.dealerId)
    expect(quota).toMatchObject({ limit: 1, used: 1, remaining: 0 })
    await expect(checkDealerVehicleQuota(fixtures.dealer.dealerId)).rejects.toMatchObject({
      status: 402,
    })
  })

  it('DEAL-B04: dealers without a subscription keep unmetered listings', async () => {
    const fixtures = await seedFixtures()
    await seedDealerPlans()
    const quota = await checkDealerVehicleQuota(fixtures.dealer.dealerId)
    expect(quota).toMatchObject({ limit: null, remaining: null, enforced: false, used: 2 })

    const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    const current = await agent.get('/api/dealer/billing/subscription')
    expect(current.body.subscription).toBeNull()
    expect(current.body.quota.enforced).toBe(false)
  })
})
