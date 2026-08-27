import { afterEach, describe, expect, it } from 'vitest'
import { skipRateLimitInTests } from '../rateLimit.js'

/** ID: RL-SKIP-01..03 — the test-harness bypass must never reach production. */
describe('skipRateLimitInTests', () => {
  const original = { ...process.env }

  afterEach(() => {
    process.env.NODE_ENV = original.NODE_ENV
    process.env.VITEST = original.VITEST
    if (original.E2E_RELAX_RATE_LIMITS === undefined) delete process.env.E2E_RELAX_RATE_LIMITS
    else process.env.E2E_RELAX_RATE_LIMITS = original.E2E_RELAX_RATE_LIMITS
  })

  it('RL-SKIP-01: the Playwright harness opts out via E2E_RELAX_RATE_LIMITS', () => {
    process.env.NODE_ENV = 'test'
    delete process.env.VITEST
    process.env.E2E_RELAX_RATE_LIMITS = 'true'
    expect(skipRateLimitInTests()).toBe(true)
  })

  it('RL-SKIP-02: production ignores both bypass switches', () => {
    process.env.NODE_ENV = 'production'
    process.env.VITEST = 'true'
    process.env.E2E_RELAX_RATE_LIMITS = 'true'
    expect(skipRateLimitInTests()).toBe(false)
  })

  it('RL-SKIP-03: an ordinary dev process is still rate limited', () => {
    process.env.NODE_ENV = 'development'
    delete process.env.VITEST
    delete process.env.E2E_RELAX_RATE_LIMITS
    expect(skipRateLimitInTests()).toBe(false)
  })
})
