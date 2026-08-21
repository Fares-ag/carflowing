import { afterEach, describe, expect, it, vi } from 'vitest'
import { addDays, billingTimezone, todayISO } from '../dates.js'

describe('billing dates', () => {
  afterEach(() => {
    vi.useRealTimers()
    delete process.env.BILLING_TIMEZONE
  })

  it('defaults billing timezone to Asia/Qatar', () => {
    expect(billingTimezone()).toBe('Asia/Qatar')
  })

  it('todayISO uses BILLING_TIMEZONE for the calendar day', () => {
    process.env.BILLING_TIMEZONE = 'Asia/Qatar'
    // 2026-08-14 22:00 UTC = 2026-08-15 01:00 in Qatar (UTC+3)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-14T22:00:00.000Z'))
    expect(todayISO()).toBe('2026-08-15')
  })

  it('addDays stays stable on YYYY-MM-DD strings', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
  })
})
