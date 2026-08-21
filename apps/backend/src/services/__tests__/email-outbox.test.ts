import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/index.js'
import { emailOutbox } from '../../db/schema.js'
import { resetDb, seedFixtures } from '../../test/helpers.js'
import {
  enqueueEmail,
  MAX_EMAIL_ATTEMPTS,
  processEmailOutbox,
  tryDeliverOutboxRow,
} from '../emailOutbox.js'

describe('emailOutbox', () => {
  afterEach(async () => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    await resetDb()
  })

  it('MAIL-01: enqueue creates a pending outbox row', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const id = await enqueueEmail({
      to: 'user@test.dev',
      subject: 'Hello',
      html: '<p>secret link</p>',
    })
    const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, id))
    expect(row).toMatchObject({
      to: 'user@test.dev',
      subject: 'Hello',
      status: 'pending',
      attempts: 0,
    })
  })

  it('MAIL-02: dev delivery without API key marks row sent without logging HTML', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    vi.stubEnv('NODE_ENV', 'test')
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const { sendEmail } = await import('../mail.js')
    const id = await sendEmail({ to: 'a@test.dev', subject: 'Hi', html: '<p>reset-token</p>' })
    const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, id))
    expect(row.status).toBe('sent')
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('reset-token'))
    log.mockRestore()
  })

  it('MAIL-03: failed send stays pending with error and retries after backoff', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test')
    vi.stubEnv('FROM_EMAIL', 'noreply@test.dev')
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => 'upstream error',
    } as Response)

    const id = await enqueueEmail({ to: 'a@test.dev', subject: 'Retry me', html: '<p>x</p>' })
    expect(await tryDeliverOutboxRow(id, true)).toBe('pending')

    let [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, id))
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(1)
    expect(row.lastError).toContain('502')

    await db
      .update(emailOutbox)
      .set({ nextAttemptAt: new Date(Date.now() - 1000) })
      .where(eq(emailOutbox.id, id))

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '{}',
    } as Response)
    expect(await processEmailOutbox()).toBe(1)

    ;[row] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, id))
    expect(row.status).toBe('sent')
    fetchMock.mockRestore()
  })

  it('MAIL-04: max attempts moves row to failed dead-letter', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test')
    vi.stubEnv('FROM_EMAIL', 'noreply@test.dev')
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'fail',
    } as Response)

    const id = await enqueueEmail({ to: 'dead@test.dev', subject: 'Nope', html: '<p>x</p>' })
    for (let i = 0; i < MAX_EMAIL_ATTEMPTS; i += 1) {
      await tryDeliverOutboxRow(id, true)
    }
    const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, id))
    expect(row.status).toBe('failed')
    expect(row.attempts).toBe(MAX_EMAIL_ATTEMPTS)
  })

  it('MAIL-06: invoice reminder dedup row only after successful enqueue', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const fixtures = await seedFixtures()
    const { invoices, invoiceReminderSends, rentals } = await import('../../db/schema.js')
    const { addDays, todayISO } = await import('../../utils/dates.js')
    const now = todayISO()
    const dueDate = addDays(now, 3)

    const [rental] = await db
      .insert(rentals)
      .values({
        customerId: fixtures.customer.id,
        dealerId: fixtures.dealer.dealerId,
        vehicleId: fixtures.vehicles[0].id,
        startDate: now,
        endDate: addDays(now, 30),
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
      status: 'due',
      dueDate,
      periodStart: now,
      periodEnd: addDays(now, 30),
      description: 'Monthly subscription',
    })

    const { sendInvoicePaymentReminders } = await import('../invoiceReminders.js')
    expect(await sendInvoicePaymentReminders(now)).toBe(1)

    const dedup = await db.select().from(invoiceReminderSends)
    expect(dedup).toHaveLength(1)

    const outbox = await db.select().from(emailOutbox)
    expect(outbox).toHaveLength(1)
    expect(outbox[0].status).toBe('sent')

    expect(await sendInvoicePaymentReminders(now)).toBe(0)
    expect(await db.select().from(invoiceReminderSends)).toHaveLength(1)
  })
})
