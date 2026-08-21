import { SignJWT } from 'jose'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  buildAuthCookieOptions,
  sign2faChallengeToken,
  signAccessToken,
  signRefreshToken,
  verify2faChallengeToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../tokens.js'

process.env.JWT_ACCESS_SECRET = 'unit-access-secret-minimum-32-chars-long'
process.env.JWT_REFRESH_SECRET = 'unit-refresh-secret-minimum-32-chars-long'
process.env.JWT_2FA_SECRET = 'unit-2fa-secret-minimum-32-characters-long'

describe('JWT tokens', () => {
  const payload = { sub: 'user-1', role: 'customer' as const, email: 'u@test.dev' }

  afterEach(() => {
    delete process.env.COOKIE_SECURE
    delete process.env.COOKIE_DOMAIN
    delete process.env.PUBLIC_API_URL
  })

  it('signs and verifies access/refresh tokens', async () => {
    const access = await signAccessToken(payload)
    const { token: refresh } = await signRefreshToken(payload)
    expect(await verifyAccessToken(access)).toMatchObject({ sub: payload.sub, role: 'customer' })
    expect(await verifyRefreshToken(refresh)).toMatchObject({
      email: payload.email,
      jti: expect.any(String),
    })
  })

  it('rejects access tokens missing purpose:access', async () => {
    const legacy = await new SignJWT({ role: 'customer', email: payload.email })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(payload.sub)
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode(process.env.JWT_ACCESS_SECRET!))
    await expect(verifyAccessToken(legacy)).rejects.toThrow(/purpose/)
  })

  it('rejects tampered access tokens', async () => {
    const forged = await new SignJWT({ purpose: 'access', role: 'admin', email: 'x@test.dev' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-1')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode('wrong'))
    await expect(verifyAccessToken(forged)).rejects.toThrow()
  })

  it('signs and verifies 2FA challenge tokens with a dedicated secret', async () => {
    const { token, jti } = await sign2faChallengeToken('user-1')
    expect(jti).toMatch(/^[0-9a-f-]{36}$/i)
    expect(await verify2faChallengeToken(token)).toEqual({ sub: 'user-1', jti })
  })

  it('rejects 2FA challenge tokens verified as access tokens', async () => {
    const { token } = await sign2faChallengeToken('user-1')
    await expect(verifyAccessToken(token)).rejects.toThrow()
  })

  it('exports cookie names', () => {
    expect(ACCESS_COOKIE).toBe('cf_access')
    expect(REFRESH_COOKIE).toBe('cf_refresh')
  })

  describe('buildAuthCookieOptions', () => {
    it('uses Domain + SameSite=Lax when API is hosted on the cookie domain', () => {
      process.env.COOKIE_DOMAIN = '.carflow.qa'
      process.env.COOKIE_SECURE = 'true'
      process.env.PUBLIC_API_URL = 'https://api.carflow.qa'
      expect(buildAuthCookieOptions()).toEqual({
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
        path: '/',
        domain: '.carflow.qa',
      })
    })

    it('ignores COOKIE_DOMAIN when API is on a different host (Railway)', () => {
      process.env.COOKIE_DOMAIN = '.carflow.qa'
      process.env.COOKIE_SECURE = 'true'
      process.env.PUBLIC_API_URL = 'https://carflow-api-production-9a43.up.railway.app'
      expect(buildAuthCookieOptions()).toEqual({
        httpOnly: true,
        sameSite: 'none',
        secure: true,
        path: '/',
      })
    })

    it('uses SameSite=None when COOKIE_DOMAIN is unset and COOKIE_SECURE=true', () => {
      process.env.COOKIE_SECURE = 'true'
      expect(buildAuthCookieOptions()).toEqual({
        httpOnly: true,
        sameSite: 'none',
        secure: true,
        path: '/',
      })
    })

    it('uses SameSite=Lax without Secure in local dev', () => {
      process.env.COOKIE_SECURE = 'false'
      expect(buildAuthCookieOptions()).toEqual({
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/',
      })
    })
  })
})
