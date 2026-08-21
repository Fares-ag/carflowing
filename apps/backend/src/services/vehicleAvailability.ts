import { and, eq, exists, inArray, lte, gte, not, notExists, or, sql, type SQL } from 'drizzle-orm'
import { db } from '../db/index.js'
import { bookingRequests, rentals, vehicles } from '../db/schema.js'

const ACTIVE_RENTAL_STATUSES = ['reserved', 'active', 'past_due'] as const

export function parseCatalogStartDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined
  if (Number.isNaN(Date.parse(`${trimmed}T00:00:00Z`))) return undefined
  return trimmed
}

/** Active rental window covers the requested calendar day. */
export function rentalBlocksDateCondition(startDate: string): SQL {
  return notExists(
    db
      .select({ id: rentals.id })
      .from(rentals)
      .where(
        and(
          eq(rentals.vehicleId, vehicles.id),
          inArray(rentals.status, [...ACTIVE_RENTAL_STATUSES]),
          lte(rentals.startDate, startDate),
          gte(sql`COALESCE(${rentals.cancellationEffectiveDate}, ${rentals.endDate})`, startDate)
        )
      )
  )!
}

const pendingStartExpr = sql<string>`substring(${bookingRequests.note} from '"startDate"\\s*:\\s*"([0-9]{4}-[0-9]{2}-[0-9]{2})"')`
const pendingMonthsExpr = sql<number>`GREATEST(COALESCE(NULLIF(substring(${bookingRequests.note} from '"durationMonths"\\s*:\\s*([0-9]+)'), '')::int, 1), 1)`

/** Another customer's pending hold covers the requested start date. */
export function pendingHoldBlocksDateCondition(startDate: string, viewerId?: string): SQL {
  const foreignHold = viewerId ? not(eq(bookingRequests.customerId, viewerId)) : sql`true`

  return notExists(
    db
      .select({ id: bookingRequests.id })
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.vehicleId, vehicles.id),
          eq(bookingRequests.status, 'pending'),
          foreignHold,
          or(
            sql`${bookingRequests.note} IS NULL`,
            sql`trim(${bookingRequests.note}) = ''`,
            sql`${bookingRequests.note} NOT LIKE '{%'`,
            sql`${pendingStartExpr} IS NULL`,
            and(
              sql`${pendingStartExpr}::date <= ${startDate}::date`,
              sql`(${pendingStartExpr}::date + (${pendingMonthsExpr} || ' months')::interval - interval '1 day')::date >= ${startDate}::date`
            )
          )
        )
      )
  )!
}

export function buildVehicleCatalogFilter(viewerId?: string, startDate?: string): SQL {
  const available = eq(vehicles.status, 'available')

  if (!startDate) {
    const noPending = notExists(
      db
        .select({ id: bookingRequests.id })
        .from(bookingRequests)
        .where(and(eq(bookingRequests.vehicleId, vehicles.id), eq(bookingRequests.status, 'pending')))
    )
    if (!viewerId) {
      return and(available, noPending)!
    }
    const ownPending = exists(
      db
        .select({ id: bookingRequests.id })
        .from(bookingRequests)
        .where(
          and(
            eq(bookingRequests.vehicleId, vehicles.id),
            eq(bookingRequests.status, 'pending'),
            eq(bookingRequests.customerId, viewerId)
          )
        )
    )
    return and(available, or(noPending, ownPending))!
  }

  const dateAvailable = and(
    rentalBlocksDateCondition(startDate),
    pendingHoldBlocksDateCondition(startDate, viewerId)
  )

  if (!viewerId) {
    return and(available, dateAvailable)!
  }

  const ownPending = exists(
    db
      .select({ id: bookingRequests.id })
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.vehicleId, vehicles.id),
          eq(bookingRequests.status, 'pending'),
          eq(bookingRequests.customerId, viewerId)
        )
      )
  )

  return and(available, or(dateAvailable, ownPending))!
}
