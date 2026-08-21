import { afterEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { invoices, rentalExtensions, rentals } from '../../db/schema.js'
import { resetDb, seedFixtures } from '../../test/helpers.js'
import { computeRentalWindow } from '../booking.js'
import { isReminderStageDue, sendInvoicePaymentReminders } from '../invoiceReminders.js'
import { extendRentalTerm } from '../rentalExtension.js'
import { addDays, todayISO } from '../../utils/dates.js'

describe('Billing timezone and atomicity remediation', () => {
  afterEach(async () => {
    vi.useRealTimers()
    delete process.env.BILLING_TIMEZONE
    await resetDb()
  })

  it('checkout at 01:00 Qatar anchors startDate to today in Asia/Qatar', () => {
    process.env.BILLING_TIMEZONE = 'Asia/Qatar'
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-14T22:00:00.000Z')) // 01:00 Qatar on Aug 15

    const window = computeRentalWindow({ durationMonths: 3 })
    expect(window.startDate).toBe('2026-08-15')
    expect(window.startDate).toBe(todayISO())
  })

  it('analytics rollups key rows by explicit billing-calendar dates', async () => {
    const { recordDailyRollups } = await import('../analyticsRollups.js')
    const rollupDate = '2026-08-15'
    const written = await recordDailyRollups(rollupDate)
    expect(written).toBeGreaterThan(0)

    const { analyticsRollups } = await import('../../db/schema.js')
    const rows = await db
      .select()
      .from(analyticsRollups)
      .where(eq(analyticsRollups.rollupDate, rollupDate))
    expect(rows.length).toBeGreaterThan(0)
  })

  it('concurrent extend calls serialize and accumulate total_amount correctly', async () => {
    const fixtures = await seedFixtures()
    const [rental] = await db
      .insert(rentals)
      .values({
        customerId: fixtures.customer.id,
        dealerId: fixtures.dealer.dealerId,
        vehicleId: fixtures.vehicles[0].id,
        startDate: '2026-01-01',
        endDate: '2026-04-01',
        status: 'active',
        totalAmount: '9000',
        monthlyAmount: '3000',
        termMonths: 3,
      })
      .returning()

    const [first, second] = await Promise.all([
      extendRentalTerm({
        rentalId: rental.id,
        scope: { customerId: fixtures.customer.id },
        actor: { id: fixtures.customer.id, role: 'customer' },
        months: 2,
      }),
      extendRentalTerm({
        rentalId: rental.id,
        scope: { customerId: fixtures.customer.id },
        actor: { id: fixtures.customer.id, role: 'customer' },
        months: 2,
      }),
    ])

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)

    const [updated] = await db.select().from(rentals).where(eq(rentals.id, rental.id))
    expect(Number(updated.totalAmount)).toBe(21000)
    expect(updated.termMonths).toBe(7)

    const extensions = await db
      .select()
      .from(rentalExtensions)
      .where(eq(rentalExtensions.rentalId, rental.id))
    expect(extensions).toHaveLength(2)
  })

  it('sends a pre-due reminder after the exact trigger day was missed', async () => {
    const fixtures = await seedFixtures()
    const runDay = '2026-03-10'
    const dueDate = '2026-03-12'
    const triggerDay = addDays(dueDate, -3) // 2026-03-09

    expect(await isReminderStageDue(
      {
        dueDate,
        status: 'due',
      } as typeof invoices.$inferSelect,
      'pre_due_3',
      triggerDay
    )).toBe(true)
    expect(await isReminderStageDue(
      {
        dueDate,
        status: 'due',
      } as typeof invoices.$inferSelect,
      'pre_due_3',
      runDay
    )).toBe(true)

    const [rental] = await db
      .insert(rentals)
      .values({
        customerId: fixtures.customer.id,
        dealerId: fixtures.dealer.dealerId,
        vehicleId: fixtures.vehicles[0].id,
        startDate: runDay,
        endDate: dueDate,
        status: 'active',
        totalAmount: '3000',
        monthlyAmount: '3000',
        termMonths: 1,
      })
      .returning()

    await db.insert(invoices).values({
      ownerType: 'customer',
      ownerId: fixtures.customer.id,
      rentalId: rental.id,
      amount: '3000',
      status: 'due',
      dueDate,
      periodStart: runDay,
      periodEnd: dueDate,
      description: 'Monthly subscription',
    })

    vi.stubEnv('RESEND_API_KEY', '')
    expect(await sendInvoicePaymentReminders(runDay)).toBe(1)
    expect(await sendInvoicePaymentReminders(runDay)).toBe(0)
  })
})
