import { and, eq } from 'drizzle-orm'
import type { Express } from 'express'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../../db/index.js'
import { auditLogs, payments, rentals } from '../../db/schema.js'
import { buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'

async function activeRentalWithDeposit(app: Express, depositAmount = '500') {
  const fixtures = await seedFixtures()
  const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')
  const br = await customerAgent.post('/api/customer/booking-requests').send({
    vehicleId: fixtures.vehicles[0].id,
    note: JSON.stringify({ durationMonths: 1 }),
  })
  expect(br.status).toBe(201)

  const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
  const approved = await dealerAgent
    .patch(`/api/dealer/booking-requests/${br.body.id}/status`)
    .send({ status: 'approved' })
  expect(approved.status).toBe(200)

  const [rental] = await db.select().from(rentals)
  await db
    .update(rentals)
    .set({ depositAmount, depositRefundable: true })
    .where(eq(rentals.id, rental.id))

  await dealerAgent.post('/api/dealer/payments/offline').send({ rentalId: rental.id })
  await dealerAgent.post(`/api/dealer/rentals/${rental.id}/handover`).send({ mileage: 10000 })

  return { dealerAgent, rentalId: rental.id }
}

describe('Deposit resolution on return', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    await resetDb()
  })

  it('rejects release + withheld exceeding deposit', async () => {
    const { dealerAgent, rentalId } = await activeRentalWithDeposit(app)
    const res = await dealerAgent.post(`/api/dealer/rentals/${rentalId}/return`).send({
      depositResolution: { releaseAmount: 400, withheldAmount: 200 },
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/cannot exceed/i)
  })

  it('requires a reason when withholding deposit', async () => {
    const { dealerAgent, rentalId } = await activeRentalWithDeposit(app)
    const res = await dealerAgent.post(`/api/dealer/rentals/${rentalId}/return`).send({
      depositResolution: { releaseAmount: 300, withheldAmount: 200 },
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/reason/i)
  })

  it('persists full release and flags payment for finance refund', async () => {
    const { dealerAgent, rentalId } = await activeRentalWithDeposit(app)
    const res = await dealerAgent.post(`/api/dealer/rentals/${rentalId}/return`).send({
      mileage: 12000,
      depositResolution: { releaseAmount: 500, withheldAmount: 0 },
    })
    expect(res.status).toBe(200)
    expect(res.body.depositResolvedAmount).toBe(500)
    expect(res.body.depositWithheldAmount).toBe(0)

    const [rental] = await db.select().from(rentals).where(eq(rentals.id, rentalId))
    expect(Number(rental.depositResolvedAmount)).toBe(500)
    expect(rental.depositResolvedAt).toBeTruthy()

    const [payment] = await db.select().from(payments).where(eq(payments.rentalId, rentalId))
    expect(payment?.needsRefund).toBe(true)
    expect(payment?.note).toMatch(/Deposit release on return/)

    const audits = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, rentalId), eq(auditLogs.action, 'rental.return')))
    expect(audits.some((row) => row.after && (row.after as any).depositResolvedAmount === 500)).toBe(true)
  })

  it('persists partial withhold with reason', async () => {
    const { dealerAgent, rentalId } = await activeRentalWithDeposit(app)
    const res = await dealerAgent.post(`/api/dealer/rentals/${rentalId}/return`).send({
      depositResolution: {
        releaseAmount: 350,
        withheldAmount: 150,
        note: 'Rear bumper scratch repair',
      },
    })
    expect(res.status).toBe(200)
    expect(res.body.depositResolvedAmount).toBe(350)
    expect(res.body.depositWithheldAmount).toBe(150)
    expect(res.body.depositResolutionNote).toBe('Rear bumper scratch repair')
  })

  it('allows return with zero deposit and no resolution block', async () => {
    const { dealerAgent, rentalId } = await activeRentalWithDeposit(app, '0')
    const res = await dealerAgent.post(`/api/dealer/rentals/${rentalId}/return`).send({ mileage: 12000 })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('completed')
  })
})
