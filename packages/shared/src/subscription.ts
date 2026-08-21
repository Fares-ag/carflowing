import { computeMonthlyPrice } from './utils.js'

/**
 * Minimum subscription terms at checkout — invygo-style (1–9 months) plus
 * FINN-style longer commitments (12 months) for better monthly rates.
 */
export const SUBSCRIPTION_DURATION_OPTIONS = [
  { months: 1, label: '1 month', discount: 0 },
  { months: 3, label: '3 months', discount: 0.05 },
  { months: 6, label: '6 months', discount: 0.1 },
  { months: 9, label: '9 months', discount: 0.12 },
  { months: 12, label: '12 months', discount: 0.15 },
] as const

/** Consistent subscription pricing labels across customer funnel pages. */
export const SUBSCRIPTION_PRICING_LABELS = {
  monthly: 'All-inclusive monthly',
  dueToday: 'Due today (first month)',
  minimumTerm: (months: number) => `${months}-month minimum`,
} as const

/** All-inclusive monthly subscription value props (invygo/FINN positioning). */
export const SUBSCRIPTION_VALUE_PROPS = [
  'One monthly fee — insurance & maintenance via your dealer',
  'Swap to another car after 30 days (same dealer fleet)',
  'Cancel with 30-day notice after your minimum term',
  'Pay first month online or at pickup — renews monthly after that',
] as const

export function durationOption(months: number) {
  return (
    SUBSCRIPTION_DURATION_OPTIONS.find((o) => o.months === months) ??
    SUBSCRIPTION_DURATION_OPTIONS[0]
  )
}

/** Monthly subscription price for a vehicle (server uses pricePerDay × 30). */
export function computeSubscriptionMonthly(
  pricePerDay: number,
  durationMonths = 1
): number {
  const opt = durationOption(durationMonths)
  return computeMonthlyPrice(pricePerDay, opt.discount)
}

/** First month due at checkout (online) or at pickup — matches billing engine. */
export function computeFirstMonthDue(
  pricePerDay: number,
  durationMonths = 1
): { monthly: number; total: number } {
  const monthly = computeSubscriptionMonthly(pricePerDay, durationMonths)
  return { monthly, total: monthly }
}

/** Minimum-term total for display (not charged upfront on SkipCash — first month only). */
export function computeMinimumTermTotal(
  pricePerDay: number,
  durationMonths: number
): { subtotal: number; total: number } {
  const monthly = computeSubscriptionMonthly(pricePerDay, durationMonths)
  const subtotal = monthly * durationMonths
  return { subtotal, total: subtotal }
}
