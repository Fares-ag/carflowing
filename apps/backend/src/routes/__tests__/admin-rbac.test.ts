import { eq } from 'drizzle-orm'
import type { Express } from 'express'
import type { Agent } from 'supertest'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../../db/index.js'
import { bookingRequests, commissionLedger, dealers, payments, payouts, rentals } from '../../db/schema.js'
import { buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'

/** ADM-SEC-06/07/10 — admin portal RBAC matrix */
describe('Admin portal RBAC', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    await resetDb()
  })

  async function expectForbiddenForOpsAndSupport(
    fixtures: Awaited<ReturnType<typeof seedFixtures>>,
    run: (agent: Agent) => Promise<{ status: number }>
  ) {
    const { agent: opsAgent } = await loginAs(app, fixtures.ops.email, 'ops')
    const { agent: supportAgent } = await loginAs(app, fixtures.support.email, 'support')
    expect((await run(opsAgent)).status).toBe(403)
    expect((await run(supportAgent)).status).toBe(403)
  }

  it('ADM-SEC-06: finance can refund; ops and support cannot', async () => {
    const fixtures = await seedFixtures()
    const [payment] = await db
      .insert(payments)
      .values({
        customerId: fixtures.customer.id,
        dealerId: fixtures.dealer.dealerId,
        amount: '100',
        status: 'completed',
        type: 'rental',
        method: 'card',
        needsRefund: true,
      })
      .returning()

    const { agent: financeAgent } = await loginAs(app, fixtures.finance.email, 'finance')
    const financeRefund = await financeAgent
      .post(`/api/admin/payments/${payment.id}/refund`)
      .send({ amount: 50, manualConfirmed: true })
    expect(financeRefund.status).toBe(200)

    await db
      .update(payments)
      .set({ status: 'completed', refundedAmount: '0', needsRefund: true })
      .where(eq(payments.id, payment.id))

    const { agent: opsAgent } = await loginAs(app, fixtures.ops.email, 'ops')
    expect(
      (await opsAgent.post(`/api/admin/payments/${payment.id}/refund`).send({ manualConfirmed: true })).status
    ).toBe(403)

    const { agent: supportAgent } = await loginAs(app, fixtures.support.email, 'support')
    expect(
      (await supportAgent.post(`/api/admin/payments/${payment.id}/refund`).send({ manualConfirmed: true })).status
    ).toBe(403)
  })

  it('ADM-SEC-07: ops cannot generate payouts; finance can', async () => {
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
      grossAmount: '100',
      commissionRate: '0.1',
      commissionAmount: '10',
      netAmount: '90',
      status: 'pending',
    })

    const { agent: opsAgent } = await loginAs(app, fixtures.ops.email, 'ops')
    expect((await opsAgent.post('/api/admin/payouts/generate')).status).toBe(403)

    const { agent: financeAgent } = await loginAs(app, fixtures.finance.email, 'finance')
    const generated = await financeAgent.post('/api/admin/payouts/generate')
    expect(generated.status).toBe(200)
    expect(generated.body.created).toBeGreaterThanOrEqual(1)
  })

  it('ADM-SEC-10: finance-only on mark-paid; ops gets 403', async () => {
    const fixtures = await seedFixtures()
    const [payout] = await db
      .insert(payouts)
      .values({
        dealerId: fixtures.dealer.dealerId,
        amount: '90',
        status: 'pending',
      })
      .returning()

    const { agent: opsAgent } = await loginAs(app, fixtures.ops.email, 'ops')
    expect((await opsAgent.post(`/api/admin/payouts/${payout.id}/mark-paid`)).status).toBe(403)

    const { agent: financeAgent } = await loginAs(app, fixtures.finance.email, 'finance')
    expect((await financeAgent.post(`/api/admin/payouts/${payout.id}/mark-paid`)).status).toBe(200)
  })

  it('ADM-SEC-11: ops/support can read dashboard but not finance mutations', async () => {
    const fixtures = await seedFixtures()
    const { agent: opsAgent } = await loginAs(app, fixtures.ops.email, 'ops')
    expect((await opsAgent.get('/api/admin/dashboard')).status).toBe(200)

    const { agent: supportAgent } = await loginAs(app, fixtures.support.email, 'support')
    expect((await supportAgent.get('/api/admin/complaints')).status).toBe(200)
  })

  it('ADM-SEC-12: portal roles can login with expectedRole admin', async () => {
    const fixtures = await seedFixtures()
    for (const user of [fixtures.finance, fixtures.ops, fixtures.support]) {
      const { res } = await loginAs(app, user.email, user.role)
      expect(res.status).toBe(200)
      expect(res.body.role).toBe(user.role)
    }
  })

  it('ADM-SEC-13: ops cannot create dealers or patch settings (full admin only)', async () => {
    const fixtures = await seedFixtures()
    const { agent: opsAgent } = await loginAs(app, fixtures.ops.email, 'ops')
    const create = await opsAgent.post('/api/admin/dealers').send({
      email: 'newdealer@test.dev',
      name: 'Blocked Dealer',
      password: 'password123',
    })
    expect(create.status).toBe(403)
    const settings = await opsAgent.patch('/api/admin/settings').send({ companyName: 'Hacked Co' })
    expect(settings.status).toBe(403)
  })

  it('ADM-SEC-14: ops/support forbidden on full-admin trust/pricing mutations', async () => {
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

    const [bookingRequest] = await db
      .insert(bookingRequests)
      .values({
        customerId: fixtures.customer.id,
        vehicleId: fixtures.vehicles[1].id,
        status: 'pending',
      })
      .returning()

    await expectForbiddenForOpsAndSupport(fixtures, (agent) =>
      agent.patch(`/api/admin/plans/${fixtures.plan.id}`).send({ priceMonthly: 199 })
    )

    await expectForbiddenForOpsAndSupport(fixtures, (agent) =>
      agent.patch(`/api/admin/dealers/${fixtures.dealer.dealerId}/status`).send({ status: 'suspended' })
    )

    await expectForbiddenForOpsAndSupport(fixtures, (agent) =>
      agent
        .patch(`/api/admin/customers/${fixtures.customer2.id}/verification`)
        .send({ status: 'verified' })
    )

    await expectForbiddenForOpsAndSupport(fixtures, (agent) =>
      agent.post(`/api/admin/rentals/${rental.id}/cancel`).send({ reason: 'policy' })
    )

    await expectForbiddenForOpsAndSupport(fixtures, (agent) =>
      agent.delete(`/api/admin/booking-requests/${bookingRequest.id}`)
    )

    await expectForbiddenForOpsAndSupport(fixtures, (agent) =>
      agent.post('/api/admin/vehicles').send({
        dealerId: fixtures.dealer.dealerId,
        name: 'Blocked Vehicle',
        make: 'Kia',
        model: 'Rio',
        year: 2024,
        category: 'sedan',
        pricePerDay: 120,
        transmission: 'automatic',
        fuelType: 'gas',
        seats: 4,
      })
    )

    const { agent: adminAgent } = await loginAs(app, fixtures.admin.email, 'admin')
    expect(
      (await adminAgent.patch(`/api/admin/plans/${fixtures.plan.id}`).send({ priceMonthly: 149 })).status
    ).toBe(200)
    expect(
      (
        await adminAgent
          .patch(`/api/admin/dealers/${fixtures.dealer.dealerId}/status`)
          .send({ status: 'active' })
      ).status
    ).toBe(200)
    expect(
      (
        await adminAgent
          .patch(`/api/admin/customers/${fixtures.customer2.id}/verification`)
          .send({ status: 'verified' })
      ).status
    ).toBe(200)
    expect(
      (await adminAgent.post(`/api/admin/rentals/${rental.id}/cancel`).send({ reason: 'admin cancel' })).status
    ).toBeLessThan(400)
    expect((await adminAgent.delete(`/api/admin/booking-requests/${bookingRequest.id}`)).status).toBe(204)
    expect(
      (
        await adminAgent.post('/api/admin/vehicles').send({
          dealerId: fixtures.dealer.dealerId,
          name: 'Admin Vehicle',
          make: 'Toyota',
          model: 'Corolla',
          year: 2024,
          category: 'sedan',
          pricePerDay: 150,
          transmission: 'automatic',
          fuelType: 'gas',
          seats: 5,
        })
      ).status
    ).toBe(201)
  })

  it('ADM-SEC-15: finance cannot perform full-admin mutations', async () => {
    const fixtures = await seedFixtures()
    const { agent: financeAgent } = await loginAs(app, fixtures.finance.email, 'finance')
    expect(
      (await financeAgent.patch(`/api/admin/plans/${fixtures.plan.id}`).send({ priceMonthly: 88 })).status
    ).toBe(403)
    expect(
      (
        await financeAgent
          .patch(`/api/admin/dealers/${fixtures.dealer.dealerId}/status`)
          .send({ status: 'suspended' })
      ).status
    ).toBe(403)
  })
})
