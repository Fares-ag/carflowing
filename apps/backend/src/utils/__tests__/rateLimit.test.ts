import type { NextFunction, Request, Response } from 'express'
import type { Options } from 'express-rate-limit'
import cookieParser from 'cookie-parser'
import express from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ACCESS_COOKIE, signAccessToken } from '../../auth/tokens.js'
import {
  createRateLimiter,
  rateLimitExceededHandler,
  rateLimitKey,
  resolveTrustProxyHops,
  retryAfterPhrase,
  skipRateLimitInTests,
} from '../rateLimit.js'

describe('skipRateLimitInTests', () => {
  it('RL-01: skips only when VITEST is true', () => {
    vi.stubEnv('VITEST', 'true')
    expect(skipRateLimitInTests()).toBe(true)

    vi.stubEnv('VITEST', '')
    expect(skipRateLimitInTests()).toBe(false)

    vi.stubEnv('NODE_ENV', 'development')
    expect(skipRateLimitInTests()).toBe(false)

    vi.stubEnv('NODE_ENV', 'production')
    expect(skipRateLimitInTests()).toBe(false)

    vi.unstubAllEnvs()
  })
})

describe('resolveTrustProxyHops', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('RL-04: defaults to 2 hops in production (Vercel rewrite -> Railway edge)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('TRUST_PROXY_HOPS', '')
    expect(resolveTrustProxyHops()).toBe(2)
  })

  it('RL-05: defaults to 1 hop outside production', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('TRUST_PROXY_HOPS', '')
    expect(resolveTrustProxyHops()).toBe(1)
  })

  it('RL-06: honours TRUST_PROXY_HOPS and falls back on garbage', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('TRUST_PROXY_HOPS', '3')
    expect(resolveTrustProxyHops()).toBe(3)

    vi.stubEnv('TRUST_PROXY_HOPS', '0')
    expect(resolveTrustProxyHops()).toBe(0)

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('TRUST_PROXY_HOPS', 'two')
    expect(resolveTrustProxyHops()).toBe(2)
    vi.stubEnv('TRUST_PROXY_HOPS', '-1')
    expect(resolveTrustProxyHops()).toBe(2)
    warn.mockRestore()
  })

  it('RL-07: express derives req.ip from the correct hop', async () => {
    const app = express()
    app.set('trust proxy', 2)
    app.get('/ip', (req, res) => {
      res.json({ ip: req.ip })
    })

    const res = await request(app)
      .get('/ip')
      // client, vercel egress, railway edge is the socket peer
      .set('X-Forwarded-For', '203.0.113.7, 198.51.100.9')

    expect(res.body.ip).toBe('203.0.113.7')
  })
})

describe('rateLimitKey', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  function keyApp() {
    const app = express()
    app.use(cookieParser())
    app.get('/key', async (req, res) => {
      res.json({ key: await rateLimitKey(req) })
    })
    return app
  }

  it('RL-08: keys on the authenticated user id so one egress IP is not one bucket', async () => {
    vi.stubEnv('JWT_ACCESS_SECRET', 'a'.repeat(40))
    const token = await signAccessToken({
      sub: '11111111-1111-1111-1111-111111111111',
      role: 'customer',
      email: 'rider@example.com',
    })

    const res = await request(keyApp()).get('/key').set('Cookie', `${ACCESS_COOKIE}=${token}`)

    expect(res.body.key).toBe('user:11111111-1111-1111-1111-111111111111')
  })

  it('RL-09: falls back to the IP key for anonymous and forged cookies', async () => {
    vi.stubEnv('JWT_ACCESS_SECRET', 'a'.repeat(40))

    const anon = await request(keyApp()).get('/key')
    expect(anon.body.key).toMatch(/^ip:/)

    const forged = await request(keyApp())
      .get('/key')
      .set('Cookie', `${ACCESS_COOKIE}=not-a-real-jwt`)
    expect(forged.body.key).toMatch(/^ip:/)
  })
})

describe('retryAfterPhrase', () => {
  it('RL-10: renders seconds under a minute and rounded-up minutes above', () => {
    const now = Date.now()
    expect(retryAfterPhrase(new Date(now + 1_000), 60_000)).toBe('1 second')
    expect(retryAfterPhrase(new Date(now + 42_000), 60_000)).toBe('42 seconds')
    expect(retryAfterPhrase(new Date(now + 61_000), 60_000)).toBe('2 minutes')
    expect(retryAfterPhrase(undefined, 15 * 60 * 1000)).toBe('15 minutes')
    // Already elapsed: never render "0 seconds" or a negative wait.
    expect(retryAfterPhrase(new Date(now - 5_000), 60_000)).toBe('1 second')
  })
})

describe('rate limit responses', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('RL-11: sends JSON { error } with a retry hint instead of the plain-text default', async () => {
    vi.stubEnv('VITEST', '')
    const app = express()
    app.use(
      createRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 1,
        skip: () => false,
      })
    )
    app.get('/limited', (_req, res) => {
      res.json({ ok: true })
    })

    expect((await request(app).get('/limited')).status).toBe(200)

    const limited = await request(app).get('/limited')
    expect(limited.status).toBe(429)
    expect(limited.headers['content-type']).toMatch(/application\/json/)
    expect(limited.body.error).toMatch(/^Too many requests\. Please try again in \d+ minutes?\.$/)
    expect(limited.headers['ratelimit-reset']).toBeDefined()
  })

  it('RL-12: handler uses the limiter status code and window when no reset time is known', () => {
    const req = { method: 'POST', path: '/api/auth/login', requestId: 'req-1' } as unknown as Request
    const json = vi.fn()
    const res = { status: vi.fn().mockReturnThis(), json } as unknown as Response
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    rateLimitExceededHandler(req, res, (() => {}) as NextFunction, {
      statusCode: 429,
      windowMs: 30_000,
    } as unknown as Options)

    expect(res.status).toHaveBeenCalledWith(429)
    expect(json).toHaveBeenCalledWith({ error: 'Too many requests. Please try again in 30 seconds.' })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
