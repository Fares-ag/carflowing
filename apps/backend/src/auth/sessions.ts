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

export async function isRefreshSessionActive(
  userId: string,
  jti: string | undefined
): Promise<boolean> {
  if (!jti) return false
  const [row] = await db
    .select()
    .from(refreshSessions)
    .where(
      and(
        eq(refreshSessions.userId, userId),
        eq(refreshSessions.jtiHash, hashJti(jti)),
        isNull(refreshSessions.revokedAt)
      )
    )
    .limit(1)
  if (!row) return false
  return row.expiresAt > new Date()
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
