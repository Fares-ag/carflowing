import { z } from 'zod'

/** Qatar mobile numbers: country code 974 + 8 subscriber digits. */
export const QATAR_PHONE_SUBSCRIBER_DIGITS = 8

const QID_PATTERN = /^\d{11}$/
/** Qatar MOI driving licence numbers are 8 digits. */
const DRIVERS_LICENSE_PATTERN = /^\d{8}$/

export const QATAR_PHONE_INVALID_MESSAGE =
  'Enter a valid Qatar phone number (+974 followed by 8 digits)'
export const QID_INVALID_MESSAGE = 'Qatar ID must be exactly 11 digits'
export const DRIVERS_LICENSE_INVALID_MESSAGE = "Driver's license number must be 8 digits"

/** Strip formatting and return +974XXXXXXXX when valid, otherwise null. */
export function normalizeQatarPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('974')) {
    return `+${digits}`
  }
  if (digits.length === QATAR_PHONE_SUBSCRIBER_DIGITS) {
    return `+974${digits}`
  }
  return null
}

export const qatarPhoneSchema = z
  .string()
  .trim()
  .min(1, QATAR_PHONE_INVALID_MESSAGE)
  .superRefine((value, ctx) => {
    if (!normalizeQatarPhone(value)) {
      ctx.addIssue({ code: 'custom', message: QATAR_PHONE_INVALID_MESSAGE })
    }
  })
  .transform((value) => normalizeQatarPhone(value)!)

export const qidSchema = z
  .string()
  .trim()
  .min(1, QID_INVALID_MESSAGE)
  .regex(QID_PATTERN, QID_INVALID_MESSAGE)

export const qatarDriversLicenseSchema = z
  .string()
  .trim()
  .min(1, DRIVERS_LICENSE_INVALID_MESSAGE)
  .regex(DRIVERS_LICENSE_PATTERN, DRIVERS_LICENSE_INVALID_MESSAGE)
