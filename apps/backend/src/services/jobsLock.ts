import { sqlClient } from '../db/index.js'

/** Cross-instance mutex so job sweeps and admin payout batching never overlap. */
export const JOBS_ADVISORY_LOCK_KEY = 727401815

/** Runs fn while holding the Postgres advisory lock; returns null if lock unavailable. */
export async function runWithJobsAdvisoryLock<T>(fn: () => Promise<T>): Promise<T | null> {
  const reserved = await sqlClient.reserve()
  try {
    const [lock] = await reserved`SELECT pg_try_advisory_lock(${JOBS_ADVISORY_LOCK_KEY}) AS locked`
    if (!lock?.locked) return null
    try {
      return await fn()
    } finally {
      await reserved`SELECT pg_advisory_unlock(${JOBS_ADVISORY_LOCK_KEY})`
    }
  } finally {
    reserved.release()
  }
}
