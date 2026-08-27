import { afterEach, describe, expect, it } from 'vitest'
import { isWhatsAppProviderConfigured, resetWhatsAppProviderCache } from '../whatsapp.js'

describe('WhatsApp provider resolution', () => {
  afterEach(() => {
    delete process.env.WHATSAPP_PROVIDER
    delete process.env.WHATSAPP_META_ACCESS_TOKEN
    delete process.env.WHATSAPP_META_PHONE_NUMBER_ID
    delete process.env.TWILIO_ACCOUNT_SID
    delete process.env.TWILIO_AUTH_TOKEN
    delete process.env.TWILIO_WHATSAPP_FROM
    resetWhatsAppProviderCache()
  })

  it('returns false when WHATSAPP_PROVIDER is unset', () => {
    expect(isWhatsAppProviderConfigured()).toBe(false)
  })

  it('returns true for meta when token and phone number id are set', () => {
    process.env.WHATSAPP_PROVIDER = 'meta'
    process.env.WHATSAPP_META_ACCESS_TOKEN = 'token'
    process.env.WHATSAPP_META_PHONE_NUMBER_ID = '123'
    resetWhatsAppProviderCache()
    expect(isWhatsAppProviderConfigured()).toBe(true)
  })

  it('returns true for twilio when credentials and from number are set', () => {
    process.env.WHATSAPP_PROVIDER = 'twilio'
    process.env.TWILIO_ACCOUNT_SID = 'AC123'
    process.env.TWILIO_AUTH_TOKEN = 'secret'
    process.env.TWILIO_WHATSAPP_FROM = 'whatsapp:+14155238886'
    resetWhatsAppProviderCache()
    expect(isWhatsAppProviderConfigured()).toBe(true)
  })
})
