import { sqlClient } from '../db/index.js'
import { logStructured } from '../utils/requestContext.js'

/** Cross-instance mutex so job sweeps and admin payout batching never overlap. */
export const JOBS_ADVISORY_LOCK_KEY = 727401815

export function jobsIntervalMs(): number {
  const n = Number(process.env.JOBS_INTERVAL_MS)
  return Number.isFinite(n) && n >= 15_000 ? n : 5 * 60 * 1000
}

type ReservedConnection = Awaited<ReturnType<typeof sqlClient.reserve>>

/**
 * Releases the session lock on the connection that took it. If the unlock does
 * not report success the connection is terminated instead: a session advisory
 * lock dies with its session, so killing the backend is the only way to stop a
 * half-released lock from being handed back to the pool and wedging every
 * future sweep (the original production failure).
 */
async function releaseJobsAdvisoryLock(reserved: ReservedConnection): Promise<void> {
  try {
    const [row] = await reserved`SELECT pg_advisory_unlock(${JOBS_ADVISORY_LOCK_KEY}) AS unlocked`
    if (row?.unlocked === true) return
    logStructured('error', 'jobs.lock_release_unexpected', { key: JOBS_ADVISORY_LOCK_KEY })
  } catch (err) {
    logStructured('error', 'jobs.lock_release_failed', {
      key: JOBS_ADVISORY_LOCK_KEY,
      error: err instanceof Error ? err.message : String(err),
    })
  }
  try {
    await reserved`SELECT pg_terminate_backend(pg_backend_pid())`
  } catch {
    // Terminating our own backend makes this query fail — that is the point:
    // the session (and with it the advisory lock) is gone.
  }
}

/**
 * Runs fn while holding the Postgres advisory lock; returns null if the lock is
 * unavailable.
 *
 * pg advisory locks taken with pg_try_advisory_lock are SESSION-scoped and
 * sqlClient is a pool, so the lock must be taken and released on the same
 * physical connection: reserve() pins one for the duration and the finally
 * block always gives it back. The lock deliberately spans the whole callback
 * rather than a pg_try_advisory_xact_lock inside one transaction, because the
 * job sweep makes external HTTP calls (SkipCash reconciliation, Resend
 * delivery) and the individual jobs open their own transactions against the
 * pooled `db` handle — a single wrapping transaction would neither contain
 * their writes nor survive minutes of idle-in-transaction time.
 */
export async function runWithJobsAdvisoryLock<T>(fn: () => Promise<T>): Promise<T | null> {
  const reserved = await sqlClient.reserve()
  let locked = false
  try {
    const [lock] = await reserved`SELECT pg_try_advisory_lock(${JOBS_ADVISORY_LOCK_KEY}) AS locked`
    locked = lock?.locked === true
    if (!locked) return null
    return await fn()
  } finally {
    if (locked) await releaseJobsAdvisoryLock(reserved)
    reserved.release()
  }
}
