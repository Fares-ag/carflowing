import { and, eq } from 'drizzle-orm'
import type { Express } from 'express'
import request from 'supertest'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../../db/index.js'
import { addDays, todayISO } from '../../utils/dates.js'
import {
  customerCredits,
  customerProfiles,
  invoices,
  payments,
  referrals,
  rentals,
} from '../../db/schema.js'
import { generateDueInvoices, settleInvoice } from '../../services/billing.js'
import { ensureReferralCode } from '../../services/referrals.js'
import { buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'

process.env.REFERRAL_CREDIT_AMOUNT_QAR = '50'

/**
 * Billing-timezone relative date. The services compute "today" in the billing
 * timezone (utils/dates todayISO), so a UTC-based helper disagrees with them
 * between 21:00 and 24:00 UTC and shifts every derived date by a day.
 */
function daysAgo(n: number): string {
  return addDays(todayISO(), -n)
}

async function setupReferredActiveRental(app: Express, fixtures: Awaited<ReturnType<typeof seedFixtures>>) {
  const referrerCode = await ensureReferralCode(fixtures.customer.id)
  const signup = await request(app).post('/api/auth/signup').send({
    email: 'referred@carflow.dev',
    password: 'password123',
    name: 'Referred Friend',
    expectedRole: 'customer',
    referralCode: referrerCode,
  })
  expect(signup.status).toBe(201)
  const referredId = signup.body.userId as string

  const { agent: referredAgent } = await loginAs(app, 'referred@carflow.dev', 'customer')
  const br = await referredAgent
    .post('/api/customer/booking-requests')
    .send({ vehicleId: fixtures.vehicles[0].id, note: JSON.stringify({ durationMonths: 3 }) })
  const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
  await dealerAgent.patch(`/api/dealer/booking-requests/${br.body.id}/status`).send({ status: 'approved' })
  const [rental] = await db.select().from(rentals).where(eq(rentals.customerId, referredId))
  await dealerAgent.post('/api/dealer/payments/offline').send({ rentalId: rental.id })
  // Handover now enforces the identity check (rentalLifecycle kycBlockerForHandover):
  // a customer who signed up through the API has no documents on file, so stand in
  // for the checkout uploads before the dealer hands the car over.
  await db
    .insert(customerProfiles)
    .values({
      userId: referredId,
      qidDocumentPath: 'uploads/referred-qid.png',
      driversLicensePath: 'uploads/referred-licence.png',
    })
    .onConflictDoUpdate({
      target: customerProfiles.userId,
      set: {
        qidDocumentPath: 'uploads/referred-qid.png',
        driversLicensePath: 'uploads/referred-licence.png',
      },
    })
  const handover = await dealerAgent.post(`/api/dealer/rentals/${rental.id}/handover`).send({})
  expect(handover.status).toBe(200)

  const [firstInvoice] = await db.select().from(invoices).where(eq(invoices.rentalId, rental.id))
  return { referrerId: fixtures.customer.id, referredId, rental, firstInvoice, referrerCode }
}

/** ID: REF-01..04 — referral credits on first subscription payment */
describe('Referral program', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    await resetDb()
  })

  it('REF-01: each customer gets a unique referral code', async () => {
    const fixtures = await seedFixtures()
    const codeA = await ensureReferralCode(fixtures.customer.id)
    const signup = await request(app).post('/api/auth/signup').send({
      email: 'other@carflow.dev',
      password: 'password123',
      name: 'Other User',
    })
    const codeB = await ensureReferralCode(signup.body.userId)
    expect(codeA).toMatch(/^[A-F0-9]{8}$/)
    expect(codeB).toMatch(/^[A-F0-9]{8}$/)
    expect(codeA).not.toBe(codeB)
  })

  it('REF-02: first invoice payment credits both parties exactly once (idempotent)', async () => {
    const fixtures = await seedFixtures()
    const { referrerId, referredId, firstInvoice } = await setupReferredActiveRental(app, fixtures)

    await db.transaction(async (tx) => {
      const [payment] = await tx
        .insert(payments)
        .values({
          customerId: referredId,
          rentalId: firstInvoice.rentalId,
          invoiceId: firstInvoice.id,
          amount: firstInvoice.amount,
          status: 'pending',
          type: 'subscription',
          method: 'card',
          provider: 'skipcash',
        })
        .returning()
      expect(await settleInvoice(tx, { invoiceId: firstInvoice.id, paymentId: payment.id })).toBe(
        'already-paid'
      )
      expect(await settleInvoice(tx, { invoiceId: firstInvoice.id, paymentId: payment.id })).toBe(
        'already-paid'
      )
    })

    const credits = await db.select().from(customerCredits)
    expect(credits).toHaveLength(2)
    expect(credits.filter((c) => c.userId === referrerId && c.source === 'referral_referrer')).toHaveLength(1)
    expect(credits.filter((c) => c.userId === referredId && c.source === 'referral_referred')).toHaveLength(1)
    expect(Number(credits[0].amount)).toBe(50)

    const [referral] = await db.select().from(referrals).where(eq(referrals.referredUserId, referredId))
    expect(referral.status).toBe('credited')
  })

  it('REF-03: store credit reduces a subsequent invoice amount', async () => {
    const fixtures = await seedFixtures()
    const { referredId, rental, firstInvoice } = await setupReferredActiveRental(app, fixtures)

    await db.transaction(async (tx) => {
      const [payment] = await tx
        .insert(payments)
        .values({
          customerId: referredId,
          rentalId: rental.id,
          invoiceId: firstInvoice.id,
          amount: firstInvoice.amount,
          status: 'pending',
          type: 'subscription',
          method: 'card',
          provider: 'offline',
        })
        .returning()
      await settleInvoice(tx, { invoiceId: firstInvoice.id, paymentId: payment.id })
    })

    await db.update(rentals).set({ nextBillingDate: daysAgo(1) }).where(eq(rentals.id, rental.id))
    await generateDueInvoices()

    const invoiceRows = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.rentalId, rental.id), eq(invoices.status, 'due')))
    expect(invoiceRows).toHaveLength(1)
    expect(Number(invoiceRows[0].creditApplied)).toBe(50)
    expect(Number(invoiceRows[0].amount)).toBe(Number(rental.monthlyAmount) - 50)
  })

  it('REF-04: GET /customer/referrals returns code and status', async () => {
    const fixtures = await seedFixtures()
    await ensureReferralCode(fixtures.customer.id)
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const res = await agent.get('/api/customer/referrals')
    expect(res.status).toBe(200)
    expect(res.body.code).toMatch(/^[A-F0-9]{8}$/)
    expect(res.body.shareUrl).toContain('ref=')
  })
})
