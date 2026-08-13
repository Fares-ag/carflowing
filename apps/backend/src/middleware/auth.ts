import type { NextFunction, Request, Response } from 'express'
import type { UserRole } from '@carflow/shared'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { profiles } from '../db/schema.js'
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  type AccessTokenPayload,
  verifyAccessToken,
} from '../auth/tokens.js'

export interface AuthedRequest extends Request {
  user?: AccessTokenPayload
}

/** Sets `req.user` when a valid access cookie is present; never rejects. */
export async function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[ACCESS_COOKIE] as string | undefined
    if (token) {
      req.user = await verifyAccessToken(token)
    }
  } catch {
    // Ignore invalid or expired tokens for optional auth.
  }
  next()
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[ACCESS_COOKIE] as string | undefined
    if (!token) {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }
    req.user = await verifyAccessToken(token)
    const [user] = await db
      .select({ status: profiles.status })
      .from(profiles)
      .where(eq(profiles.id, req.user.sub))
      .limit(1)
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }
    if (user.status === 'suspended') {
      res.status(403).json({ error: 'Account is suspended' })
      return
    }
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' })
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    next()
  }
}

export function getRefreshCookie(req: Request): string | undefined {
  return req.cookies?.[REFRESH_COOKIE] as string | undefined
}
