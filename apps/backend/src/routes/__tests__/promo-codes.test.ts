import { eq } from 'drizzle-orm'
import type { Express } from 'express'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../../db/index.js'
import {
  bookingRequests,
  invoices,
  payments,
  promoCodes,
  promoRedemptions,
  rentals,
} from '../../db/schema.js'
import { generateDueInvoices } from '../../services/billing.js'
import { computeMonthlyAmount } from '../../services/booking.js'
import { redeemPromoCode, validatePromoCode } from '../../services/promoCodes.js'
import { buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'

describe('Promo codes', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    await resetDb()
  })

  it('PROMO-01: 50% first-month promo bills list price on renewal', async () => {
    const fixtures = await seedFixtures()
    const listMonthly = computeMonthlyAmount(fixtures.vehicles[0].pricePerDay)
    const termMonthly = computeMonthlyAmount(fixtures.vehicles[0].pricePerDay, 3)
    const discounted = termMonthly / 2

    const [promo] = await db
      .insert(promoCodes)
      .values({
        code: 'HALF',
        discountType: 'percent',
        discountValue: '50',
        minTermMonths: 1,
        active: true,
      })
      .returning()

    const cartNote = JSON.stringify({
      durationMonths: 3,
      promo: {
        code: 'HALF',
        promoCodeId: promo.id,
        discountAmount: listMonthly / 2,
        listMonthlyAmount: listMonthly,
      },
    })

    const [br] = await db
      .insert(bookingRequests)
      .values({
        customerId: fixtures.customer.id,
        vehicleId: fixtures.vehicles[0].id,
        status: 'pending',
        note: cartNote,
      })
      .returning()

    await db
      .insert(payments)
      .values({
        customerId: fixtures.customer.id,
        dealerId: fixtures.dealer.dealerId,
        vehicleId: fixtures.vehicles[0].id,
        bookingRequestId: br.id,
        amount: String(discounted),
        status: 'completed',
        type: 'rental',
        method: 'card',
      })
      .returning()

    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')
    const approved = await agent
      .patch(`/api/admin/booking-requests/${br.id}/status`)
      .send({ status: 'approved' })
    expect(approved.status).toBe(200)

    const [rental] = await db.select().from(rentals).where(eq(rentals.bookingRequestId, br.id)).limit(1)
    expect(Number(rental.monthlyAmount)).toBe(termMonthly)
    expect(Number(rental.totalAmount)).toBe(termMonthly * 3)

    const invoiceRows = await db.select().from(invoices).where(eq(invoices.rentalId, rental.id))
    expect(invoiceRows).toHaveLength(1)
    expect(Number(invoiceRows[0].amount)).toBeCloseTo(discounted, 2)

    await db
      .update(rentals)
      .set({ status: 'active', nextBillingDate: '2020-01-01' })
      .where(eq(rentals.id, rental.id))

    const generated = await generateDueInvoices('2020-01-01')
    expect(generated).toBe(1)

    const allInvoices = await db.select().from(invoices).where(eq(invoices.rentalId, rental.id))
    expect(allInvoices).toHaveLength(2)
    expect(Number(allInvoices[1].amount)).toBeCloseTo(termMonthly, 2)
  })

  it('PROMO-02: same customer cannot redeem the same code twice', async () => {
    const fixtures = await seedFixtures()
    const listMonthly = computeMonthlyAmount(fixtures.vehicles[0].pricePerDay)

    const [promo] = await db
      .insert(promoCodes)
      .values({
        code: 'ONCE',
        discountType: 'fixed',
        discountValue: '50',
        minTermMonths: 1,
        active: true,
      })
      .returning()

    await db.insert(promoRedemptions).values({
      promoCodeId: promo.id,
      customerId: fixtures.customer.id,
      discountAmount: '50',
    })

    const result = await validatePromoCode({
      code: 'ONCE',
      customerId: fixtures.customer.id,
      termMonths: 1,
      subtotal: listMonthly,
    })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/already used/i)
  })

  it('PROMO-03: concurrent redemptions cannot exceed maxUses', async () => {
    const fixtures = await seedFixtures()
    const [promo] = await db
      .insert(promoCodes)
      .values({
        code: 'LIMIT1',
        discountType: 'fixed',
        discountValue: '10',
        minTermMonths: 1,
        maxUses: 1,
        usedCount: 0,
        active: true,
      })
      .returning()

    const attempts = await Promise.allSettled([
      db.transaction((tx) =>
        redeemPromoCode(tx, {
          promoCodeId: promo.id,
          customerId: fixtures.customer.id,
          discountAmount: 10,
        })
      ),
      db.transaction((tx) =>
        redeemPromoCode(tx, {
          promoCodeId: promo.id,
          customerId: fixtures.customer2.id,
          discountAmount: 10,
        })
      ),
    ])

    const fulfilled = attempts.filter((a) => a.status === 'fulfilled')
    const rejected = attempts.filter((a) => a.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)

    const [updated] = await db.select().from(promoCodes).where(eq(promoCodes.id, promo.id)).limit(1)
    expect(updated.usedCount).toBe(1)
  })

  it('PROMO-04: admin can create, list, update, and disable promo codes', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')

    const created = await agent.post('/api/admin/promo-codes').send({
      code: 'launch50',
      discountType: 'percent',
      discountValue: 50,
      minTermMonths: 1,
      maxUses: 100,
      perCustomerLimit: 1,
      firstInvoiceOnly: true,
    })
    expect(created.status).toBe(201)
    expect(created.body.code).toBe('LAUNCH50')
    expect(created.body.remainingUses).toBe(100)

    const list = await agent.get('/api/admin/promo-codes')
    expect(list.status).toBe(200)
    expect(list.body.items.some((p: { code: string }) => p.code === 'LAUNCH50')).toBe(true)

    const patched = await agent.patch(`/api/admin/promo-codes/${created.body.id}`).send({ active: false })
    expect(patched.status).toBe(200)
    expect(patched.body.active).toBe(false)

    const disabled = await agent.delete(`/api/admin/promo-codes/${created.body.id}`)
    expect(disabled.status).toBe(200)
    expect(disabled.body.active).toBe(false)
  })

  it('PROMO-05: admin creates code, customer redeems, admin sees usage and can disable', async () => {
    const fixtures = await seedFixtures()
    const listMonthly = computeMonthlyAmount(fixtures.vehicles[0].pricePerDay)
    const { agent: adminAgent } = await loginAs(app, fixtures.admin.email, 'admin')
    const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')

    const created = await adminAgent.post('/api/admin/promo-codes').send({
      code: 'GROWTH10',
      discountType: 'fixed',
      discountValue: 10,
      maxUses: 5,
      perCustomerLimit: 1,
      firstInvoiceOnly: true,
    })
    expect(created.status).toBe(201)

    const validated = await customerAgent.post('/api/customer/promo-codes/validate').send({
      code: 'GROWTH10',
      vehicleId: fixtures.vehicles[0].id,
      termMonths: 1,
    })
    expect(validated.status).toBe(200)
    expect(validated.body.valid).toBe(true)
    expect(validated.body.discountAmount).toBe(10)

    await db.transaction((tx) =>
      redeemPromoCode(tx, {
        promoCodeId: created.body.id,
        customerId: fixtures.customer.id,
        discountAmount: validated.body.discountAmount,
      })
    )

    const list = await adminAgent.get('/api/admin/promo-codes')
    const promo = list.body.items.find((p: { id: string }) => p.id === created.body.id)
    expect(promo.usedCount).toBe(1)
    expect(promo.remainingUses).toBe(4)

    const reused = await validatePromoCode({
      code: 'GROWTH10',
      customerId: fixtures.customer.id,
      termMonths: 1,
      subtotal: listMonthly,
    })
    expect(reused.valid).toBe(false)

    await adminAgent.delete(`/api/admin/promo-codes/${created.body.id}`)

    const afterDisable = await validatePromoCode({
      code: 'GROWTH10',
      customerId: fixtures.customer2.id,
      termMonths: 1,
      subtotal: listMonthly,
    })
    expect(afterDisable.valid).toBe(false)
  })

  it('PROMO-06: perCustomerLimit allows multiple redemptions up to limit', async () => {
    const fixtures = await seedFixtures()

    const [promo] = await db
      .insert(promoCodes)
      .values({
        code: 'TWICE',
        discountType: 'fixed',
        discountValue: '5',
        minTermMonths: 1,
        maxUses: 10,
        perCustomerLimit: 2,
        firstInvoiceOnly: true,
        active: true,
      })
      .returning()

    await db.transaction((tx) =>
      redeemPromoCode(tx, {
        promoCodeId: promo.id,
        customerId: fixtures.customer.id,
        discountAmount: 5,
      })
    )
    await db.transaction((tx) =>
      redeemPromoCode(tx, {
        promoCodeId: promo.id,
        customerId: fixtures.customer.id,
        discountAmount: 5,
      })
    )

    const third = await db.transaction((tx) =>
      redeemPromoCode(tx, {
        promoCodeId: promo.id,
        customerId: fixtures.customer.id,
        discountAmount: 5,
      })
    ).catch((err) => err)

    expect(third).toBeInstanceOf(Error)
    expect(String(third.message)).toMatch(/already used/i)

    const [updated] = await db.select().from(promoCodes).where(eq(promoCodes.id, promo.id)).limit(1)
    expect(updated.usedCount).toBe(2)
  })
})
