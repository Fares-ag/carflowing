import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import { twoFaChallenges } from '../db/schema.js'
import { hashJti } from './sessions.js'

const CHALLENGE_TTL_MS = 5 * 60 * 1000

export async function create2faChallenge(userId: string, jti: string): Promise<void> {
  await db.insert(twoFaChallenges).values({
    userId,
    jtiHash: hashJti(jti),
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
  })
}

/** Returns true when the challenge exists, is unused, and has not expired. */
export async function validate2faChallenge(userId: string, jti: string): Promise<boolean> {
  const [row] = await db
    .select({ id: twoFaChallenges.id })
    .from(twoFaChallenges)
    .where(
      and(
        eq(twoFaChallenges.userId, userId),
        eq(twoFaChallenges.jtiHash, hashJti(jti)),
        isNull(twoFaChallenges.usedAt),
        gt(twoFaChallenges.expiresAt, new Date())
      )
    )
    .limit(1)
  return !!row
}

/** Validates an unused challenge and marks it consumed (single-use). */
export async function consume2faChallenge(userId: string, jti: string): Promise<boolean> {
  const [row] = await db
    .select()
    .from(twoFaChallenges)
    .where(
      and(
        eq(twoFaChallenges.userId, userId),
        eq(twoFaChallenges.jtiHash, hashJti(jti)),
        isNull(twoFaChallenges.usedAt),
        gt(twoFaChallenges.expiresAt, new Date())
      )
    )
    .limit(1)
  if (!row) return false
  await db
    .update(twoFaChallenges)
    .set({ usedAt: new Date() })
    .where(eq(twoFaChallenges.id, row.id))
  return true
}
