import { eq } from 'drizzle-orm'
import type { Express } from 'express'
import request from 'supertest'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../../db/index.js'
import { rentals, vehicles } from '../../db/schema.js'
import { addMonths, todayISO } from '../../utils/dates.js'
import { buildTestApp, resetDb, seedFixtures } from '../../test/helpers.js'

describe('Vehicle location & availability browse', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    await resetDb()
  })

  it('LOC-01: location filter returns only vehicles in the selected city', async () => {
    await seedFixtures()

    const doha = await request(app).get('/api/customer/vehicles').query({ location: 'Doha', pageSize: 50 })
    expect(doha.status).toBe(200)
    expect(doha.body.items.length).toBeGreaterThan(0)
    expect(doha.body.items.every((v: { locationCity: string }) => v.locationCity === 'Doha')).toBe(true)

    const wakrah = await request(app).get('/api/customer/vehicles').query({ location: 'Al Wakrah', pageSize: 50 })
    expect(wakrah.body.items.every((v: { locationCity: string }) => v.locationCity === 'Al Wakrah')).toBe(true)
    expect(wakrah.body.items.some((v: { make: string }) => v.make === 'Honda')).toBe(true)
  })

  it('LOC-02: startDate excludes vehicles with an active rental covering that date', async () => {
    const fixtures = await seedFixtures()
    const vehicleId = fixtures.vehicles[0].id
    const startDate = addMonths(todayISO(), 1)

    await db.insert(rentals).values({
      customerId: fixtures.customer.id,
      dealerId: fixtures.dealer.dealerId,
      vehicleId,
      startDate,
      endDate: addMonths(startDate, 3),
      status: 'reserved',
      totalAmount: '1000',
    })

    const withoutDate = await request(app)
      .get('/api/customer/vehicles')
      .query({ pageSize: 50 })
    expect(withoutDate.body.items.some((v: { id: string }) => v.id === vehicleId)).toBe(true)

    const onStartDate = await request(app)
      .get('/api/customer/vehicles')
      .query({ startDate, pageSize: 50 })
    expect(onStartDate.body.items.some((v: { id: string }) => v.id === vehicleId)).toBe(false)

    const beforeRental = await request(app)
      .get('/api/customer/vehicles')
      .query({ startDate: todayISO(), pageSize: 50 })
    expect(beforeRental.body.items.some((v: { id: string }) => v.id === vehicleId)).toBe(true)
  })

  it('LOC-03: catalog results include location fields', async () => {
    await seedFixtures()
    const res = await request(app).get('/api/customer/vehicles').query({ pageSize: 5 })
    expect(res.body.items[0].locationCity).toBeTruthy()
    expect(res.body.items[0].locationArea).toBeTruthy()
  })
})
