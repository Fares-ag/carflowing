import { describe, expect, it } from 'vitest'
import {
  checkoutFieldErrors,
  checkoutNoteSchema,
  isCheckoutNotePayload,
  normalizeQatarPhone,
  qatarDriversLicenseSchema,
  qatarPhoneSchema,
  qidSchema,
} from '../validation/index.js'

describe('Qatar identity validators', () => {
  it('normalizes valid Qatar phone numbers', () => {
    expect(normalizeQatarPhone('+97455551234')).toBe('+97455551234')
    expect(normalizeQatarPhone('+974 5555 1234')).toBe('+97455551234')
    expect(normalizeQatarPhone('97455551234')).toBe('+97455551234')
    expect(normalizeQatarPhone('55551234')).toBe('+97455551234')
  })

  it('rejects invalid Qatar phone numbers', () => {
    expect(normalizeQatarPhone('+9745555')).toBeNull()
    expect(normalizeQatarPhone('+974555512345')).toBeNull()
    expect(qatarPhoneSchema.safeParse('123').success).toBe(false)
  })

  it('accepts 11-digit QID numbers only', () => {
    expect(qidSchema.safeParse('28412345678').success).toBe(true)
    expect(qidSchema.safeParse('2841234567').success).toBe(false)
    expect(qidSchema.safeParse('284123456789').success).toBe(false)
    expect(qidSchema.safeParse('2841234567a').success).toBe(false)
  })

  it('accepts 8-digit driver license numbers only', () => {
    expect(qatarDriversLicenseSchema.safeParse('12345678').success).toBe(true)
    expect(qatarDriversLicenseSchema.safeParse('1234567').success).toBe(false)
    expect(qatarDriversLicenseSchema.safeParse('123456789').success).toBe(false)
  })

  it('validates full checkout note payloads', () => {
    const valid = checkoutNoteSchema.safeParse({
      contact: {
        firstName: 'Ali',
        lastName: 'Hassan',
        email: 'ali@test.dev',
        phone: '+974 5555 1234',
        qid: '28412345678',
        dateOfBirth: '1990-01-01',
        nationality: 'Qatari',
      },
      license: {
        number: '12345678',
        expiry: '2028-12-31',
      },
      delivery: {
        mode: 'delivery',
        location: 'West Bay, Doha',
        date: '2026-05-02',
        time: '09:00–12:00',
      },
      paymentMethod: 'pay_at_shop',
    })
    expect(valid.success).toBe(true)
    if (valid.success) {
      expect(valid.data.contact.phone).toBe('+97455551234')
    }
  })

  it('maps checkout zod errors to form field keys', () => {
    const parsed = checkoutNoteSchema.safeParse({
      contact: {
        firstName: '',
        lastName: 'Hassan',
        email: 'bad',
        phone: '123',
        qid: '123',
        dateOfBirth: '',
        nationality: '',
      },
      license: { number: '12', expiry: '' },
      delivery: {
        mode: 'dealer_pickup',
        date: '2026-05-02',
        time: '09:00–12:00',
      },
    })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      const fields = checkoutFieldErrors(parsed.error)
      expect(fields.phone).toMatch(/Qatar phone/i)
      expect(fields.qid).toMatch(/11 digits/i)
      expect(fields.licenseNumber).toMatch(/8 digits/i)
    }
  })

  it('detects checkout note payloads', () => {
    expect(isCheckoutNotePayload({ contact: {}, license: {} })).toBe(true)
    expect(isCheckoutNotePayload({ durationMonths: 3 })).toBe(false)
    expect(isCheckoutNotePayload('plain text')).toBe(false)
  })
})
