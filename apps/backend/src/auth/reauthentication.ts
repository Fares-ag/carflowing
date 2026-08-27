import { eq } from 'drizzle-orm'
import type { Response } from 'express'
import { db } from '../db/index.js'
import { profiles, userSecurity } from '../db/schema.js'
import type { AuthedRequest } from '../middleware/auth.js'
import { verifyTotp } from '../services/totp.js'
import { verifyPassword } from './password.js'

/**
 * Step-up authentication for irreversible actions (account deletion, and any
 * other "prove it is really you" gate). A stolen or borrowed session must not
 * be enough on its own, so the caller re-proves possession of the password or
 * of the enrolled authenticator.
 *
 * Failures are throttled per user in process memory — the same store
 * `express-rate-limit` uses in app.ts — so the gate cannot be brute-forced and
 * the destructive action behind it cannot be hammered.
 */
export const REAUTH_MAX_ATTEMPTS = 5
export const REAUTH_WINDOW_MS = 15 * 60 * 1000

/** Failed-attempt timestamps (ms) per user id, oldest first. */
const failures = new Map<string, number[]>()

function recentFailures(userId: string, now: number): number[] {
  const hits = (failures.get(userId) ?? []).filter((at) => now - at < REAUTH_WINDOW_MS)
  if (hits.length === 0) {
    failures.delete(userId)
  } else {
    failures.set(userId, hits)
  }
  return hits
}

export interface ReauthenticationOutcome {
  ok: boolean
  /** HTTP status the caller should answer with when `ok` is false. */
  status: number
  error?: string
  retryAfterSeconds?: number
}

export interface ReauthenticationCredentials {
  /** The account's current password. */
  password?: string
  /** A current TOTP code, accepted instead of the password when 2FA is enrolled. */
  code?: string
}

/**
 * Verifies a fresh credential for `userId`. Returns an outcome rather than
 * touching the response so it can be reused outside Express.
 */
export async function reauthenticate(
  userId: string,
  credentials: ReauthenticationCredentials
): Promise<ReauthenticationOutcome> {
  const password = typeof credentials.password === 'string' ? credentials.password : ''
  const code = typeof credentials.code === 'string' ? credentials.code : ''
  if (!password && !code) {
    return {
      ok: false,
      status: 400,
      error: 'Confirm your password to continue',
    }
  }

  const now = Date.now()
  const attempts = recentFailures(userId, now)
  if (attempts.length >= REAUTH_MAX_ATTEMPTS) {
    return {
      ok: false,
      status: 429,
      error: 'Too many failed confirmation attempts. Try again later.',
      retryAfterSeconds: Math.max(1, Math.ceil((REAUTH_WINDOW_MS - (now - attempts[0])) / 1000)),
    }
  }

  const [user] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1)
  if (!user) {
    return { ok: false, status: 401, error: 'Not authenticated' }
  }

  let verified = false
  if (password) {
    verified = await verifyPassword(password, user.passwordHash)
  }
  if (!verified && code) {
    const [sec] = await db.select().from(userSecurity).where(eq(userSecurity.userId, userId)).limit(1)
    verified = !!(sec?.totpEnabled && sec.totpSecret && verifyTotp(sec.totpSecret, code))
  }

  if (!verified) {
    failures.set(userId, [...attempts, now])
    return { ok: false, status: 401, error: 'Password or authentication code is incorrect' }
  }
  failures.delete(userId)
  return { ok: true, status: 200 }
}

/**
 * Express wrapper: reads `password` / `code` from the body, answers the request
 * on failure, and returns whether the caller may proceed.
 *
 *     if (!(await requireReauthentication(req, res))) return
 */
export async function requireReauthentication(
  req: AuthedRequest,
  res: Response
): Promise<boolean> {
  const { password, code } = (req.body ?? {}) as ReauthenticationCredentials
  const outcome = await reauthenticate(req.user!.sub, { password, code })
  if (outcome.ok) return true
  if (outcome.retryAfterSeconds) {
    res.setHeader('Retry-After', String(outcome.retryAfterSeconds))
  }
  res.status(outcome.status).json({
    error: outcome.error,
    ...(outcome.retryAfterSeconds ? { retryAfterSeconds: outcome.retryAfterSeconds } : {}),
  })
  return false
}

/** Test-only: clears the failed-attempt throttle. */
export function resetReauthenticationThrottle(): void {
  failures.clear()
}
