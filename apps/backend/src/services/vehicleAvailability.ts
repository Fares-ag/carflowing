import { and, count, eq, exists, gt, inArray, lte, gte, not, notExists, or, sql, type SQL } from 'drizzle-orm'
import { db } from '../db/index.js'
import { bookingRequests, payments, rentals, vehicles } from '../db/schema.js'
import { getPaymentHoldTtlMinutes } from './appSettings.js'
import type { DbOrTx } from './audit.js'

// A paused rental still holds the vehicle, so the catalog must not offer it.
const ACTIVE_RENTAL_STATUSES = ['reserved', 'active', 'paused', 'past_due'] as const

/**
 * How many vehicles one customer may hold at the same time. Every pending
 * booking request delists its vehicle for every other visitor, so without a
 * cap a single signed-up account can quietly take the whole published fleet
 * off the market (audit BLOCKER: fleet delisting). Small on purpose — real
 * customers subscribe to one car at a time.
 */
export const DEFAULT_MAX_ACTIVE_HOLDS_PER_CUSTOMER = 3

/**
 * How long a pay-at-shop request may keep a vehicle off the catalog while its
 * dealer decides. Much longer than the online-payment TTL: a human has to act.
 */
export const DEFAULT_DEALER_RESPONSE_SLA_HOURS = 72

function envPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.floor(n)
}

export function maxActiveHoldsPerCustomer(): number {
  return envPositiveInt('MAX_ACTIVE_HOLDS_PER_CUSTOMER', DEFAULT_MAX_ACTIVE_HOLDS_PER_CUSTOMER)
}

export function dealerResponseSlaHours(): number {
  return envPositiveInt('BOOKING_DEALER_RESPONSE_HOURS', DEFAULT_DEALER_RESPONSE_SLA_HOURS)
}

export function holdLimitMessage(limit: number): string {
  return `You already have ${limit} vehicle${limit === 1 ? '' : 's'} on hold. Complete or withdraw one of your pending booking requests before requesting another.`
}

/** Reason written on a hold auto-declined because the customer was over the cap. */
export const HOLD_LIMIT_DECLINE_REASON = 'Automatically released: too many simultaneous holds'

export interface HoldCutoffs {
  /** Online-payment holds created before this are dead. */
  payment: Date
  /** Pay-at-shop requests created before this are dead. */
  dealerDecision: Date
}

/**
 * Age thresholds past which a still-`pending` booking request no longer blocks
 * its vehicle. The payment TTL mirrors `releaseExpiredHolds`; the dealer SLA is
 * the separate, longer window that job does not yet implement.
 */
export async function getHoldCutoffs(now: Date = new Date()): Promise<HoldCutoffs> {
  const ttlMinutes = await getPaymentHoldTtlMinutes()
  return {
    payment: new Date(now.getTime() - ttlMinutes * 60 * 1000),
    dealerDecision: new Date(now.getTime() - dealerResponseSlaHours() * 60 * 60 * 1000),
  }
}

/**
 * A pending hold that still blocks its vehicle.
 *
 * Online holds follow the LATEST payment attempt, not the hold's creation, so
 * this agrees with `releaseExpiredHolds` (re-audit F9): a hold with a completed
 * capture or a fresh pending attempt stays live even when the row is old. Every
 * other pending request is a pay-at-shop hold and dies at the dealer SLA, so an
 * abandoned request can no longer delist a car forever (audit HIGH).
 */
export function holdIsLiveCondition(cutoffs: HoldCutoffs): SQL {
  const paymentKeepsHoldAlive = exists(
    db
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          eq(payments.bookingRequestId, bookingRequests.id),
          or(
            eq(payments.status, 'completed'),
            and(eq(payments.status, 'pending'), gt(payments.createdAt, cutoffs.payment))
          )
        )
      )
  )
  return or(
    and(
      eq(bookingRequests.awaitingPayment, true),
      or(gt(bookingRequests.createdAt, cutoffs.payment), paymentKeepsHoldAlive)
    ),
    and(
      eq(bookingRequests.awaitingPayment, false),
      gt(bookingRequests.createdAt, cutoffs.dealerDecision)
    )
  )!
}

/** A pending hold whose vehicle is already free again — the sweeper's target. */
export function holdIsExpiredCondition(cutoffs: HoldCutoffs): SQL {
  return not(holdIsLiveCondition(cutoffs))
}

/**
 * Predicate the hold-release job should sweep on.
 *
 * `releaseExpiredHolds` currently only looks at `awaitingPayment = true`, which
 * leaves abandoned pay-at-shop requests holding a vehicle until a human acts.
 * Selecting on this instead releases both kinds, each on its own SLA.
 */
