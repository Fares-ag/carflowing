import type { ZodError } from 'zod'
import { z } from 'zod'
import { qatarDriversLicenseSchema, qatarPhoneSchema, qidSchema } from './qatar.js'

export const checkoutContactSchema = z
  .object({
    firstName: z.string().trim().min(1, 'Required'),
    lastName: z.string().trim().min(1, 'Required'),
    email: z.string().trim().min(1, 'Required').email('Enter a valid email address'),
    phone: qatarPhoneSchema,
    qid: qidSchema,
    dateOfBirth: z.string().trim().min(1, 'Required'),
    nationality: z.string().trim().min(1, 'Required'),
  })
  .strict()

export const checkoutLicenseSchema = z
  .object({
    number: qatarDriversLicenseSchema,
    expiry: z.string().trim().min(1, 'Required'),
  })
  .strict()

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date')

export const DELIVERY_TIME_SLOTS = [
  '09:00–12:00',
  '12:00–15:00',
  '15:00–18:00',
] as const

export const checkoutDeliverySchema = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('dealer_pickup'),
      date: isoDate,
      time: z.string().trim().min(1, 'Select a time slot'),
    })
    .strict(),
  z
    .object({
      mode: z.literal('delivery'),
      location: z.string().trim().min(3, 'Enter a delivery address'),
      date: isoDate,
      time: z.string().trim().min(1, 'Select a time slot'),
    })
    .strict(),
])

export const rentalCollectionSchema = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('dealer_return'),
      date: isoDate,
      time: z.string().trim().min(1, 'Select a time slot'),
    })
    .strict(),
  z
    .object({
      mode: z.literal('collection'),
      location: z.string().trim().min(3, 'Enter a collection address'),
      date: isoDate,
      time: z.string().trim().min(1, 'Select a time slot'),
    })
    .strict(),
])

export const customerCancelRentalSchema = z
  .object({
    reason: z.string().trim().max(2000).optional(),
    collection: rentalCollectionSchema.optional(),
  })
  .strict()

/** Full checkout payload embedded in booking_requests.note. */
export const checkoutNoteSchema = z
  .object({
    contact: checkoutContactSchema,
    license: checkoutLicenseSchema,
    delivery: checkoutDeliverySchema,
  })
  .passthrough()

export type CheckoutDeliveryInput = z.infer<typeof checkoutDeliverySchema>
export type RentalCollectionInput = z.infer<typeof rentalCollectionSchema>

export function deliveryToCartFields(
  delivery: CheckoutDeliveryInput
): { location: string; date: string; time: string } {
  return {
    location: delivery.mode === 'dealer_pickup' ? 'Collect from dealer' : delivery.location,
    date: delivery.date,
    time: delivery.time,
  }
}

export function collectionToRentalFields(collection: RentalCollectionInput): {
  returnLocation: string
  returnDate: string
  returnTime: string
} {
  return {
    returnLocation: collection.mode === 'dealer_return' ? 'Return to dealer' : collection.location,
    returnDate: collection.date,
    returnTime: collection.time,
  }
}

export type CheckoutContactInput = z.input<typeof checkoutContactSchema>
export type CheckoutLicenseInput = z.input<typeof checkoutLicenseSchema>

const CHECKOUT_FIELD_KEY: Record<string, string> = {
  'contact.firstName': 'firstName',
  'contact.lastName': 'lastName',
  'contact.email': 'email',
  'contact.phone': 'phone',
  'contact.qid': 'qid',
  'contact.dateOfBirth': 'dateOfBirth',
  'contact.nationality': 'nationality',
  'license.number': 'licenseNumber',
  'license.expiry': 'licenseExpiry',
  'delivery.location': 'deliveryLocation',
  'delivery.date': 'deliveryDate',
  'delivery.time': 'deliveryTime',
  'delivery.mode': 'deliveryMode',
}

/** Map a checkout zod error to CheckoutPage field keys. */
export function checkoutFieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const path = issue.path.join('.')
    const key = CHECKOUT_FIELD_KEY[path] ?? path
    if (!out[key]) out[key] = issue.message
  }
  return out
}

/** True when note JSON looks like a checkout submission (has contact + license). */
export function isCheckoutNotePayload(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const obj = value as Record<string, unknown>
  return !!obj.contact && !!obj.license
}

function formatCheckoutNoteError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'note'
      return `${path}: ${issue.message}`
    })
    .join('; ')
}

/** Validate checkout JSON embedded in booking_requests.note; plain-text notes pass through. */
export function validateCheckoutNote(note: string | null | undefined):
  | { ok: true }
  | { ok: false; error: string } {
  if (!note) return { ok: true }
  let parsed: unknown
  try {
    parsed = JSON.parse(note)
  } catch {
    return { ok: true }
  }
  if (!isCheckoutNotePayload(parsed)) return { ok: true }
  const result = checkoutNoteSchema.safeParse(parsed)
  if (!result.success) {
    return { ok: false, error: formatCheckoutNoteError(result.error) }
  }
  return { ok: true }
}
