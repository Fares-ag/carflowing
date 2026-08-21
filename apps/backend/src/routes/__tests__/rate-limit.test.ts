import type { Express } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetDb, seedFixtures } from '../../test/helpers.js'

describe('auth rate limiting', () => {
  afterEach(async () => {
    vi.unstubAllEnvs()
    vi.resetModules()
    await resetDb()
  })

  it('RL-02: login route returns 429 after limit in non-test environments', async () => {
    vi.stubEnv('VITEST', '')
    vi.stubEnv('NODE_ENV', 'staging')
    vi.resetModules()
    const { createApp } = await import('../../app.js')
    const app: Express = createApp()
    const fixtures = await seedFixtures()

    let lastStatus = 0
    for (let i = 0; i < 25; i += 1) {
      const res = await request(app).post('/api/auth/login').send({
        email: fixtures.customer.email,
        password: 'wrong-password',
        expectedRole: 'customer',
      })
      lastStatus = res.status
      if (res.status === 429) break
    }
    expect(lastStatus).toBe(429)
  })

  it('RL-03: 2fa verify-login route is covered by auth rate limiter wiring', async () => {
    const appSource = await import('fs').then((fs) =>
      fs.readFileSync(new URL('../../app.ts', import.meta.url), 'utf8')
    )
    expect(appSource).toMatch(/skipRateLimitInTests/)
    expect(appSource).not.toMatch(/skipRateLimitInDev/)
    expect(appSource).not.toMatch(/skip:.*NODE_ENV/)
    expect(appSource).toMatch(/\/api\/auth\/2fa\/verify-login/)
  })
})
