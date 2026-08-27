import { describe, expect, it } from 'vitest'
import {
  SUBSCRIPTION_DURATION_OPTIONS,
  computeFirstMonthDue,
  computeMinimumTermTotal,
  computeMonthlyPrice,
  computeRentalTotal,
  computeSubscriptionMonthly,
  durationOption,
} from '../pricing.js'

/**
 * `@carflow/shared/pricing` is the Node-safe entrypoint the Express API imports
 * so server and client can never quote different monthly prices. These tests pin
 * the surface (a missing export breaks the API build) and the rounding, not new
 * behaviour — the discount table itself lives in subscription.ts.
 */
describe('pricing entrypoint (@carflow/shared/pricing)', () => {
  it('re-exports every helper the backend needs', () => {
    expect(typeof computeSubscriptionMonthly).toBe('function')
    expect(typeof computeMonthlyPrice).toBe('function')
    expect(typeof computeRentalTotal).toBe('function')
    expect(typeof computeFirstMonthDue).toBe('function')
    expect(typeof computeMinimumTermTotal).toBe('function')
    expect(typeof durationOption).toBe('function')
    expect(SUBSCRIPTION_DURATION_OPTIONS.length).toBeGreaterThan(0)
  })

  it('quotes pricePerDay x 30 less the term discount, rounded to whole QAR', () => {
    // 121 x 30 = 3630; the 5% three-month discount lands on a fraction.
    expect(computeSubscriptionMonthly(121, 1)).toBe(3630)
    expect(computeSubscriptionMonthly(121, 3)).toBe(Math.round(3630 * 0.95))
    expect(computeSubscriptionMonthly(121, 12)).toBe(Math.round(3630 * 0.85))
  })

  it('falls back to the 1-month rate for a term that is not sold', () => {
    expect(computeSubscriptionMonthly(100, 7)).toBe(computeSubscriptionMonthly(100, 1))
    expect(durationOption(7).months).toBe(1)
  })

  it('charges only the first month up front', () => {
    const due = computeFirstMonthDue(150, 6)
    expect(due.monthly).toBe(computeSubscriptionMonthly(150, 6))
    expect(due.total).toBe(due.monthly)
  })

  it('minimum-term total is the discounted monthly times the term', () => {
    const monthly = computeSubscriptionMonthly(150, 6)
    expect(computeMinimumTermTotal(150, 6)).toEqual({ subtotal: monthly * 6, total: monthly * 6 })
  })

  it('every sold term has a discount between 0 and 1', () => {
    for (const option of SUBSCRIPTION_DURATION_OPTIONS) {
      expect(option.months).toBeGreaterThan(0)
      expect(option.discount).toBeGreaterThanOrEqual(0)
      expect(option.discount).toBeLessThan(1)
    }
  })
})
