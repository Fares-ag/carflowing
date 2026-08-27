import { and, count, desc, eq, lt, ne } from 'drizzle-orm'
import { db } from '../db/index.js'
import { appSettings, payments } from '../db/schema.js'
import { countDeadLetteredEmails } from './emailOutbox.js'
import { jobsIntervalMs } from './jobsLock.js'

const STUCK_PENDING_MINUTES = 30

/** A sweep this many intervals overdue means the scheduler is dead, not slow. */
const STALE_SWEEP_INTERVALS = 3

export async function countStuckPendingPayments(): Promise<number> {
  const stuckCutoff = new Date(Date.now() - STUCK_PENDING_MINUTES * 60 * 1000)
  const [row] = await db
    .select({ value: count() })
    .from(payments)
    .where(
      and(
        ne(payments.type, 'refund'),
        eq(payments.status, 'pending'),
        lt(payments.createdAt, stuckCutoff)
      )
    )
  return Number(row?.value ?? 0)
}

/** Payments captured at the provider that could not be applied locally (G-PAY). */
export async function countPaymentsNeedingRefund(): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(payments)
    .where(eq(payments.needsRefund, true))
  return Number(row?.value ?? 0)
}

export async function getLastJobsSweepAt(): Promise<Date | null> {
  const [row] = await db
    .select({ lastJobsSweepAt: appSettings.lastJobsSweepAt })
    .from(appSettings)
    .orderBy(desc(appSettings.updatedAt))
    .limit(1)
  return row?.lastJobsSweepAt ?? null
}

/** Age of the last completed sweep, or null when no sweep was ever recorded. */
export function jobsSweepAgeMs(lastJobsSweepAt: Date | null, now = Date.now()): number | null {
  if (!lastJobsSweepAt) return null
  return now - lastJobsSweepAt.getTime()
}

export function jobsStaleThresholdMs(): number {
  return STALE_SWEEP_INTERVALS * jobsIntervalMs()
}

/**
 * True when the scheduler has stopped sweeping. Computed purely from the stored
 * timestamp so /health reports it even though the in-sweep alarm — which only
 * fires when a sweep actually runs — never gets the chance to.
 */
export function isJobsSweepStale(lastJobsSweepAt: Date | null, now = Date.now()): boolean {
  const ageMs = jobsSweepAgeMs(lastJobsSweepAt, now)
  if (ageMs === null) return false
  return ageMs > jobsStaleThresholdMs()
}

/** Reads the stored sweep timestamp and answers the same question as isJobsSweepStale. */
export async function jobsAreStale(now = Date.now()): Promise<boolean> {
  return isJobsSweepStale(await getLastJobsSweepAt(), now)
}

export async function getJobsHealthMetrics(): Promise<{
  lastJobsSweepAt: Date | null
  stuckPendingCount: number
  needsRefundCount: number
  deadLetteredEmailCount: number
  jobsStale: boolean
  jobsStaleThresholdMs: number
}> {
  const [lastJobsSweepAt, stuckPendingCount, needsRefundCount, deadLetteredEmailCount] =
    await Promise.all([
      getLastJobsSweepAt(),
      countStuckPendingPayments(),
      countPaymentsNeedingRefund(),
      countDeadLetteredEmails(),
    ])
  return {
    lastJobsSweepAt,
    stuckPendingCount,
    needsRefundCount,
    deadLetteredEmailCount,
    jobsStale: isJobsSweepStale(lastJobsSweepAt),
    jobsStaleThresholdMs: jobsStaleThresholdMs(),
  }
}
