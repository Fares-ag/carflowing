import crypto from 'crypto'
import { describe, expect, it, beforeEach } from 'vitest'
import { buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'
import { db } from '../../db/index.js'
import { plans, rentals } from '../../db/schema.js'

describe('Request body validation', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('rejects admin vehicle create with status rented or orphan dealerId', async () => {
    const fixtures = await seedFixtures()
    const app = buildTestApp()
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')

    const rented = await agent.post('/api/admin/vehicles').send({
      dealerId: fixtures.dealer.dealerId,
      name: 'Ghost Rented',
      make: 'Kia',
      model: 'Sportage',
      year: 2024,
      category: 'suv',
      status: 'rented',
      pricePerDay: 220,
      transmission: 'automatic',
      fuelType: 'gas',
      seats: 5,
    })
    expect(rented.status).toBe(400)
    expect(rented.body.error).toMatch(/status/i)

    const orphan = await agent.post('/api/admin/vehicles').send({
      dealerId: crypto.randomUUID(),
      name: 'Orphan Vehicle',
      make: 'Kia',
      model: 'Sportage',
      year: 2024,
      category: 'suv',
      pricePerDay: 220,
      transmission: 'automatic',
      fuelType: 'gas',
      seats: 5,
    })
    expect(orphan.status).toBe(400)
    expect(orphan.body.error).toMatch(/dealer/i)
  })

  it('rejects admin plan patch with unknown tier or status', async () => {
    const fixtures = await seedFixtures()
    const app = buildTestApp()
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')

    const [plan] = await db.select().from(plans).limit(1)
    expect(plan).toBeTruthy()

    const badTier = await agent.patch(`/api/admin/plans/${plan!.id}`).send({ tier: 'platinum' })
    expect(badTier.status).toBe(400)
    expect(badTier.body.error).toMatch(/tier/i)

    const badStatus = await agent.patch(`/api/admin/plans/${plan!.id}`).send({ status: 'published' })
    expect(badStatus.status).toBe(400)
    expect(badStatus.body.error).toMatch(/status/i)
  })

  it('rejects non-numeric rental review ratings', async () => {
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

    const missing = await agent.post(`/api/customer/rentals/${rental.id}/reviews`).send({ comment: 'No score' })
    expect(missing.status).toBe(400)

    const nanRating = await agent.post(`/api/customer/rentals/${rental.id}/reviews`).send({ rating: 'nope' })
    expect(nanRating.status).toBe(400)
    expect(nanRating.body.error).toMatch(/rating/i)
  })

  it('rejects invalid Qatar phone on profile patch', async () => {
    const fixtures = await seedFixtures()
    const app = buildTestApp()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')

    const res = await agent.patch('/api/customer/profile').send({ phone: '+9745000' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/phone/i)
  })

  it('rejects checkout booking notes with invalid QID or phone', async () => {
    const fixtures = await seedFixtures()
    const app = buildTestApp()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')

    const badNote = JSON.stringify({
      contact: {
        firstName: 'Ali',
        lastName: 'Hassan',
        email: 'ali@test.dev',
        phone: '+9745000',
        qid: '123',
        dateOfBirth: '1990-01-01',
        nationality: 'Qatari',
      },
      license: { number: '12345678', expiry: '2028-12-31' },
    })
    const res = await agent
      .post('/api/customer/booking-requests')
      .send({ vehicleId: fixtures.vehicles[0].id, note: badNote })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/phone|qid/i)
  })

  it('accepts checkout booking notes with valid Qatar identity fields', async () => {
    const fixtures = await seedFixtures()
    const app = buildTestApp()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')

    const goodNote = JSON.stringify({
      contact: {
        firstName: 'Ali',
        lastName: 'Hassan',
        email: 'ali@test.dev',
        phone: '+974 5555 1234',
        qid: '28412345678',
        dateOfBirth: '1990-01-01',
        nationality: 'Qatari',
      },
      license: { number: '12345678', expiry: '2028-12-31' },
      delivery: { mode: 'dealer_pickup', date: '2026-09-01', time: '09:00–12:00' },
    })
    const res = await agent
      .post('/api/customer/booking-requests')
      .send({ vehicleId: fixtures.vehicles[0].id, note: goodNote })
    expect(res.status).toBe(201)
  })

  it('requires QID and license numbers when uploading identity documents', async () => {
    const fixtures = await seedFixtures()
    const app = buildTestApp()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')

    const res = await agent.patch('/api/customer/profile/documents').send({
      qidDocumentPath: `documents/${fixtures.customer.id}/qid.pdf`,
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/qidNumber/i)
  })
})
