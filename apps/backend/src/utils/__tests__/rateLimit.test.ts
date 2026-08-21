import { describe, expect, it, vi } from 'vitest'
import { skipRateLimitInTests } from '../rateLimit.js'

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
