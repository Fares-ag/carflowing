import { afterEach, describe, expect, it } from 'vitest'
import {
  getSmsVerificationCapabilities,
  isSmsVerificationAvailable,
  isTwilioSmsConfigured,
} from '../smsVerification.js'

describe('smsVerification capabilities', () => {
  const env = process.env

  afterEach(() => {
    process.env = { ...env }
  })

  it('enables verification in non-production without Twilio', () => {
    process.env.NODE_ENV = 'test'
    delete process.env.TWILIO_ACCOUNT_SID
    delete process.env.TWILIO_AUTH_TOKEN
    delete process.env.TWILIO_FROM_NUMBER
    delete process.env.SMS_VERIFICATION_ENABLED

    expect(isTwilioSmsConfigured()).toBe(false)
    expect(isSmsVerificationAvailable()).toBe(true)
    expect(getSmsVerificationCapabilities()).toEqual({
      smsVerificationAvailable: true,
      smsProviderConfigured: false,
      smsDevFallback: true,
    })
  })

  it('requires Twilio or explicit flag in production', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.TWILIO_ACCOUNT_SID
    delete process.env.TWILIO_AUTH_TOKEN
    delete process.env.TWILIO_FROM_NUMBER
    delete process.env.SMS_VERIFICATION_ENABLED

    expect(isSmsVerificationAvailable()).toBe(false)
    expect(getSmsVerificationCapabilities().smsVerificationAvailable).toBe(false)
  })

  it('marks provider configured when Twilio env is set', () => {
    process.env.NODE_ENV = 'production'
    process.env.TWILIO_ACCOUNT_SID = 'AC123'
    process.env.TWILIO_AUTH_TOKEN = 'token'
    process.env.TWILIO_FROM_NUMBER = '+15550001111'

    expect(isTwilioSmsConfigured()).toBe(true)
    expect(getSmsVerificationCapabilities()).toEqual({
      smsVerificationAvailable: true,
      smsProviderConfigured: true,
      smsDevFallback: false,
    })
  })
})
