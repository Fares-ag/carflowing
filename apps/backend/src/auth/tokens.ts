import { randomUUID } from 'node:crypto'
import type { UserRole } from '@carflow/shared/types'
import type { Response } from 'express'
import { SignJWT, jwtVerify } from 'jose'

const ACCESS_COOKIE = 'cf_access'
const REFRESH_COOKIE = 'cf_refresh'
const ACCESS_TTL = '15m'
const REFRESH_TTL = '7d'
const TWO_FA_TTL = '5m'
const ACCESS_PURPOSE = 'access'
const TWO_FA_PURPOSE = '2fa'

const DEV_2FA_SECRET = 'dev-2fa-challenge-secret-min-32-chars!!'

export interface AccessTokenPayload {
  sub: string
  role: UserRole
  email: string
  /**
   * Refresh-session fingerprint (`hashJti()` of the refresh jti issued in the
   * same breath). Binding the access token to its session lets `requireAuth`
   * reject tokens minted before a logout-all / password change / account
   * deletion instead of honouring them for the rest of their 15 minutes.
   */
  sid?: string
}

export interface TwoFaChallengePayload {
  sub: string
  jti: string
}

function getSecret(name: 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET') {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not configured`)
  }
  return new TextEncoder().encode(value)
}

function get2faSecret(): Uint8Array {
  const value = process.env.JWT_2FA_SECRET
  if (!value) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_2FA_SECRET is not configured')
    }
    return new TextEncoder().encode(DEV_2FA_SECRET)
  }
  return new TextEncoder().encode(value)
}

function cookieSecure() {
  return process.env.COOKIE_SECURE === 'true'
}

function cookieDomain(): string | undefined {
  const value = process.env.COOKIE_DOMAIN?.trim()
  if (!value) return undefined
  const apiHost = (() => {
    try {
      return new URL(process.env.PUBLIC_API_URL ?? '').hostname
    } catch {
      return ''
    }
  })()
  // Domain= only works when the API itself is hosted on that registrable domain
  // (e.g. api.carflow.qa). Railway *.up.railway.app cannot set .carflow.qa cookies.
  if (apiHost && !apiHost.endsWith(value.replace(/^\./, ''))) {
    return undefined
  }
  return value
}

export type AuthCookieOptions = {
  httpOnly: true
  sameSite: 'lax' | 'none'
  secure: boolean
  path: '/'
  domain?: string
}

/** Builds shared auth cookie attributes (access + refresh). Exported for tests. */
export function buildAuthCookieOptions(): AuthCookieOptions {
  const secure = cookieSecure()
  const domain = cookieDomain()
  if (domain) {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      domain,
    }
  }
  // Cross-site SPA (www.carflow.qa) calling Railway API — host-only cookies on the API origin.
  return {
    httpOnly: true,
    sameSite: secure ? 'none' : 'lax',
    secure,
    path: '/',
  }
}

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return new SignJWT({
    purpose: ACCESS_PURPOSE,
    role: payload.role,
    email: payload.email,
    ...(payload.sid ? { sid: payload.sid } : {}),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(getSecret('JWT_ACCESS_SECRET'))
}

export interface RefreshTokenPayload extends AccessTokenPayload {
  jti: string
}

export async function signRefreshToken(payload: AccessTokenPayload): Promise<{ token: string; jti: string }> {
  const jti = randomUUID()
  const token = await new SignJWT({ role: payload.role, email: payload.email, jti })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(REFRESH_TTL)
    .sign(getSecret('JWT_REFRESH_SECRET'))
  return { token, jti }
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret('JWT_ACCESS_SECRET'))
  if (payload.purpose !== ACCESS_PURPOSE) {
    throw new Error('Invalid access token purpose')
  }
  return {
    sub: String(payload.sub),
    role: payload.role as UserRole,
    email: String(payload.email),
    sid: payload.sid ? String(payload.sid) : undefined,
  }
}

export async function sign2faChallengeToken(userId: string): Promise<{ token: string; jti: string }> {
  const jti = randomUUID()
  const token = await new SignJWT({ purpose: TWO_FA_PURPOSE, jti })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(TWO_FA_TTL)
    .sign(get2faSecret())
  return { token, jti }
}

export async function verify2faChallengeToken(token: string): Promise<TwoFaChallengePayload> {
  const { payload } = await jwtVerify(token, get2faSecret())
  if (payload.purpose !== TWO_FA_PURPOSE) {
    throw new Error('Invalid challenge token purpose')
  }
  const jti = String(payload.jti ?? '')
  if (!jti) {
    throw new Error('Challenge token missing jti')
  }
  return {
    sub: String(payload.sub),
    jti,
  }
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret('JWT_REFRESH_SECRET'))
  return {
    sub: String(payload.sub),
    role: payload.role as UserRole,
    email: String(payload.email),
    jti: String(payload.jti ?? ''),
  }
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  const base = buildAuthCookieOptions()
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...base,
    maxAge: 15 * 60 * 1000,
  })
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...base,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, buildAuthCookieOptions())
  res.clearCookie(REFRESH_COOKIE, buildAuthCookieOptions())
}

export { ACCESS_COOKIE, REFRESH_COOKIE }
