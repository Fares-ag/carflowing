import { eq } from 'drizzle-orm'
import type { Express } from 'express'
import request from 'supertest'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'
import { assertProductionSecrets } from '../../utils/productionGuards.js'

describe('Production remediation — Phase 0', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    await resetDb()
  })

  it('P0-01: dealer cannot read customer documents for unpaid online hold (awaitingPayment)', async () => {
    const fixtures = await seedFixtures()
    const { db } = await import('../../db/index.js')
    const { bookingRequests } = await import('../../db/schema.js')
    const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')
    const br = await customerAgent
      .post('/api/customer/booking-requests')
      .send({ vehicleId: fixtures.vehicles[0].id, note: JSON.stringify({ durationMonths: 1 }) })
    await db
      .update(bookingRequests)
      .set({ awaitingPayment: true })
      .where(eq(bookingRequests.id, br.body.id))
    const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    const res = await dealerAgent.get(`/api/dealer/customer-documents/${fixtures.customer.id}`)
    expect(res.status).toBe(403)
  })

  it('P0-02: admin soft-deletes vehicle with booking history instead of hard delete', async () => {
    const fixtures = await seedFixtures()
    const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')
    await customerAgent
      .post('/api/customer/booking-requests')
      .send({ vehicleId: fixtures.vehicles[0].id })
    const { agent: adminAgent } = await loginAs(app, fixtures.admin.email, 'admin')
    const res = await adminAgent.delete(`/api/admin/vehicles/${fixtures.vehicles[0].id}`)
    expect(res.status).toBe(200)
    expect(res.body.softDeleted).toBe(true)
  })

  it('P0-03: approving a booking increments customer rentals_count', async () => {
    const fixtures = await seedFixtures()
    const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')
    const br = await customerAgent
      .post('/api/customer/booking-requests')
      .send({ vehicleId: fixtures.vehicles[0].id })
    const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    await dealerAgent.patch(`/api/dealer/booking-requests/${br.body.id}/status`).send({ status: 'approved' })
    const profile = await customerAgent.get('/api/customer/profile/full')
    expect(profile.body.customerProfile.rentalsCount).toBeGreaterThanOrEqual(1)
  })

  it('P0-04: production boot refuses compromised SkipCash webhook key', () => {
    const prev = { ...process.env }
    Object.assign(process.env, {
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'x'.repeat(32),
      JWT_REFRESH_SECRET: 'y'.repeat(32),
      JWT_2FA_SECRET: 'z'.repeat(32),
      UPLOAD_DRIVER: 'blob',
      BLOB_READ_WRITE_TOKEN: 'blob-token',
      COOKIE_SECURE: 'true',
      PUBLIC_API_URL: 'https://api.carflow.qa',
      CUSTOMER_APP_URL: 'https://customer.carflow.qa',
      DEALER_APP_URL: 'https://dealer.carflow.qa',
      CORS_ORIGINS: 'https://customer.carflow.qa',
      RESEND_API_KEY: 're_test',
      FROM_EMAIL: 'noreply@carflow.qa',
      SKIPCASH_MODE: 'production',
      SKIPCASH_KEY_ID: 'test-id',
      SKIPCASH_KEY_SECRET: 'secret',
      SKIPCASH_WEBHOOK_KEY: '7adcc306-8732-46b9-9da6-f8769699e8c4',
    })
    expect(() => assertProductionSecrets()).toThrow(/committed/)
    Object.assign(process.env, prev)
  })

  it('P1-05: /api/figma is not mounted when NODE_ENV=production', async () => {
    const prevNode = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    const prodApp = buildTestApp()
    process.env.NODE_ENV = prevNode
    const res = await request(prodApp).get('/api/figma/design')
    expect(res.status).toBe(404)
  })
})
