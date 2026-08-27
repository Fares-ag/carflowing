import { eq } from 'drizzle-orm'
import type { Express } from 'express'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../../db/index.js'
import { auditLogs, rentals } from '../../db/schema.js'
import { buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'

describe('Vehicle reviews API', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    await resetDb()
  })

  async function seedCompletedRental(fixtures: Awaited<ReturnType<typeof seedFixtures>>) {
    const [rental] = await db
      .insert(rentals)
      .values({
        customerId: fixtures.customer.id,
        dealerId: fixtures.dealer.dealerId,
        vehicleId: fixtures.vehicles[0].id,
        startDate: '2026-01-01',
        endDate: '2026-02-01',
        status: 'completed',
        totalAmount: '13500',
        monthlyAmount: '13500',
        termMonths: 1,
      })
      .returning()
    return rental
  }

  it('REV-01: submitted review appears on vehicle detail with correct aggregate', async () => {
    const fixtures = await seedFixtures()
    const rental = await seedCompletedRental(fixtures)
    const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')

    const created = await customerAgent.post(`/api/customer/rentals/${rental.id}/reviews`).send({
      rating: 5,
      comment: 'Great car for daily driving',
    })
    expect(created.status).toBe(201)

    const list = await customerAgent.get(`/api/customer/vehicles/${fixtures.vehicles[0].id}/reviews`)
    expect(list.status).toBe(200)
    expect(list.body.reviewCount).toBe(1)
    expect(list.body.averageRating).toBe(5)
    expect(list.body.items[0].comment).toBe('Great car for daily driving')

    const detail = await customerAgent.get(`/api/customer/vehicles/${fixtures.vehicles[0].id}`)
    expect(detail.status).toBe(200)
    expect(detail.body.averageRating).toBe(5)
    expect(detail.body.reviewCount).toBe(1)

    const catalog = await customerAgent.get('/api/customer/vehicles')
    expect(catalog.status).toBe(200)
    const item = catalog.body.items.find((v: { id: string }) => v.id === fixtures.vehicles[0].id)
    expect(item.averageRating).toBe(5)
    expect(item.reviewCount).toBe(1)
  })

  it('REV-02: dealer can respond once; duplicate response returns 409', async () => {
    const fixtures = await seedFixtures()
    const rental = await seedCompletedRental(fixtures)
    const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')
    const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')

    const created = await customerAgent.post(`/api/customer/rentals/${rental.id}/reviews`).send({
      rating: 4,
      comment: 'Smooth ride',
    })
    expect(created.status).toBe(201)

    const respond = await dealerAgent
      .post(`/api/dealer/reviews/${created.body.id}/respond`)
      .send({ response: 'Thanks for choosing us!' })
    expect(respond.status).toBe(200)

    const duplicate = await dealerAgent
      .post(`/api/dealer/reviews/${created.body.id}/respond`)
      .send({ response: 'Another reply' })
    expect(duplicate.status).toBe(409)

    const publicList = await customerAgent.get(
      `/api/customer/vehicles/${fixtures.vehicles[0].id}/reviews`
    )
    expect(publicList.body.items[0].dealerResponse).toBe('Thanks for choosing us!')

    const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, created.body.id))
    expect(logs.some((l) => l.action === 'review.respond' && l.actorRole === 'dealer')).toBe(true)
  })

  it('REV-03: dealer review list is scoped to their fleet', async () => {
    const fixtures = await seedFixtures()
    const rental = await seedCompletedRental(fixtures)
    const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')
    const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')

    await customerAgent.post(`/api/customer/rentals/${rental.id}/reviews`).send({ rating: 3 })

    const list = await dealerAgent.get('/api/dealer/reviews')
    expect(list.status).toBe(200)
    expect(list.body.total).toBe(1)
    expect(list.body.items[0].rating).toBe(3)
    expect(list.body.items[0].vehicleName).toBeTruthy()
  })
})
