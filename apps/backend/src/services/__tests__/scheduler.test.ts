import { desc, eq } from 'drizzle-orm'
import type { Express } from 'express'
import request from 'supertest'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/index.js'
import { appSettings, emailOutbox, payments, refreshSessions } from '../../db/schema.js'
import { buildTestApp, resetDb, seedFixtures } from '../../test/helpers.js'
import { isJobsSweepStale, jobsAreStale, jobsStaleThresholdMs } from '../healthMetrics.js'

const generateDueInvoices = vi.fn()
const markOverdueInvoices = vi.fn()
const sendInvoicePaymentReminders = vi.fn()
const reconcilePendingSkipCashPayments = vi.fn()
const releaseExpiredHolds = vi.fn()
const generateDealerPayouts = vi.fn()
const recordDailyRollups = vi.fn()
const purgeOldAnalyticsEvents = vi.fn()

vi.mock('../billing.js', () => ({
  generateDueInvoices: (...args: unknown[]) => generateDueInvoices(...args),
  markOverdueInvoices: (...args: unknown[]) => markOverdueInvoices(...args),
  releaseExpiredHolds: (...args: unknown[]) => releaseExpiredHolds(...args),
}))

vi.mock('../invoiceReminders.js', () => ({
  sendInvoicePaymentReminders: (...args: unknown[]) => sendInvoicePaymentReminders(...args),
}))

vi.mock('../reconciliation.js', () => ({
  reconcilePendingSkipCashPayments: (...args: unknown[]) => reconcilePendingSkipCashPayments(...args),
}))

vi.mock('../payouts.js', () => ({
  generateDealerPayouts: (...args: unknown[]) => generateDealerPayouts(...args),
}))

vi.mock('../analyticsRollups.js', () => ({
  recordDailyRollups: (...args: unknown[]) => recordDailyRollups(...args),
  purgeOldAnalyticsEvents: (...args: unknown[]) => purgeOldAnalyticsEvents(...args),
}))

describe('Scheduler', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    generateDueInvoices.mockReset()
    markOverdueInvoices.mockReset()
    sendInvoicePaymentReminders.mockReset()
    reconcilePendingSkipCashPayments.mockReset()
    releaseExpiredHolds.mockReset()
    generateDealerPayouts.mockReset()
    recordDailyRollups.mockReset()
    purgeOldAnalyticsEvents.mockReset()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    await resetDb()
  })

  function mockAllJobsIdle() {
    generateDueInvoices.mockResolvedValue(0)
    markOverdueInvoices.mockResolvedValue(0)
    sendInvoicePaymentReminders.mockResolvedValue(0)
    reconcilePendingSkipCashPayments.mockResolvedValue(0)
    releaseExpiredHolds.mockResolvedValue(0)
    generateDealerPayouts.mockResolvedValue(0)
    recordDailyRollups.mockResolvedValue(undefined)
    purgeOldAnalyticsEvents.mockResolvedValue(0)
  }

  it('JOBS-01: continues sweep when an individual job throws', async () => {
    await seedFixtures()
    generateDueInvoices.mockRejectedValue(new Error('invoice generation failed'))
    markOverdueInvoices.mockResolvedValue(3)
    sendInvoicePaymentReminders.mockResolvedValue(0)
    reconcilePendingSkipCashPayments.mockResolvedValue(0)
    releaseExpiredHolds.mockResolvedValue(0)
    generateDealerPayouts.mockResolvedValue(0)
    recordDailyRollups.mockResolvedValue(undefined)

    const { runJobsOnce } = await import('../scheduler.js')
    const result = await runJobsOnce()

    expect(result).not.toBeNull()
    expect(result?.invoices).toBe(0)
    expect(result?.overdue).toBe(3)
    expect(generateDueInvoices).toHaveBeenCalled()
    expect(markOverdueInvoices).toHaveBeenCalled()
    expect(recordDailyRollups).toHaveBeenCalled()
  })

  it('JOBS-02: /health exposes lastJobsSweepAt and stuckPendingCount', async () => {
    await seedFixtures()
    generateDueInvoices.mockResolvedValue(0)
    markOverdueInvoices.mockResolvedValue(0)
    sendInvoicePaymentReminders.mockResolvedValue(0)
    reconcilePendingSkipCashPayments.mockResolvedValue(0)
    releaseExpiredHolds.mockResolvedValue(0)
    generateDealerPayouts.mockResolvedValue(0)
    recordDailyRollups.mockResolvedValue(undefined)

    const { runJobsOnce } = await import('../scheduler.js')
    await runJobsOnce()

    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.lastJobsSweepAt).toBeTruthy()
    expect(String(res.body.lastJobsSweepAt)).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(typeof res.body.stuckPendingCount).toBe('number')
  })

  it('JOBS-03: jobs staleness is computed from the stored timestamp, not from a sweep', async () => {
    await seedFixtures()
    const threshold = jobsStaleThresholdMs()

    // Pure predicate: no sweep has to run for the alarm to be true.
    expect(isJobsSweepStale(new Date(Date.now() - threshold - 1000))).toBe(true)
    expect(isJobsSweepStale(new Date(Date.now() - 1000))).toBe(false)
    expect(isJobsSweepStale(null)).toBe(false)

    const [row] = await db
      .select({ id: appSettings.id })
      .from(appSettings)
      .orderBy(desc(appSettings.updatedAt))
      .limit(1)
    await db
      .update(appSettings)
      .set({ lastJobsSweepAt: new Date(Date.now() - threshold - 60_000) })
      .where(eq(appSettings.id, row.id))
    expect(await jobsAreStale()).toBe(true)

    await db
      .update(appSettings)
      .set({ lastJobsSweepAt: new Date() })
      .where(eq(appSettings.id, row.id))
    expect(await jobsAreStale()).toBe(false)
  })

  it('JOBS-04: captured-but-unusable payments raise an error-level alert after the sweep', async () => {
    const fixtures = await seedFixtures()
    mockAllJobsIdle()
    await db.insert(payments).values({
      customerId: fixtures.customer.id,
      amount: '450',
      status: 'completed',
      type: 'rental',
      needsRefund: true,
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const { runJobsOnce } = await import('../scheduler.js')
    await runJobsOnce()

    const logged = errorSpy.mock.calls.map((args) => args.join(' ')).join('\n')
    expect(logged).toContain('jobs.alert.needs_refund')
    expect(logged).toContain('"needsRefundCount":1')
    errorSpy.mockRestore()
  })

  it('JOBS-05: retention sweep drops settled mail and expired sessions, never audit logs', async () => {
    const fixtures = await seedFixtures()
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)

    const [mail] = await db
      .insert(emailOutbox)
      .values({ to: 'a@test.dev', subject: 'Old', html: '', status: 'sent', createdAt: old })
      .returning({ id: emailOutbox.id })
    await db.insert(refreshSessions).values({
      userId: fixtures.customer.id,
      jtiHash: 'expired-session-hash',
      expiresAt: old,
    })

    const { runRetentionSweep } = await import('../scheduler.js')
    const result = await runRetentionSweep()

    expect(result.emailOutboxPurged).toBe(1)
    expect(result.authArtifactsPurged).toBe(1)
    expect(await db.select().from(emailOutbox).where(eq(emailOutbox.id, mail.id))).toHaveLength(0)
    expect(await db.select().from(refreshSessions)).toHaveLength(0)
  })
})
