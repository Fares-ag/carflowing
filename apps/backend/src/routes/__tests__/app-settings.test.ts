import { eq } from 'drizzle-orm'
import type { Express } from 'express'
import request from 'supertest'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../../db/index.js'
import {
  appSettings,
  commissionLedger,
  invoices,
  payments,
  payouts,
  profiles,
  rentals,
} from '../../db/schema.js'
import { settleInvoice } from '../../services/billing.js'
import { bootstrapFirstAdmin, BootstrapAdminError } from '../../services/bootstrapAdmin.js'
import { buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'

describe('App settings — knobs, kill switches, bootstrap, reversals', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    await resetDb()
  })

  it('CFG-01: commission rate from admin settings affects new commission entries', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')

    await agent.patch('/api/admin/settings/business').send({ platformCommissionRate: 0.25 })
    const [settingsRow] = await db.select().from(appSettings).limit(1)
    expect(Number(settingsRow?.platformCommissionRate)).toBe(0.25)

    const invoiceAmount = 1000
    const today = new Date().toISOString().slice(0, 10)
    const [rental] = await db
      .insert(rentals)
      .values({
        customerId: fixtures.customer.id,
        dealerId: fixtures.dealer.dealerId,
        vehicleId: fixtures.vehicles[0].id,
        startDate: today,
        endDate: today,
        status: 'active',
        totalAmount: String(invoiceAmount),
        monthlyAmount: String(invoiceAmount),
        paymentStatus: 'pending',
      })
      .returning()
    const [invoice] = await db
      .insert(invoices)
      .values({
        rentalId: rental.id,
        ownerType: 'customer',
        ownerId: fixtures.customer.id,
        amount: String(invoiceAmount),
        subtotal: String(invoiceAmount),
        description: 'Monthly subscription',
        status: 'due',
        periodStart: '2026-01-01',
        periodEnd: '2026-02-01',
        dueDate: '2026-01-01',
      })
      .returning()
    const [payment] = await db
      .insert(payments)
      .values({
        customerId: fixtures.customer.id,
        dealerId: fixtures.dealer.dealerId,
        invoiceId: invoice.id,
        amount: String(invoiceAmount),
        status: 'completed',
        type: 'subscription',
        method: 'card',
      })
      .returning()

    await db.transaction(async (tx) => {
      await settleInvoice(tx, { invoiceId: invoice.id, paymentId: payment.id })
    })

    const [commission] = await db
      .select()
      .from(commissionLedger)
      .where(eq(commissionLedger.paymentId, payment.id))
      .limit(1)
    expect(Number(commission?.commissionRate)).toBe(0.25)
    expect(Number(commission?.commissionAmount)).toBe(250)
  })

  it('CFG-02: online payments kill switch blocks create-intent', async () => {
    const fixtures = await seedFixtures()
    const { agent: adminAgent } = await loginAs(app, fixtures.admin.email, 'admin')
    await adminAgent.patch('/api/admin/settings/flags').send({ onlinePaymentsEnabled: false })

    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const res = await agent.post('/api/payments/skipcash/create-intent').send({
      vehicleId: fixtures.vehicles[0].id,
      contact: { phone: '+97450000000', email: fixtures.customer.email },
    })
    expect(res.status).toBe(503)
    expect(res.body.error).toMatch(/online payments/i)
    expect(res.body.unavailable).toBe(true)
  })

  it('CFG-07: feature flags are audited and block checkout/signups independently', async () => {
    const fixtures = await seedFixtures()
    const { agent: adminAgent } = await loginAs(app, fixtures.admin.email, 'admin')

    const flags = await adminAgent.get('/api/admin/settings/flags')
    expect(flags.status).toBe(200)
    expect(flags.body.checkoutEnabled).toBe(true)

    await adminAgent.patch('/api/admin/settings/flags').send({ checkoutEnabled: false })
    const { invalidateAppSettingsCache } = await import('../../services/appSettings.js')
    invalidateAppSettingsCache()

    const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')
    const booking = await customerAgent.post('/api/customer/booking-requests').send({
      vehicleId: fixtures.vehicles[0].id,
    })
    expect(booking.status).toBe(503)
    expect(booking.body.unavailable).toBe(true)

    await adminAgent.patch('/api/admin/settings/flags').send({
      checkoutEnabled: true,
      signupsEnabled: false,
      dealerSignupsEnabled: false,
    })
    invalidateAppSettingsCache()

    const customerSignup = await request(app).post('/api/auth/signup').send({
      email: 'new@test.dev',
      password: 'password123',
      name: 'New User',
    })
    expect(customerSignup.status).toBe(503)

    const dealerSignup = await request(app).post('/api/auth/signup').send({
      email: 'dealer-new@test.dev',
      password: 'password123',
      name: 'Dealer Owner',
      expectedRole: 'dealer',
      meta: { businessName: 'Test Motors' },
    })
    expect(dealerSignup.status).toBe(503)

    const audit = await adminAgent.get('/api/admin/audit-logs').query({ page: 1, pageSize: 20 })
    expect(
      audit.body.items.some((row: { action: string }) => row.action === 'settings.flags.update')
    ).toBe(true)
  })

  it('CFG-03: bootstrap creates exactly one admin and refuses on re-run', async () => {
    await resetDb()
    const first = await bootstrapFirstAdmin({
      email: 'ops@carflow.dev',
      name: 'Ops Admin',
      password: 'password123',
    })
    expect(first.email).toBe('ops@carflow.dev')

    const admins = await db.select().from(profiles).where(eq(profiles.role, 'admin'))
    expect(admins).toHaveLength(1)

    await expect(
      bootstrapFirstAdmin({
        email: 'other@carflow.dev',
        name: 'Other Admin',
        password: 'password123',
      })
    ).rejects.toBeInstanceOf(BootstrapAdminError)
  })

  it('CFG-04: finance can unmark a paid payout and void an invoice', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.finance.email, 'finance')

    const [payout] = await db
      .insert(payouts)
      .values({
        dealerId: fixtures.dealer.dealerId,
        amount: '100',
        status: 'paid',
        paidAt: new Date(),
      })
      .returning()

    expect((await agent.post(`/api/admin/payouts/${payout.id}/unmark-paid`)).status).toBe(200)
    const [payoutAfter] = await db.select().from(payouts).where(eq(payouts.id, payout.id)).limit(1)
    expect(payoutAfter?.status).toBe('pending')
    expect(payoutAfter?.paidAt).toBeNull()

    const [invoice] = await db
      .insert(invoices)
      .values({
        ownerType: 'customer',
        ownerId: fixtures.customer.id,
        amount: '500',
        subtotal: '500',
        description: 'Test invoice',
        status: 'due',
        dueDate: '2026-01-01',
      })
      .returning()

    expect((await agent.post(`/api/admin/invoices/${invoice.id}/void`)).status).toBe(200)
    const [invoiceAfter] = await db.select().from(invoices).where(eq(invoices.id, invoice.id)).limit(1)
    expect(invoiceAfter?.status).toBe('void')
  })

  it('CFG-05: business settings fall back to env until admin override', async () => {
    const fixtures = await seedFixtures()
    const prev = process.env.PLATFORM_COMMISSION_RATE
    process.env.PLATFORM_COMMISSION_RATE = '0.18'

    const { getPlatformCommissionRate, invalidateAppSettingsCache } = await import(
      '../../services/appSettings.js'
    )
    invalidateAppSettingsCache()
    expect(await getPlatformCommissionRate()).toBe(0.18)

    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')
    await agent.patch('/api/admin/settings/business').send({ platformCommissionRate: 0.22 })
    invalidateAppSettingsCache()
    expect(await getPlatformCommissionRate()).toBe(0.22)

    process.env.PLATFORM_COMMISSION_RATE = prev
    invalidateAppSettingsCache()
  })

  it('CFG-06: invalid business settings ranges are rejected and changes are audited', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')

    const bad = await agent.patch('/api/admin/settings/business').send({ platformCommissionRate: 1.5 })
    expect(bad.status).toBe(400)

    const ok = await agent.patch('/api/admin/settings/business').send({
      billingGraceDays: 5,
      subscriptionDepositAmount: 500,
    })
    expect(ok.status).toBe(200)
    expect(ok.body.billingGraceDays).toBe(5)
    expect(ok.body.subscriptionDepositAmount).toBe(500)

    const audit = await agent.get('/api/admin/audit-logs').query({ page: 1, pageSize: 20 })
    expect(audit.body.items.some((row: { action: string }) => row.action === 'settings.business.update')).toBe(
      true
    )
  })
})
