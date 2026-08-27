/** Date helpers for billing math. All dates are 'YYYY-MM-DD' strings (DB `date`). */

const DEFAULT_BILLING_TZ = 'Asia/Qatar'

/** IANA timezone for subscription billing day boundaries (Qatar market default). */
export function billingTimezone(): string {
  const tz = process.env.BILLING_TIMEZONE?.trim()
  return tz || DEFAULT_BILLING_TZ
}

/** Today's calendar date in the billing timezone as YYYY-MM-DD. */
export function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: billingTimezone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function tzOffsetMinutes(at: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts: Record<string, string> = {}
  for (const part of dtf.formatToParts(at)) {
    if (part.type !== 'literal') parts[part.type] = part.value
  }
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  )
  return (asUtc - at.getTime()) / 60000
}

/**
 * UTC instant of midnight on `dateISO` in the billing timezone. Day-bucketed
 * reporting keys off the local calendar date, so using UTC midnight would
 * shift every bucket by the zone offset (3h for Asia/Qatar).
 */
export function zonedDayStartUtc(dateISO: string): Date {
  const guess = new Date(`${dateISO}T00:00:00.000Z`)
  const offset = tzOffsetMinutes(guess, billingTimezone())
  return new Date(guess.getTime() - offset * 60000)
}
function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate()
}

/**
 * Add calendar months with end-of-month clamping (Jan 31 + 1mo = Feb 28/29),
 * matching how subscription anchors behave in mainstream billing systems.
 */
export function addMonths(dateISO: string, months: number): string {
  const [y, m, d] = dateISO.split('-').map((v) => parseInt(v, 10))
  const targetMonth0 = m - 1 + months
  const targetYear = y + Math.floor(targetMonth0 / 12)
  const normalizedMonth0 = ((targetMonth0 % 12) + 12) % 12
  const day = Math.min(d, daysInMonth(targetYear, normalizedMonth0))
  const dt = new Date(Date.UTC(targetYear, normalizedMonth0, day))
  return dt.toISOString().slice(0, 10)
}

export function addDays(dateISO: string, days: number): string {
  const dt = new Date(`${dateISO}T00:00:00Z`)
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

/** Whole calendar days from startISO up to (but not including) endISO when end > start; else 0. */
export function daysBetween(startISO: string, endISO: string): number {
  const start = new Date(`${startISO}T00:00:00Z`).getTime()
  const end = new Date(`${endISO}T00:00:00Z`).getTime()
  const diff = Math.round((end - start) / 86_400_000)
  return diff > 0 ? diff : 0
}

/** Calendar date (YYYY-MM-DD) for an instant in the billing timezone. */
export function dateInBillingTz(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: billingTimezone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/** ISO date comparison works lexically for 'YYYY-MM-DD'. */
export function isOnOrBefore(a: string, b: string): boolean {
  return a <= b
}

export function maxDate(a: string, b: string): string {
  return a >= b ? a : b
}

/**
 * Billing boundaries are ALWAYS computed from the subscription's original
 * anchor (start date) as addMonths(anchor, k) — never by iterating
 * addMonths on already-clamped output, which loses the month-end anchor
 * (Jan 31 → Feb 28 → *Mar 28* drift; re-audit finding L1).
 */
export function nextBoundaryOnOrAfter(anchorISO: string, fromISO: string): string {
  let k = 0
  let boundary = anchorISO
  while (boundary < fromISO && k < 1200) {
    k += 1
    boundary = addMonths(anchorISO, k)
  }
  return boundary
}

/** The anchor boundary strictly after the given date. */
export function nextBoundaryAfter(anchorISO: string, dateISO: string): string {
  return nextBoundaryOnOrAfter(anchorISO, addDays(dateISO, 1))
}
