import type { Express } from 'express'
import request from 'supertest'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { buildTestApp, resetDb, seedFixtures } from '../../test/helpers.js'

const generateDueInvoices = vi.fn()
const markOverdueInvoices = vi.fn()
const sendInvoicePaymentReminders = vi.fn()
const reconcilePendingSkipCashPayments = vi.fn()
const releaseExpiredHolds = vi.fn()
const generateDealerPayouts = vi.fn()
const recordDailyRollups = vi.fn()

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
    await resetDb()
  })

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
})
