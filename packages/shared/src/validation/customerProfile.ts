import { z } from 'zod'
import { qatarDriversLicenseSchema, qatarPhoneSchema, qidSchema } from './qatar.js'

export const customerPatchProfileSchema = z
  .object({
    name: z.string().trim().min(1, 'Name cannot be empty').optional(),
    phone: qatarPhoneSchema.nullable().optional(),
    email: z.string().trim().email('Invalid email address').optional(),
  })
  .strict()

export const customerPatchDocumentsSchema = z
  .object({
    qidDocumentPath: z.string().nullable().optional(),
    driversLicensePath: z.string().nullable().optional(),
    qidNumber: qidSchema.optional(),
    driversLicenseNumber: qatarDriversLicenseSchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.qidDocumentPath && !data.qidNumber) {
      ctx.addIssue({
        code: 'custom',
        path: ['qidNumber'],
        message: 'QID number is required when uploading a QID document',
      })
    }
    if (data.driversLicensePath && !data.driversLicenseNumber) {
      ctx.addIssue({
        code: 'custom',
        path: ['driversLicenseNumber'],
        message: "Driver's license number is required when uploading a license document",
      })
    }
  })

export const customerCreateBookingRequestSchema = z
  .object({
    vehicleId: z.string().uuid('vehicleId must be a valid UUID'),
    note: z.string().nullable().optional(),
  })
  .strict()
