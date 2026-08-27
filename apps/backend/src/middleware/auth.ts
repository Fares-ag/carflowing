import { ADMIN_PORTAL_ROLES, isAdminPortalRole, type UserRole } from '@carflow/shared/types'
import type { NextFunction, Request, Response } from 'express'

export { ADMIN_PORTAL_ROLES }
import { eq } from 'drizzle-orm'
import { isSessionActiveByHash } from '../auth/sessions.js'
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  type AccessTokenPayload,
  verifyAccessToken,
} from '../auth/tokens.js'
import { db } from '../db/index.js'
import { profiles } from '../db/schema.js'

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
      .select({ status: profiles.status, role: profiles.role })
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
    // Revocation watermark: logout-all, password change, and account deletion
    // revoke the refresh session, which must kill the access token minted
    // alongside it straight away rather than 15 minutes later. Tokens issued
    // before session binding shipped carry no `sid`; they are rejected too so
    // the SPA falls back to /api/auth/refresh and picks up a bound token.
    if (!(await isSessionActiveByHash(req.user.sub, req.user.sid))) {
      res.status(401).json({ error: 'Session revoked' })
      return
    }
    req.user = { ...req.user, role: user.role }
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

export function requireAdminPortal(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }
  if (!isAdminPortalRole(req.user.role)) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}

/** Finance-only mutations (refunds, payouts). Full admin always allowed. */
export function requireFinanceCapability(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }
  if (req.user.role === 'admin' || req.user.role === 'finance') {
    next()
    return
  }
  res.status(403).json({ error: 'Finance role required' })
}

/** Fleet/rental ops mutations. Full admin always allowed. */
export function requireOpsCapability(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }
  if (req.user.role === 'admin' || req.user.role === 'ops') {
    next()
    return
  }
  res.status(403).json({ error: 'Ops role required' })
}

/** Support desk mutations (complaints, messaging). Full admin always allowed. */
export function requireSupportCapability(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }
  if (req.user.role === 'admin' || req.user.role === 'support') {
    next()
    return
  }
  res.status(403).json({ error: 'Support role required' })
}

/** Full admin only — destructive marketplace/config mutations. Finance/ops/support are read-mostly. */
export function requireFullAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'Full admin role required' })
    return
  }
  next()
}

export function getRefreshCookie(req: Request): string | undefined {
  return req.cookies?.[REFRESH_COOKIE] as string | undefined
}
