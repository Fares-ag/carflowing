import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  computeFirstPaymentAmount,
  computeMonthlyAmount,
  computeRentalWindow,
  computeServerRentalAmount,
  MAX_START_DATE_DAYS_AHEAD,
  sanitizeCartNoteForPersist,
  stripUntrustedPromoFields,
  TERM_DISCOUNTS,
  validateCartStartDate,
} from '../booking.js'
import { addDays, todayISO } from '../../utils/dates.js'

/** Pure-function QA for audit pricing hardening (no DB). */
describe('booking pricing helpers (audit QA)', () => {
  it('stripUntrustedPromoFields removes injected amounts but keeps a code', () => {
    const cart = {
      durationMonths: 3,
      promo: {
        code: 'SAVE50',
        promoCodeId: 'fake-id',
        discountAmount: 99999,
        listMonthlyAmount: 1,
      },
    }
    expect(stripUntrustedPromoFields(cart)).toEqual({
      durationMonths: 3,
      promo: { code: 'SAVE50' },
    })
  })

  it('stripUntrustedPromoFields drops promo entirely when no code', () => {
    const cart = {
      durationMonths: 2,
      promo: { discountAmount: 500, listMonthlyAmount: 10 },
    }
    expect(stripUntrustedPromoFields(cart)).toEqual({ durationMonths: 2 })
  })

  it('sanitizeCartNoteForPersist strips tampered promo from JSON notes', () => {
    const raw = JSON.stringify({
      durationMonths: 6,
      promo: { listMonthlyAmount: 1, discountAmount: 9999 },
    })
    const out = sanitizeCartNoteForPersist(raw)!
    const parsed = JSON.parse(out)
    expect(parsed.promo).toBeUndefined()
    expect(parsed.durationMonths).toBe(6)
  })

  it('sanitizeCartNoteForPersist leaves plain-text notes unchanged', () => {
    expect(sanitizeCartNoteForPersist('Need SUV')).toBe('Need SUV')
  })

  it('computeMonthlyAmount is pricePerDay × 30 for a 1-month term', () => {
    expect(computeMonthlyAmount(450)).toBe(13500)
    expect(computeMonthlyAmount(450, 1)).toBe(13500)
  })
})

/**
 * The customer app quotes `computeSubscriptionMonthly` from
 * packages/shared/src/subscription.ts. The server used to charge a flat
 * pricePerDay × 30 with no term argument, so every commitment longer than a
 * month was overcharged and the SkipCash hosted page showed a higher number
 * than the cart.
 */
