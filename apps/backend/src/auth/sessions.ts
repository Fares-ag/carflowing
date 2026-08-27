import { createHash } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import { refreshSessions } from '../db/schema.js'

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function hashJti(jti: string): string {
  return createHash('sha256').update(jti).digest('hex')
}

export async function createRefreshSession(userId: string, jti: string): Promise<void> {
  await db.insert(refreshSessions).values({
    userId,
    jtiHash: hashJti(jti),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  })
}

/**
 * Revocation watermark for access tokens: an access token carries the
 * `hashJti()` of the refresh session it was minted with, so a revoked or
 * expired session invalidates it immediately (logout-all, password change,
 * account deletion) instead of leaving it live until it expires.
 */
export async function isSessionActiveByHash(
  userId: string,
  jtiHash: string | undefined
): Promise<boolean> {
  if (!jtiHash) return false
  const [row] = await db
    .select()
    .from(refreshSessions)
    .where(
      and(
        eq(refreshSessions.userId, userId),
        eq(refreshSessions.jtiHash, jtiHash),
        isNull(refreshSessions.revokedAt)
      )
    )
    .limit(1)
  if (!row) return false
  return row.expiresAt > new Date()
}

export async function isRefreshSessionActive(
  userId: string,
  jti: string | undefined
): Promise<boolean> {
  if (!jti) return false
  return isSessionActiveByHash(userId, hashJti(jti))
}

export async function revokeRefreshSession(userId: string, jti: string | undefined): Promise<void> {
  if (!jti) return
  await db
    .update(refreshSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(refreshSessions.userId, userId), eq(refreshSessions.jtiHash, hashJti(jti)))
    )
}

export async function revokeAllRefreshSessions(userId: string): Promise<void> {
  await db
    .update(refreshSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshSessions.userId, userId), isNull(refreshSessions.revokedAt)))
}
