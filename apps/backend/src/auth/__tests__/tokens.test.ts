import { describe, expect, it } from 'vitest'
import { SignJWT } from 'jose'
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../tokens.js'

process.env.JWT_ACCESS_SECRET = 'unit-access'
process.env.JWT_REFRESH_SECRET = 'unit-refresh'
process.env.COOKIE_SECURE = 'false'

describe('JWT tokens', () => {
  const payload = { sub: 'user-1', role: 'customer' as const, email: 'u@test.dev' }

  it('signs and verifies access/refresh tokens', async () => {
    const access = await signAccessToken(payload)
    const { token: refresh } = await signRefreshToken(payload)
    expect(await verifyAccessToken(access)).toMatchObject({ sub: payload.sub, role: 'customer' })
    expect(await verifyRefreshToken(refresh)).toMatchObject({
      email: payload.email,
      jti: expect.any(String),
    })
  })

  it('rejects tampered access tokens', async () => {
    const forged = await new SignJWT({ role: 'admin', email: 'x@test.dev' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-1')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode('wrong'))
    await expect(verifyAccessToken(forged)).rejects.toThrow()
  })

  it('exports cookie names', () => {
    expect(ACCESS_COOKIE).toBe('cf_access')
    expect(REFRESH_COOKIE).toBe('cf_refresh')
  })
})
