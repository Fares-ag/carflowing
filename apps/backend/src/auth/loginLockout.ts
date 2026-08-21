import type { Response } from 'express'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { profiles } from '../db/schema.js'

export const LOGIN_LOCKOUT_THRESHOLD = 5

/** Exponential lockout after threshold failures (1m, 2m, 4m … capped at 24h). */
export function loginLockoutDurationMs(failedAttempts: number): number {
  if (failedAttempts < LOGIN_LOCKOUT_THRESHOLD) return 0
  const exponent = failedAttempts - LOGIN_LOCKOUT_THRESHOLD
  return Math.min(60_000 * 2 ** exponent, 24 * 60 * 60_000)
}

export function isAccountLocked(lockedUntil: Date | null | undefined, now = new Date()): boolean {
  return !!lockedUntil && lockedUntil.getTime() > now.getTime()
}

export function sendAccountLocked(res: Response, lockedUntil: Date): void {
  const retryAfterSeconds = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000))
  res.setHeader('Retry-After', String(retryAfterSeconds))
  res.status(423).json({
    error: 'Account temporarily locked due to too many failed login attempts',
    retryAfterSeconds,
  })
}

export async function recordFailedLoginAttempt(userId: string): Promise<Date | null> {
  const [existing] = await db
    .select({ attempts: profiles.failedLoginAttempts })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1)
  if (!existing) return null

  const attempts = existing.attempts + 1
  const lockMs = loginLockoutDurationMs(attempts)
  const lockedUntil = lockMs > 0 ? new Date(Date.now() + lockMs) : null

  await db
    .update(profiles)
    .set({
      failedLoginAttempts: attempts,
      lockedUntil,
    })
    .where(eq(profiles.id, userId))

  return lockedUntil
}

export async function resetLoginAttempts(userId: string): Promise<void> {
  await db
    .update(profiles)
    .set({ failedLoginAttempts: 0, lockedUntil: null })
    .where(eq(profiles.id, userId))
}
