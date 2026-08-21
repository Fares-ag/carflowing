import type { VehicleCategory } from './types'

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })
}

/** Nullable-safe date formatting for tables and detail rows. */
export function formatDateOrDash(value?: string | Date | null): string {
  if (value == null || value === '') return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  return Number.isNaN(d.getTime()) ? '—' : formatDate(d)
}

/** Date + time for activity feeds and dashboards. */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatCurrency(amount: number, currency: string = 'QAR'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

export const VEHICLE_CATEGORY_LABELS: Record<VehicleCategory, string> = {
  sedan: 'Sedan',
  suv: 'SUV',
  truck: 'Truck',
  luxury: 'Luxury',
  ev: 'Electric',
  other: 'Other',
}

/** Single source of truth for mapping a vehicle's DB category to its display label. */
export function vehicleCategoryLabel(category: VehicleCategory): string {
  return VEHICLE_CATEGORY_LABELS[category] ?? 'Other'
}

/**
 * CarFlow rents by the month, at a discount for longer commitments. Both the
 * cart and any other page quoting a monthly price must go through this
 * helper so the numbers agree everywhere.
 */
export function computeMonthlyPrice(pricePerDay: number, discount = 0): number {
  return Math.round(pricePerDay * 30 * (1 - discount))
}

/** Matches server-side rental charge (pricePerDay × 30 × months). */
export function computeRentalTotal(pricePerDay: number, durationMonths: number): number {
  const months = durationMonths > 0 ? durationMonths : 1
  return Math.round(Number(pricePerDay) * 30 * months)
}

/** Default pickup: tomorrow, or next Monday after Fri/Sat/Sun. */
export function defaultRentalStartDate(from = new Date()): string {
  const d = new Date(from)
  const day = d.getDay()
  if (day === 5) d.setDate(d.getDate() + 3)
  else if (day === 6) d.setDate(d.getDate() + 2)
  else if (day === 0) d.setDate(d.getDate() + 1)
  else d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function whatsAppLink(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, '')
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}
