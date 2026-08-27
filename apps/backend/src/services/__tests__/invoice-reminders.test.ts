import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/index.js'
import { emailOutbox, invoiceReminderSends, invoices, notifications, rentals } from '../../db/schema.js'
import { resetDb, seedFixtures } from '../../test/helpers.js'
import { addDays, todayISO } from '../../utils/dates.js'
import { sendInvoicePaymentReminders } from '../invoiceReminders.js'

async function seedOverdueInvoice() {
  const fixtures = await seedFixtures()
  const now = todayISO()
  const [rental] = await db
    .insert(rentals)
    .values({
      customerId: fixtures.customer.id,
      dealerId: fixtures.dealer.dealerId,
      vehicleId: fixtures.vehicles[0].id,
      startDate: addDays(now, -40),
      endDate: addDays(now, -10),
      status: 'active',
      totalAmount: '3000',
      monthlyAmount: '3000',
      termMonths: 1,
      nextBillingDate: addDays(now, 30),
      paymentStatus: 'pending',
    })
    .returning()

  await db.insert(invoices).values({
    ownerType: 'customer',
    ownerId: fixtures.customer.id,
    rentalId: rental.id,
    amount: '3000',
    status: 'overdue',
    dueDate: addDays(now, -5),
    periodStart: addDays(now, -35),
    periodEnd: addDays(now, -5),
    description: 'Monthly subscription',
  })

  return { fixtures, now }
}

describe('invoice payment reminders', () => {
  afterEach(async () => {
    vi.unstubAllEnvs()
    await resetDb()
  })

  it('REMIND-01: one sweep sends exactly one reminder per invoice', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const { fixtures, now } = await seedOverdueInvoice()

    expect(await sendInvoicePaymentReminders(now)).toBe(1)

    expect(await db.select().from(emailOutbox)).toHaveLength(1)
    expect(
      await db.select().from(notifications).where(eq(notifications.userId, fixtures.customer.id))
    ).toHaveLength(1)
    expect(await db.select().from(invoiceReminderSends)).toHaveLength(1)

    // A second sweep on the same day adds nothing.
    expect(await sendInvoicePaymentReminders(now)).toBe(0)
    expect(await db.select().from(emailOutbox)).toHaveLength(1)
  })

  it('REMIND-02: overlapping sweeps still produce exactly one send', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const { now } = await seedOverdueInvoice()

    const [first, second] = await Promise.all([
      sendInvoicePaymentReminders(now),
      sendInvoicePaymentReminders(now),
    ])

    expect(first + second).toBe(1)
    expect(await db.select().from(emailOutbox)).toHaveLength(1)
    expect(await db.select().from(invoiceReminderSends)).toHaveLength(1)
  })

  it('REMIND-03: the sweep walks the whole delinquent pool oldest-due-date first', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const fixtures = await seedFixtures()
    const now = todayISO()
    const [rental] = await db
      .insert(rentals)
      .values({
        customerId: fixtures.customer.id,
        dealerId: fixtures.dealer.dealerId,
        vehicleId: fixtures.vehicles[0].id,
        startDate: addDays(now, -40),
        endDate: addDays(now, -10),
        status: 'active',
        totalAmount: '3000',
        monthlyAmount: '3000',
        termMonths: 1,
        nextBillingDate: addDays(now, 30),
        paymentStatus: 'pending',
      })
      .returning()

    for (let i = 0; i < 3; i += 1) {
      await db.insert(invoices).values({
        ownerType: 'customer',
        ownerId: fixtures.customer.id,
        rentalId: rental.id,
        amount: '1000',
        status: 'overdue',
        dueDate: addDays(now, -(2 + i)),
        periodStart: addDays(now, -(35 + i)),
        periodEnd: addDays(now, -(2 + i)),
        description: `Invoice ${i}`,
      })
    }

    expect(await sendInvoicePaymentReminders(now)).toBe(3)
    const sends = await db.select().from(invoiceReminderSends)
    expect(sends).toHaveLength(3)
    expect(sends.every((row) => row.stage === 'overdue_grace')).toBe(true)
  })
})
