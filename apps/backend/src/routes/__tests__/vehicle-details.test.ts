import { eq } from 'drizzle-orm'
import type { Express } from 'express'
import request from 'supertest'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../../db/index.js'
import { vehicles } from '../../db/schema.js'
import { buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'

describe('Vehicle details', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    await resetDb()
  })

  it('VEH-01: dealer create returns gallery + specs; customer detail matches', async () => {
    const fixtures = await seedFixtures()
    const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')

    const created = await dealerAgent.post('/api/dealer/vehicles').send({
        name: 'Gallery SUV',
        make: 'Toyota',
        model: 'RAV4',
        year: 2024,
        category: 'suv',
        pricePerDay: 200,
        transmission: 'automatic',
        fuelType: 'hybrid',
        seats: 5,
        mileage: 12000,
        color: 'Pearl White',
        description: 'Family-ready hybrid with full spec sheet.',
        mileageCapKm: 2500,
        imageUrls: ['https://cdn.example/1.jpg', 'https://cdn.example/2.jpg'],
        features: ['GPS Navigation', 'Heated Seats'],
      })
    expect(created.status).toBe(201)
    expect(created.body.imageUrls).toHaveLength(2)
    expect(created.body.features).toContain('GPS Navigation')

    const detail = await request(app).get(`/api/customer/vehicles/${created.body.id}`)
    expect(detail.status).toBe(200)
    expect(detail.body.imageUrls).toEqual(['https://cdn.example/1.jpg', 'https://cdn.example/2.jpg'])
    expect(detail.body.description).toContain('Family-ready')
    expect(detail.body.color).toBe('Pearl White')
    expect(detail.body.mileageCapKm).toBe(2500)
    expect(detail.body.features).toEqual(['GPS Navigation', 'Heated Seats'])
  })

  it('VEH-02: features filter returns vehicles that include all selected features', async () => {
    const fixtures = await seedFixtures()
    const vehicleId = fixtures.vehicles[0].id
    await db
      .update(vehicles)
      .set({ features: ['GPS Navigation', 'Bluetooth'] })
      .where(eq(vehicles.id, vehicleId))

    const match = await request(app).get('/api/customer/vehicles').query({
      features: 'GPS Navigation,Bluetooth',
      pageSize: 50,
    })
    expect(match.status).toBe(200)
    expect(match.body.items.some((v: { id: string }) => v.id === vehicleId)).toBe(true)

    const noMatch = await request(app).get('/api/customer/vehicles').query({
      features: 'GPS Navigation,Sunroof',
      pageSize: 50,
    })
    expect(noMatch.body.items.some((v: { id: string }) => v.id === vehicleId)).toBe(false)
  })

  it('VEH-03: pricing settings expose subscription deposit for customer UI', async () => {
    const res = await request(app).get('/api/customer/pricing-settings')
    expect(res.status).toBe(200)
    expect(typeof res.body.subscriptionDepositAmount).toBe('number')
    expect(res.body.subscriptionDepositAmount).toBeGreaterThanOrEqual(0)
  })
})
