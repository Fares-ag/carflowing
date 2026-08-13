import { randomUUID } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import type { Response } from 'express'
import type { UserRole } from '@carflow/shared'

const ACCESS_COOKIE = 'cf_access'
const REFRESH_COOKIE = 'cf_refresh'
const ACCESS_TTL = '15m'
const REFRESH_TTL = '7d'

export interface AccessTokenPayload {
  sub: string
  role: UserRole
  email: string
}

function getSecret(name: 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET') {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not configured`)
  }
  return new TextEncoder().encode(value)
}

function cookieSecure() {
  return process.env.COOKIE_SECURE === 'true'
}

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return new SignJWT({ role: payload.role, email: payload.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(getSecret('JWT_ACCESS_SECRET'))
}

export interface RefreshTokenPayload extends AccessTokenPayload {
  jti: string
}

function cookieSameSite(): 'lax' | 'none' {
  return cookieSecure() ? 'none' : 'lax'
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
  return {
    sub: String(payload.sub),
    role: payload.role as UserRole,
    email: String(payload.email),
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
  const secure = cookieSecure()
  const sameSite = cookieSameSite()
  res.cookie(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    sameSite,
    secure,
    path: '/',
    maxAge: 15 * 60 * 1000,
  })
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite,
    secure,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
}

export function clearAuthCookies(res: Response) {
  const secure = cookieSecure()
  const sameSite = cookieSameSite()
  res.clearCookie(ACCESS_COOKIE, { httpOnly: true, sameSite, secure, path: '/' })
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, sameSite, secure, path: '/' })
}

export { ACCESS_COOKIE, REFRESH_COOKIE }