describe('multi-month term discount (server-authoritative)', () => {
  it('charges a 12-month term 15% below pricePerDay × 30', () => {
    const list = 450 * 30
    expect(computeMonthlyAmount(450, 12)).toBe(Math.round(list * 0.85))
    expect(computeMonthlyAmount(450, 12)).toBe(11475)
    expect(computeMonthlyAmount(450, 12)).toBeLessThan(list)
  })

  it('applies the advertised discount at every published term', () => {
    expect(computeMonthlyAmount(450, 1)).toBe(13500)
    expect(computeMonthlyAmount(450, 3)).toBe(12825) // 5%
    expect(computeMonthlyAmount(450, 6)).toBe(12150) // 10%
    expect(computeMonthlyAmount(450, 9)).toBe(11880) // 12%
    expect(computeMonthlyAmount(450, 12)).toBe(11475) // 15%
  })

  it('the first online charge is the discounted first month, not the list price', () => {
    expect(computeFirstPaymentAmount(450, 12)).toBe(11475)
    expect(computeServerRentalAmount(450, { durationMonths: 12 })).toBe(11475 * 12)
  })

  it('a bogus client termMonths cannot widen the discount', () => {
    // Out-of-range / unlisted / non-numeric terms all fall back to the
    // undiscounted 1-month rate — never to a bigger discount.
    const list = 450 * 30
    expect(computeMonthlyAmount(450, 999)).toBe(list) // clamped to 24 → unlisted
    expect(computeMonthlyAmount(450, 24)).toBe(list)
    expect(computeMonthlyAmount(450, 0)).toBe(list)
    expect(computeMonthlyAmount(450, -12)).toBe(list)
    expect(computeMonthlyAmount(450, 'twelve')).toBe(list)
    expect(computeMonthlyAmount(450, null)).toBe(list)
    expect(computeMonthlyAmount(450, Infinity)).toBe(list)
    // A fractional term floors: 12.9 buys the 12-month rate, not more.
    expect(computeMonthlyAmount(450, 12.9)).toBe(11475)
    // 12.9 must not be read as "13 months" and certainly not as a deeper cut.
    expect(computeMonthlyAmount(450, 12.9)).toBeGreaterThan(Math.round(list * 0.8))
  })

  it('cart totals go through the same sanitizer as the term', () => {
    expect(computeServerRentalAmount(450, { durationMonths: 999 })).toBe(450 * 30 * 24)
    expect(computeServerRentalAmount(450, { durationMonths: 3, total: 1 })).toBe(12825 * 3)
  })

  it('stays identical to the shared table the customer app quotes', () => {
    // packages/shared is not reachable from the backend's module graph (its
    // `exports` map has no ./subscription subpath and the root pulls UI
    // assets), so pin the two tables by reading the source directly.
    const sharedPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../../packages/shared/src/subscription.ts'
    )
    const source = readFileSync(sharedPath, 'utf8')
    const shared = [...source.matchAll(/months:\s*(\d+),[^}]*discount:\s*([0-9.]+)/g)].map((m) => ({
      months: Number(m[1]),
      discount: Number(m[2]),
    }))
    expect(shared.length).toBeGreaterThan(0)
    expect(TERM_DISCOUNTS).toEqual(shared)
  })
})

/**
 * A start date outside the bookable window used to be silently clamped to
 * today at approval, handing the customer a different contract than the one
 * they agreed to — and billing them for it immediately.
 */
describe('start date validation', () => {
  const today = '2026-08-26'

  it('accepts today, and any date inside the window', () => {
    expect(validateCartStartDate({ startDate: today }, today)).toBeNull()
    expect(validateCartStartDate({ startDate: '2026-09-15' }, today)).toBeNull()
    expect(
      validateCartStartDate({ startDate: addDays(today, MAX_START_DATE_DAYS_AHEAD) }, today)
    ).toBeNull()
  })

  it('accepts a cart with no start date at all', () => {
    expect(validateCartStartDate({}, today)).toBeNull()
    expect(validateCartStartDate({ startDate: '' }, today)).toBeNull()
  })

  it('rejects a start date beyond the 90-day window instead of clamping it', () => {
    const tooFar = addDays(today, MAX_START_DATE_DAYS_AHEAD + 1)
    const error = validateCartStartDate({ startDate: tooFar }, today)
    expect(error).toContain(tooFar)
    expect(error).toContain('90 days')
    expect(validateCartStartDate({ startDate: '2030-01-01' }, today)).toBeTruthy()
  })

  it('rejects a start date in the past', () => {
    expect(validateCartStartDate({ startDate: '2026-08-24' }, today)).toMatch(/in the past/)
    expect(validateCartStartDate({ startDate: '2026-05-01' }, today)).toMatch(/in the past/)
  })

  it('tolerates one day of timezone slack, then anchors it to today', () => {
    // The cart picks "today" in the browser's timezone; the server bills in
    // Asia/Qatar, so yesterday's date across a midnight boundary is legitimate.
    expect(validateCartStartDate({ startDate: '2026-08-25' }, today)).toBeNull()
    expect(computeRentalWindow({ startDate: addDays(todayISO(), -1) }).startDate).toBe(todayISO())
  })

  it('rejects an unparseable start date', () => {
    expect(validateCartStartDate({ startDate: 'next tuesday' }, today)).toMatch(/not a valid date/)
  })

  it('computeRentalWindow still clamps legacy rows that predate the check', () => {
    const window = computeRentalWindow({ startDate: '2030-01-01', durationMonths: 3 })
    expect(window.startDate).toBe(todayISO())
  })
})
