import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { db } from '../../db/index.js'
import { bookingRequests, customerProfiles, rentals } from '../../db/schema.js'
import { resetDb, seedFixtures } from '../../test/helpers.js'
import { addMonths, todayISO } from '../../utils/dates.js'
import { recordHandover } from '../rentalLifecycle.js'

/** ID: KYC-01..KYC-05 — identity gate on handover (audit HIGH: nothing gates handover) */
describe('recordHandover KYC gate', () => {
  afterEach(async () => {
    await resetDb()
  })

  /** A paid, reserved rental for the given customer — one step from handover. */
  async function paidReservedRental(
    fixtures: Awaited<ReturnType<typeof seedFixtures>>,
    customerId: string,
    bookingRequestId?: string
  ) {
    const startDate = todayISO()
    const [rental] = await db
      .insert(rentals)
      .values({
        customerId,
        dealerId: fixtures.dealer.dealerId,
        vehicleId: fixtures.vehicles[0].id,
        bookingRequestId: bookingRequestId ?? null,
        startDate,
        endDate: addMonths(startDate, 1),
        status: 'reserved',
        totalAmount: '3000',
        monthlyAmount: '3000',
        termMonths: 1,
        paymentStatus: 'completed',
      })
      .returning()
    return rental
  }

  function handover(fixtures: Awaited<ReturnType<typeof seedFixtures>>, rentalId: string) {
    return recordHandover({
      rentalId,
      dealerId: fixtures.dealer.dealerId,
      actorId: fixtures.dealer.id,
    })
  }

  it('KYC-01: refuses handover when the customer uploaded no identity documents', async () => {
    const fixtures = await seedFixtures()
    const rental = await paidReservedRental(fixtures, fixtures.customer2.id)

    const result = await handover(fixtures, rental.id)
    expect(result.status).toBe(409)
    expect((result.body as { error: string }).error).toMatch(/identity check incomplete/i)
    expect((result.body as { error: string }).error).toMatch(/Qatar ID and driver's licence/i)

    const [after] = await db.select().from(rentals).where(eq(rentals.id, rental.id))
    expect(after.status).toBe('reserved')
  })

  it('KYC-02: names the missing document when only one is on file', async () => {
    const fixtures = await seedFixtures()
    await db
      .update(customerProfiles)
      .set({ qidDocumentPath: `documents/${fixtures.customer2.id}/qid.pdf` })
      .where(eq(customerProfiles.userId, fixtures.customer2.id))
    const rental = await paidReservedRental(fixtures, fixtures.customer2.id)

    const result = await handover(fixtures, rental.id)
    expect(result.status).toBe(409)
    expect((result.body as { error: string }).error).toMatch(/no driver's licence on file/i)
  })

  it('KYC-03: allows handover once both documents are on file', async () => {
    const fixtures = await seedFixtures()
    await db
      .update(customerProfiles)
      .set({
        qidDocumentPath: `documents/${fixtures.customer2.id}/qid.pdf`,
        driversLicensePath: `documents/${fixtures.customer2.id}/licence.pdf`,
      })
      .where(eq(customerProfiles.userId, fixtures.customer2.id))
    const rental = await paidReservedRental(fixtures, fixtures.customer2.id)

    const result = await handover(fixtures, rental.id)
    expect(result.status).toBe(200)
    const [after] = await db.select().from(rentals).where(eq(rentals.id, rental.id))
    expect(after.status).toBe('active')
  })

  it('KYC-04: refuses handover on a licence that has already expired', async () => {
    const fixtures = await seedFixtures()
    await db
      .update(customerProfiles)
      .set({
        qidDocumentPath: `documents/${fixtures.customer2.id}/qid.pdf`,
        driversLicensePath: `documents/${fixtures.customer2.id}/licence.pdf`,
      })
      .where(eq(customerProfiles.userId, fixtures.customer2.id))
    const [request] = await db
      .insert(bookingRequests)
      .values({
        customerId: fixtures.customer2.id,
        vehicleId: fixtures.vehicles[0].id,
        status: 'approved',
        note: JSON.stringify({ durationMonths: 1, license: { number: '12345678', expiry: '2020-01-31' } }),
      })
      .returning()
    const rental = await paidReservedRental(fixtures, fixtures.customer2.id, request.id)

    const result = await handover(fixtures, rental.id)
    expect(result.status).toBe(409)
    expect((result.body as { error: string }).error).toMatch(/expired on 2020-01-31/i)
  })

  it('KYC-05: a suspended customer is never handed a car; a staff-verified one is', async () => {
    const fixtures = await seedFixtures()
    await db
      .update(customerProfiles)
      .set({ status: 'suspended' })
      .where(eq(customerProfiles.userId, fixtures.customer.id))
    const rental = await paidReservedRental(fixtures, fixtures.customer.id)

    const blocked = await handover(fixtures, rental.id)
    expect(blocked.status).toBe(409)
    expect((blocked.body as { error: string }).error).toMatch(/suspended/i)

    // `verified` is an explicit staff KYC decision (admin verification route,
    // recorded in audit_logs), so it stands in for the uploaded scans.
    await db
      .update(customerProfiles)
      .set({ status: 'verified' })
      .where(eq(customerProfiles.userId, fixtures.customer.id))
    const allowed = await handover(fixtures, rental.id)
    expect(allowed.status).toBe(200)
  })
})
