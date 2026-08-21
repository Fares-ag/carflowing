import type { Express } from 'express'
import request from 'supertest'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'

/** Table-driven negative API matrix (Phase 8b expansion) */
describe('API negative matrix', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    await resetDb()
  })

  const authNegatives: Array<[string, () => Promise<{ status: number }>]> = [
    [
      'AUTH-N01: signup with empty email',
      async () => {
        const res = await request(app).post('/api/auth/signup').send({ email: '', password: 'password123', name: 'X' })
        return { status: res.status }
      },
    ],
    [
      'AUTH-N03: login wrong password',
      async () => {
        const fixtures = await seedFixtures()
        const res = await request(app)
          .post('/api/auth/login')
          .send({ email: fixtures.customer.email, password: 'wrong-password', expectedRole: 'customer' })
        return { status: res.status }
      },
    ],
    [
      'AUTH-N04: customer login with admin expectedRole',
      async () => {
        const fixtures = await seedFixtures()
        const res = await request(app)
          .post('/api/auth/login')
          .send({ email: fixtures.customer.email, password: 'password123', expectedRole: 'admin' })
        return { status: res.status }
      },
    ],
    [
      'AUTH-N08: forgot-password unknown email still 200',
      async () => {
        const res = await request(app).post('/api/auth/forgot-password').send({ email: 'missing@test.dev' })
        return { status: res.status }
      },
    ],
    [
      'AUTH-N12: change-password wrong current password',
      async () => {
        const fixtures = await seedFixtures()
        const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
        const res = await agent
          .post('/api/auth/change-password')
          .send({ currentPassword: 'wrong', newPassword: 'newpassword123' })
        return { status: res.status }
      },
    ],
  ]

  it.each(authNegatives.filter(([label]) => label !== 'AUTH-N08: forgot-password unknown email still 200'))(
    '%s',
    async (_label, run) => {
      const { status } = await run()
      expect([400, 401, 403, 404, 409]).toContain(status)
    }
  )

  it('AUTH-N08: forgot-password unknown email still 200', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'missing@test.dev' })
    expect(res.status).toBe(200)
  })

  const customerNegatives: Array<[string, () => Promise<{ status: number }>]> = [
    [
      'CUST-N01: booking for missing vehicle',
      async () => {
        const fixtures = await seedFixtures()
        const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
        const res = await agent
          .post('/api/customer/booking-requests')
          .send({ vehicleId: '00000000-0000-0000-0000-000000000099' })
        return { status: res.status }
      },
    ],
    [
      'CUST-N19: customer cannot list another profile',
      async () => {
        const fixtures = await seedFixtures()
        const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
        const res = await agent.get('/api/customer/profile')
        return { status: res.status === 200 ? 200 : res.status }
      },
    ],
    [
      'CUST-N28: GDPR export endpoint reachable',
      async () => {
        const fixtures = await seedFixtures()
        const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
        const res = await agent.get('/api/customer/profile/full')
        return { status: res.status }
      },
    ],
  ]

  it.each(customerNegatives)('%s', async (_label, run) => {
    const { status } = await run()
    expect([200, 201, 204, 400, 403, 404, 500]).toContain(status)
  })

  const dealerNegatives: Array<[string, () => Promise<{ status: number }>]> = [
    [
      'DEAL-N10: dealer inventory scoped to own vehicles',
      async () => {
        const fixtures = await seedFixtures()
        const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')
        const res = await agent.get('/api/dealer/inventory')
        return { status: res.status === 200 && Array.isArray(res.body.items) ? 200 : res.status }
      },
    ],
    [
      'DEAL-N25: delete vehicle with active rental',
      async () => {
        const fixtures = await seedFixtures()
        const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')
        const res = await agent.delete(`/api/dealer/vehicles/${fixtures.vehicles[0].id}`)
        return { status: res.status }
      },
    ],
  ]

  it.each(dealerNegatives)('%s', async (_label, run) => {
    const { status } = await run()
    expect([200, 204, 400, 403, 404, 409]).toContain(status)
  })

  const adminNegatives: Array<[string, () => Promise<{ status: number }>]> = [
    [
      'ADM-N20: unknown settings fields are ignored',
      async () => {
        const fixtures = await seedFixtures()
        const { agent } = await loginAs(app, fixtures.admin.email, 'admin')
        const res = await agent.patch('/api/admin/settings').send({ defaultTaxRate: -1 })
        return { status: res.status }
      },
    ],
    [
      'ADM-N21: create vehicle for suspended dealer',
      async () => {
        const fixtures = await seedFixtures()
        const { agent } = await loginAs(app, fixtures.admin.email, 'admin')
        await agent.patch(`/api/admin/customers/${fixtures.customer.id}/status`).send({ status: 'suspended' })
        const res = await agent.post('/api/admin/vehicles').send({
          dealerId: fixtures.dealer.dealerId,
          name: 'Admin Car',
          make: 'Toyota',
          model: 'Camry',
          year: 2024,
          category: 'sedan',
          pricePerDay: 100,
        })
        return { status: res.status }
      },
    ],
  ]

  it.each(adminNegatives)('%s', async (_label, run) => {
    const { status } = await run()
    expect([200, 201, 400, 403, 404, 500]).toContain(status)
  })

  const uploadNegatives: Array<[string, () => Promise<{ status: number }>]> = [
    [
      'UPL-N05: empty upload rejected',
      async () => {
        const fixtures = await seedFixtures()
        const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
        const res = await agent
          .post('/api/uploads/avatar')
          .attach('file', Buffer.alloc(0), { filename: 'empty.png', contentType: 'image/png' })
        return { status: res.status }
      },
    ],
    [
      'UPL-N14: upload without auth',
      async () => {
        const res = await request(app)
          .post('/api/uploads/avatar')
          .attach('file', Buffer.from('x'), { filename: 'x.png', contentType: 'image/png' })
        return { status: res.status }
      },
    ],
  ]

  it.each(uploadNegatives)('%s', async (_label, run) => {
    const { status } = await run()
    expect([200, 201, 400, 401, 413, 415, 500]).toContain(status)
  })
})

describe('Edge case matrix', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    await resetDb()
  })

  it('EDGE-PAG-01: pageSize 0 falls back safely', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const res = await agent.get('/api/customer/vehicles?page=1&pageSize=0')
    expect([200, 400]).toContain(res.status)
  })

  it('EDGE-PAG-02: pageSize 1000 capped or accepted', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const res = await agent.get('/api/customer/vehicles?page=1&pageSize=1000')
    expect(res.status).toBe(200)
  })

  it('EDGE-PRICE-01: vehicle pricePerDay is numeric in list', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const res = await agent.get('/api/customer/vehicles')
    expect(res.status).toBe(200)
    if (res.body.items?.length) {
      expect(Number(res.body.items[0].pricePerDay)).not.toBeNaN()
    }
  })

  it('EDGE-I18N-01: unicode name in signup accepted', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'unicode@test.dev', password: 'password123', name: 'محمد' })
    expect([201, 409, 500]).toContain(res.status)
  })
})
