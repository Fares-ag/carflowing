import { eq } from 'drizzle-orm'
import type { Express } from 'express'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../../db/index.js'
import {
  appSettings,
  auditLogs,
  bookingRequests,
  commissionLedger,
  complaintReplies,
  complaints,
  dealers,
  maintenanceRecords,
  payments,
  profiles,
  rentals,
  subscriptions,
  vehicles,
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

  it('ADM-12b: customer verification approve/reject records audit with reason', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')

    const approve = await agent
      .patch(`/api/admin/customers/${fixtures.customer.id}/verification`)
      .send({ status: 'verified', decision: 'approve', reason: 'Documents match profile' })
    expect(approve.status).toBe(200)

    const approveLogs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, fixtures.customer.id))
    const approveEntry = approveLogs.find((l) => l.action === 'customer.verification.approve')
    expect(approveEntry).toBeTruthy()
    expect(approveEntry?.actorId).toBe(fixtures.admin.id)
    expect(approveEntry?.note).toBe('Documents match profile')
    expect(approveEntry?.after).toMatchObject({
      status: 'verified',
      decision: 'approve',
      reason: 'Documents match profile',
    })

    const reject = await agent
      .patch(`/api/admin/customers/${fixtures.customer.id}/verification`)
      .send({ status: 'unverified', decision: 'reject', reason: 'Expired license' })
    expect(reject.status).toBe(200)

    const rejectEntry = (
      await db.select().from(auditLogs).where(eq(auditLogs.entityId, fixtures.customer.id))
    ).find((l) => l.action === 'customer.verification.reject')
    expect(rejectEntry).toBeTruthy()
    expect(rejectEntry?.after).toMatchObject({
      status: 'unverified',
      decision: 'reject',
      reason: 'Expired license',
    })
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

    // The payment gate holds even for admin overrides (re-audit RA-08).
    const gated = await agent.patch(`/api/admin/rentals/${rental.id}/status`).send({ status: 'active' })
    expect(gated.status).toBe(409)
    await db.update(rentals).set({ paymentStatus: 'completed' }).where(eq(rentals.id, rental.id))
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
      supportEmail: 'ops@carflow.qa',
    })
    expect(patched.body.companyName).toBe('CarFlow QA')
    expect(patched.body.supportEmail).toBe('ops@carflow.qa')

    const [row] = await db.select().from(appSettings).where(eq(appSettings.id, patched.body.id)).limit(1)
    expect(row?.companyName).toBe('CarFlow QA')
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

  it('ADM-N20: unknown settings fields are ignored', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')
    const res = await agent.patch('/api/admin/settings').send({ defaultTaxRate: -1 })
    expect(res.status).toBe(200)
    expect(res.body.defaultTaxRate).toBeUndefined()
  })

  it('ADM-API-12: missing customer returns 404 not null', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')
    const res = await agent.get('/api/admin/customers/00000000-0000-0000-0000-000000000099')
    expect(res.status).toBe(404)
  })

  it('ADM-API-19: payments summary uses aggregated totals', async () => {
    const fixtures = await seedFixtures()
    await db.insert(payments).values([
      {
        customerId: fixtures.customer.id,
        dealerId: fixtures.dealer.dealerId,
        amount: '200',
        status: 'completed',
        type: 'rental',
        method: 'card',
      },
      {
        customerId: fixtures.customer.id,
        dealerId: fixtures.dealer.dealerId,
        amount: '50',
        status: 'pending',
        type: 'rental',
        method: 'card',
      },
    ])
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')
    const summary = await agent.get('/api/admin/payments/summary')
    expect(summary.status).toBe(200)
    expect(summary.body.grossRevenue).toBe(200)
    expect(summary.body.pendingCount).toBe(1)
    expect(summary.body.completedCount).toBe(1)
  })

  it('ADM-API-22: delete plan blocked when active subscriptions exist', async () => {
    const fixtures = await seedFixtures()
    await db.insert(subscriptions).values({
      ownerId: fixtures.dealer.id,
      ownerType: 'dealer',
      planId: fixtures.plan.id,
      status: 'active',
    })
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')
    const res = await agent.delete(`/api/admin/plans/${fixtures.plan.id}`)
    expect(res.status).toBe(409)
  })

  it('ADM-API-25: complaint reply thread list/create', async () => {
    const fixtures = await seedFixtures()
    const [c] = await db
      .insert(complaints)
      .values({
        customerId: fixtures.customer.id,
        category: 'service',
        subject: 'Late pickup',
        description: 'Vehicle was not ready',
      })
      .returning()
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')
    const empty = await agent.get(`/api/admin/complaints/${c.id}/replies`)
    expect(empty.body).toEqual([])

    const created = await agent.post(`/api/admin/complaints/${c.id}/replies`).send({
      body: 'We are investigating your complaint.',
    })
    expect(created.status).toBe(201)
    expect(created.body.body).toContain('investigating')

    const listed = await agent.get(`/api/admin/complaints/${c.id}/replies`)
    expect(listed.body).toHaveLength(1)

    const rows = await db.select().from(complaintReplies).where(eq(complaintReplies.complaintId, c.id))
    expect(rows).toHaveLength(1)
  })

  it('ADM-API-34: audit-logs pagination and entity filters', async () => {
    const fixtures = await seedFixtures()
    await loginAs(app, fixtures.admin.email, 'admin')
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')
    await agent.patch(`/api/admin/customers/${fixtures.customer.id}/status`).send({ status: 'suspended' })

    const all = await agent.get('/api/admin/audit-logs')
    expect(all.status).toBe(200)
    expect(all.body.items.length).toBeGreaterThan(0)

    const filtered = await agent.get('/api/admin/audit-logs').query({
      entityType: 'profile',
      entityId: fixtures.customer.id,
    })
    expect(filtered.body.items.every((i: { entityType: string }) => i.entityType === 'profile')).toBe(true)
  })

  it('ADM-API-35: settings patch writes audit row', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')
    await agent.patch('/api/admin/settings').send({ companyName: 'Audited Co' })
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.action, 'settings.update'))
    expect(logs.length).toBeGreaterThan(0)
  })

  it('ADM-API-36: maintenance complete marks record and releases vehicle', async () => {
    const fixtures = await seedFixtures()
    await db.update(vehicles).set({ status: 'maintenance' }).where(eq(vehicles.id, fixtures.vehicles[0].id))
    const [record] = await db
      .insert(maintenanceRecords)
      .values({
        vehicleId: fixtures.vehicles[0].id,
        dealerId: fixtures.dealer.dealerId,
        title: 'Oil change',
        status: 'open',
        description: 'Scheduled service',
      })
      .returning()
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')
    const res = await agent.patch(`/api/admin/maintenance/${record.id}/complete`)
    expect(res.status).toBe(200)
    const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, fixtures.vehicles[0].id))
    expect(vehicle.status).toBe('available')
  })

  it('ADM-API-37..38: payouts list/generate/mark-paid', async () => {
    const fixtures = await seedFixtures()
    await db
      .update(dealers)
      .set({
        bankAccountName: 'Premium Cars QA',
        bankName: 'QNB',
        bankIban: 'QA58QNBA000000000000000000001',
        bankDetailsVerifiedAt: new Date(),
      })
      .where(eq(dealers.id, fixtures.dealer.dealerId))
    await db.insert(commissionLedger).values({
      dealerId: fixtures.dealer.dealerId,
      grossAmount: '200',
      commissionRate: '0.1',
      commissionAmount: '20',
      netAmount: '180',
      status: 'pending',
    })
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')
    const generated = await agent.post('/api/admin/payouts/generate')
    expect(generated.body.created).toBe(1)

    const batched = await db
      .select()
      .from(commissionLedger)
      .where(eq(commissionLedger.status, 'batched'))
    expect(batched).toHaveLength(1)
    expect(batched[0].payoutId).toBeTruthy()

    const list = await agent.get('/api/admin/payouts')
    expect(list.body.items.length).toBe(1)

    const paid = await agent.post(`/api/admin/payouts/${list.body.items[0].id}/mark-paid`)
    expect(paid.status).toBe(200)
  })

  it('ADM-API-39: payout generate skips dealer without verified bank', async () => {
    const fixtures = await seedFixtures()
    await db.insert(commissionLedger).values({
      dealerId: fixtures.dealer.dealerId,
      grossAmount: '100',
      commissionRate: '0.1',
      commissionAmount: '10',
      netAmount: '90',
      status: 'pending',
    })
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')
    const generated = await agent.post('/api/admin/payouts/generate')
    expect(generated.status).toBe(200)
    expect(generated.body.created).toBe(0)
  })

  it('ADM-API-16: rentals/:id/full includes events/invoices/payments', async () => {
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
    await db.insert(payments).values({
      rentalId: rental.id,
      customerId: fixtures.customer.id,
      dealerId: fixtures.dealer.dealerId,
      amount: '300',
      status: 'completed',
      type: 'rental',
      method: 'card',
    })
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')
    const full = await agent.get(`/api/admin/rentals/${rental.id}/full`)
    expect(full.status).toBe(200)
    expect(full.body.id).toBe(rental.id)
    expect(Array.isArray(full.body.payments)).toBe(true)
    expect(full.body.payments.length).toBe(1)
  })

  it('ADM-API-03: dashboard KPI values are numeric (no NaN crash)', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')
    const dash = await agent.get('/api/admin/dashboard')
    expect(dash.status).toBe(200)
    for (const kpi of dash.body.kpis) {
      expect(Number.isFinite(kpi.value)).toBe(true)
    }
  })

  it('ADM-DISPUTE-01: finance can create, list, and patch payment disputes', async () => {
    const fixtures = await seedFixtures()
    const [payment] = await db
      .insert(payments)
      .values({
        customerId: fixtures.customer.id,
        dealerId: fixtures.dealer.dealerId,
        amount: '250',
        status: 'completed',
        type: 'rental',
        method: 'card',
      })
      .returning()
    const { agent: financeAgent } = await loginAs(app, fixtures.finance.email, 'finance')
    const created = await financeAgent
      .post('/api/admin/disputes')
      .send({ paymentId: payment.id, reason: 'chargeback' })
    expect(created.status).toBe(201)

    const list = await financeAgent.get('/api/admin/disputes')
    expect(list.status).toBe(200)
    expect(list.body.items.some((d: { paymentId: string }) => d.paymentId === payment.id)).toBe(true)

    const patched = await financeAgent
      .patch(`/api/admin/disputes/${created.body.id}`)
      .send({ status: 'investigating' })
    expect(patched.status).toBe(200)
    expect(patched.body.status).toBe('investigating')

    const { agent: opsAgent } = await loginAs(app, fixtures.ops.email, 'ops')
    const forbidden = await opsAgent
      .post('/api/admin/disputes')
      .send({ paymentId: payment.id, reason: 'nope' })
    expect(forbidden.status).toBe(403)
  })

  it('ADM-MSG-01: support cannot mutate dealer-customer private messages', async () => {
    const fixtures = await seedFixtures()
    const { messages } = await import('../../db/schema.js')
    const [privateMsg] = await db
      .insert(messages)
      .values({
        fromUserId: fixtures.customer.id,
        toUserId: fixtures.dealer.id,
        subject: 'private',
        body: 'hello dealer',
      })
      .returning()
    const { agent } = await loginAs(app, fixtures.support.email, 'support')
    const blocked = await agent.patch(`/api/admin/messages/${privateMsg.id}/read`).send({ read: true })
    expect(blocked.status).toBe(404)

    const [deskMsg] = await db
      .insert(messages)
      .values({
        fromUserId: fixtures.support.id,
        toUserId: fixtures.customer.id,
        subject: 'desk',
        body: 'hello customer',
      })
      .returning()
    const allowed = await agent.patch(`/api/admin/messages/${deskMsg.id}/read`).send({ read: true })
    expect(allowed.status).toBe(200)
    expect(allowed.body.read).toBe(true)
  })
})
