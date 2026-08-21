import type { Express } from 'express'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../../db/index.js'
import { favorites, payments, rentals } from '../../db/schema.js'
import {
  aggregateCustomerProfileStats,
  buildCustomerDashboardResponse,
  buildDealerAnalyticsResponse,
} from '../../services/dashboardStats.js'
import { buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'

describe('Dashboard aggregate endpoints', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    await resetDb()
  })

  it('returns byte-compatible KPI responses on a seeded dataset', async () => {
    const fixtures = await seedFixtures()
    const today = new Date().toISOString().slice(0, 10)
    const end = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)

    await db.insert(rentals).values([
      {
        customerId: fixtures.customer.id,
        dealerId: fixtures.dealer.dealerId,
        vehicleId: fixtures.vehicles[0].id,
        startDate: today,
        endDate: end,
        status: 'active',
        totalAmount: '4500',
        monthlyAmount: '4500',
        termMonths: 1,
        paymentStatus: 'completed',
      },
      {
        customerId: fixtures.customer2.id,
        dealerId: fixtures.dealer.dealerId,
        vehicleId: fixtures.vehicles[1].id,
        startDate: today,
        endDate: end,
        status: 'reserved',
        totalAmount: '3000',
        monthlyAmount: '3000',
        termMonths: 1,
        paymentStatus: 'pending',
      },
      {
        customerId: fixtures.customer.id,
        dealerId: fixtures.dealer.dealerId,
        vehicleId: fixtures.vehicles[0].id,
        startDate: today,
        endDate: end,
        status: 'completed',
        totalAmount: '2000',
        monthlyAmount: '2000',
        termMonths: 1,
        paymentStatus: 'completed',
      },
    ])

    await db.insert(payments).values([
      {
        dealerId: fixtures.dealer.dealerId,
        customerId: fixtures.customer.id,
        amount: '1000',
        status: 'completed',
        type: 'rental',
      },
      {
        dealerId: fixtures.dealer.dealerId,
        customerId: fixtures.customer.id,
        amount: '500',
        status: 'completed',
        type: 'rental',
        refundedAmount: '100',
      },
      {
        dealerId: fixtures.dealer.dealerId,
        customerId: fixtures.customer2.id,
        amount: '200',
        status: 'pending',
        type: 'rental',
      },
    ])

    await db.insert(favorites).values({ customerId: fixtures.customer.id, vehicleId: fixtures.vehicles[0].id })

    const { agent: adminAgent } = await loginAs(app, fixtures.admin.email, 'admin')
    const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')

    const [expectedCustomerStats, expectedDealerAnalytics, expectedCustomerDashboard] = await Promise.all([
      aggregateCustomerProfileStats(),
      buildDealerAnalyticsResponse(fixtures.dealer.dealerId),
      buildCustomerDashboardResponse(fixtures.customer.id),
    ])

    const [customerStatsRes, dealerAnalyticsRes, customerDashboardRes] = await Promise.all([
      adminAgent.get('/api/admin/customer-stats'),
      dealerAgent.get('/api/dealer/analytics'),
      customerAgent.get('/api/customer/dashboard'),
    ])

    expect(customerStatsRes.status).toBe(200)
    expect(customerStatsRes.body).toEqual(expectedCustomerStats)

    expect(dealerAnalyticsRes.status).toBe(200)
    expect(dealerAnalyticsRes.body).toEqual(expectedDealerAnalytics)

    expect(customerDashboardRes.status).toBe(200)
    expect(customerDashboardRes.body).toEqual(expectedCustomerDashboard)
  })
})
