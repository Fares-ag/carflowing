import { describe, expect, it, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'
import { db } from '../../db/index.js'
import { promoCodes, rentals, rentalReviews } from '../../db/schema.js'

describe('Feature gaps API', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('customer can extend rental term and validate promo code', async () => {
    const fixtures = await seedFixtures()
    const app = buildTestApp()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')

    await db.insert(promoCodes).values({
      code: 'SAVE10',
      discountType: 'percent',
      discountValue: '10',
      minTermMonths: 1,
      active: true,
    })

    const promo = await agent.post('/api/customer/promo-codes/validate').send({
      code: 'SAVE10',
      vehicleId: fixtures.vehicles[0].id,
      termMonths: 3,
    })
    expect(promo.status).toBe(200)
    expect(promo.body.valid).toBe(true)
    expect(promo.body.discountAmount).toBeGreaterThan(0)

    const [rental] = await db
      .insert(rentals)
      .values({
        customerId: fixtures.customer.id,
        dealerId: fixtures.dealer.dealerId,
        vehicleId: fixtures.vehicles[0].id,
        startDate: '2026-01-01',
        endDate: '2026-04-01',
        status: 'active',
        totalAmount: '13500',
        monthlyAmount: '4500',
        termMonths: 3,
      })
      .returning()

    const extended = await agent.post(`/api/customer/rentals/${rental.id}/extend`).send({ months: 2 })
    expect(extended.status).toBe(200)
    expect(extended.body.termMonths).toBe(5)
  })

  it('admin can list job runs after manual sweep', async () => {
    const fixtures = await seedFixtures()
    const app = buildTestApp()
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')

    const run = await agent.post('/api/admin/jobs/run-once')
    expect(run.status).toBe(200)

    const list = await agent.get('/api/admin/jobs/runs')
    expect(list.status).toBe(200)
    expect(list.body.items.length).toBeGreaterThan(0)
  })

  it('completed rental can be reviewed once', async () => {
    const fixtures = await seedFixtures()
    const app = buildTestApp()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')

    const [rental] = await db
      .insert(rentals)
      .values({
        customerId: fixtures.customer.id,
        dealerId: fixtures.dealer.dealerId,
        vehicleId: fixtures.vehicles[0].id,
        startDate: '2026-01-01',
        endDate: '2026-02-01',
        status: 'completed',
        totalAmount: '4500',
        monthlyAmount: '4500',
        termMonths: 1,
      })
      .returning()

    const review = await agent.post(`/api/customer/rentals/${rental.id}/reviews`).send({
      rating: 5,
      comment: 'Great experience',
    })
    expect(review.status).toBe(201)

    const dup = await agent.post(`/api/customer/rentals/${rental.id}/reviews`).send({ rating: 4 })
    expect(dup.status).toBe(409)

    const rows = await db.select().from(rentalReviews).where(eq(rentalReviews.rentalId, rental.id))
    expect(rows).toHaveLength(1)
  })
})