export async function expiredHoldsCondition(now: Date = new Date()): Promise<SQL> {
  return and(eq(bookingRequests.status, 'pending'), holdIsExpiredCondition(await getHoldCutoffs(now)))!
}

/** Pending holds this customer owns that are still blocking vehicles. */
export async function countLiveHoldsForCustomer(
  executor: DbOrTx,
  customerId: string,
  cutoffs: HoldCutoffs
): Promise<number> {
  const [row] = await executor
    .select({ value: count() })
    .from(bookingRequests)
    .where(
      and(
        eq(bookingRequests.customerId, customerId),
        eq(bookingRequests.status, 'pending'),
        holdIsLiveCondition(cutoffs)
      )
    )
  return Number(row?.value ?? 0)
}

export interface HoldCapacity {
  allowed: boolean
  active: number
  limit: number
}

/** Cheap pre-flight check so an over-cap request never reaches the dealer. */
export async function checkCustomerHoldCapacity(customerId: string): Promise<HoldCapacity> {
  const limit = maxActiveHoldsPerCustomer()
  const active = await countLiveHoldsForCustomer(db, customerId, await getHoldCutoffs())
  return { allowed: active < limit, active, limit }
}

/**
 * Closes the race the pre-flight check cannot: N requests that all read "under
 * the cap" before any of their rows committed.
 *
 * Runs after the insert has committed and re-derives the whole picture rather
 * than judging one row: the customer's live holds are ordered by
 * `(created_at, id)` — a total order every caller agrees on — and everything
 * past the cap is declined under `FOR UPDATE`. A hold within the cap can never
 * be declined (the number of holds older than it only ever falls), and the
 * reconciliation that runs last necessarily observes every committed hold — it
 * cannot be the last one if another insert commits after it — so the cap holds
 * however many requests are fired in parallel.
 *
 * Returns true when THIS hold was released, i.e. the caller must answer 409.
 */
export async function releaseHoldExceedingCap(
  customerId: string,
  bookingRequestId: string
): Promise<boolean> {
  const limit = maxActiveHoldsPerCustomer()
  const cutoffs = await getHoldCutoffs()
  return db.transaction(async (tx) => {
    const excess = await tx
      .select({ id: bookingRequests.id })
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.customerId, customerId),
          eq(bookingRequests.status, 'pending'),
          holdIsLiveCondition(cutoffs)
        )
      )
      .orderBy(bookingRequests.createdAt, bookingRequests.id)
      .limit(1000)
      .offset(limit)
      .for('update')
    if (excess.length === 0) return false

    await tx
      .update(bookingRequests)
      .set({
        status: 'declined',
        awaitingPayment: false,
        declineReason: HOLD_LIMIT_DECLINE_REASON,
      })
      .where(
        and(
          inArray(
            bookingRequests.id,
            excess.map((row) => row.id)
          ),
          eq(bookingRequests.status, 'pending')
        )
      )
    return excess.some((row) => row.id === bookingRequestId)
  })
}

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

/** Another customer's live hold covers the requested start date. */
export function pendingHoldBlocksDateCondition(
  startDate: string,
  cutoffs: HoldCutoffs,
  viewerId?: string
): SQL {
  const foreignHold = viewerId ? not(eq(bookingRequests.customerId, viewerId)) : sql`true`

  return notExists(
    db
      .select({ id: bookingRequests.id })
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.vehicleId, vehicles.id),
          eq(bookingRequests.status, 'pending'),
          holdIsLiveCondition(cutoffs),
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

/** Live hold on this vehicle, optionally excluding the viewer's own. */
export function vehicleHasLiveHoldCondition(cutoffs: HoldCutoffs, viewerId?: string): SQL {
  return and(
    eq(bookingRequests.vehicleId, vehicles.id),
    eq(bookingRequests.status, 'pending'),
    holdIsLiveCondition(cutoffs),
    ...(viewerId ? [not(eq(bookingRequests.customerId, viewerId))] : [])
  )!
}

export async function buildVehicleCatalogFilter(
  viewerId?: string,
  startDate?: string
): Promise<SQL> {
  const available = eq(vehicles.status, 'available')
  const cutoffs = await getHoldCutoffs()

  if (!startDate) {
    const noPending = notExists(
      db
        .select({ id: bookingRequests.id })
        .from(bookingRequests)
        .where(vehicleHasLiveHoldCondition(cutoffs))
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
    pendingHoldBlocksDateCondition(startDate, cutoffs, viewerId)
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
