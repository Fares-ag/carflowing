import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SMS_SEND_COOLDOWN_MS,
  SMS_SEND_DAILY_MAX_PER_PHONE,
  SMS_SEND_DAILY_MAX_PER_USER,
  SMS_SEND_WINDOW_MS,
  consumeSmsSendAllowance,
  resetSmsSendLimits,
  smsPhoneKey,
} from '../smsSendLimits.js'

/**
 * ID: SMS-LIMIT-01..05 — Twilio spend guard on the SMS verification endpoint.
 * Files: apps/backend/src/auth/smsSendLimits.ts
 */
describe('SMS send limits', () => {
  beforeEach(() => {
    resetSmsSendLimits()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    resetSmsSendLimits()
  })

  it('SMS-LIMIT-01: allows the first send and blocks the next one inside the cooldown', () => {
    expect(consumeSmsSendAllowance('u1', '+97450001111').allowed).toBe(true)
    const second = consumeSmsSendAllowance('u1', '+97450001111')
    expect(second.allowed).toBe(false)
    expect(second.retryAfterSeconds).toBeGreaterThan(0)
    expect(second.retryAfterSeconds).toBeLessThanOrEqual(SMS_SEND_COOLDOWN_MS / 1000)

    vi.advanceTimersByTime(SMS_SEND_COOLDOWN_MS)
    expect(consumeSmsSendAllowance('u1', '+97450001111').allowed).toBe(true)
  })

  it('SMS-LIMIT-02: caps sends per user per rolling day across different numbers', () => {
    for (let i = 0; i < SMS_SEND_DAILY_MAX_PER_USER; i += 1) {
      expect(consumeSmsSendAllowance('u1', `+9745000${1000 + i}`).allowed).toBe(true)
      vi.advanceTimersByTime(SMS_SEND_COOLDOWN_MS)
    }
    const capped = consumeSmsSendAllowance('u1', '+97450009999')
    expect(capped.allowed).toBe(false)
    expect(capped.error).toMatch(/today/i)

    vi.advanceTimersByTime(SMS_SEND_WINDOW_MS)
    expect(consumeSmsSendAllowance('u1', '+97450009999').allowed).toBe(true)
  })

  it('SMS-LIMIT-03: caps sends per destination number across different users', () => {
    for (let i = 0; i < SMS_SEND_DAILY_MAX_PER_PHONE; i += 1) {
      expect(consumeSmsSendAllowance(`user-${i}`, '+97450002222').allowed).toBe(true)
      vi.advanceTimersByTime(SMS_SEND_COOLDOWN_MS)
    }
    const capped = consumeSmsSendAllowance('fresh-user', '+97450002222')
    expect(capped.allowed).toBe(false)
    expect(capped.error).toMatch(/this number/i)
  })

  it('SMS-LIMIT-04: the cooldown follows the number, not just the account', () => {
    expect(consumeSmsSendAllowance('u1', '+97450003333').allowed).toBe(true)
    expect(consumeSmsSendAllowance('u2', '+97450003333').allowed).toBe(false)
  })

  it('SMS-LIMIT-05: formatting variants of the same number share a bucket', () => {
    expect(smsPhoneKey('+974 5000 4444')).toBe('+97450004444')
    expect(consumeSmsSendAllowance('u1', '+974 5000 4444').allowed).toBe(true)
    expect(consumeSmsSendAllowance('u2', '+974-5000-4444').allowed).toBe(false)
  })
})
