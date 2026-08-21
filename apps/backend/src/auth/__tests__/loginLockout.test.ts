import { describe, expect, it } from 'vitest'
import {
  LOGIN_LOCKOUT_THRESHOLD,
  loginLockoutDurationMs,
} from '../loginLockout.js'

describe('loginLockout', () => {
  it('LOCK-01: no lockout below threshold', () => {
    for (let i = 1; i < LOGIN_LOCKOUT_THRESHOLD; i += 1) {
      expect(loginLockoutDurationMs(i)).toBe(0)
    }
  })

  it('LOCK-02: exponential lockout at and above threshold', () => {
    expect(loginLockoutDurationMs(LOGIN_LOCKOUT_THRESHOLD)).toBe(60_000)
    expect(loginLockoutDurationMs(LOGIN_LOCKOUT_THRESHOLD + 1)).toBe(120_000)
    expect(loginLockoutDurationMs(LOGIN_LOCKOUT_THRESHOLD + 2)).toBe(240_000)
  })

  it('LOCK-03: lockout duration capped at 24 hours', () => {
    expect(loginLockoutDurationMs(100)).toBe(24 * 60 * 60_000)
  })
})
