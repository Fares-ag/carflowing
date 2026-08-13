/** Default sales tax rate applied at checkout. 0 = tax-free by default. */
export const DEFAULT_TAX_RATE = 0

export function computeTax(subtotal: number, rate: number = DEFAULT_TAX_RATE): number {
  if (rate <= 0 || subtotal <= 0) return 0
  return Math.round(subtotal * rate)
}

export function formatTaxRatePercent(rate: number = DEFAULT_TAX_RATE): string {
  const pct = rate * 100
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`
}
