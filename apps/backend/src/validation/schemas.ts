import { z } from 'zod'

const vehicleCategory = z.enum(['sedan', 'suv', 'truck', 'luxury', 'ev', 'other'])
const transmission = z.enum(['automatic', 'manual'])
const fuelType = z.enum(['gas', 'diesel', 'electric', 'hybrid'])
const planTier = z.enum(['starter', 'professional', 'enterprise'])
const planStatus = z.enum(['draft', 'active', 'archived'])
const messageFolder = z.enum(['inbox', 'sent', 'starred', 'archived'])
const vehicleStatus = z.enum(['available', 'rented', 'maintenance', 'inactive'])
const paymentMethodType = z.enum(['card', 'bank', 'wallet'])

const finiteInt = z.coerce
  .number()
  .refine((value) => Number.isFinite(value), { message: 'Expected a finite number' })
  .transform((value) => Math.trunc(value))

const reviewRating = z.preprocess(
  (value) => {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) {
      return value
    }
    return Math.floor(numeric)
  },
  z.number().int().min(1, 'Rating must be between 1 and 5').max(5, 'Rating must be between 1 and 5')
)

export const adminCreateVehicleSchema = z
  .object({
    dealerId: z.string().uuid(),
    name: z.string().trim().min(1),
    make: z.string().trim().min(1),
    model: z.string().trim().min(1),
    year: finiteInt.pipe(z.number().int().min(1900).max(2100)),
    category: vehicleCategory,
    pricePerDay: z.coerce.number().refine(Number.isFinite, { message: 'Expected a finite number' }).nonnegative(),
    mileage: finiteInt.pipe(z.number().int().nonnegative()).optional(),
    transmission,
    fuelType,
    seats: finiteInt.pipe(z.number().int().min(1).max(20)).optional(),
    imageUrl: z.string().nullable().optional(),
    imageUrls: z.array(z.string()).optional(),
    description: z.string().nullable().optional(),
    color: z.string().nullable().optional(),
    mileageCapKm: finiteInt.pipe(z.number().int().nonnegative()).optional(),
    features: z.array(z.string()).optional(),
  })
  .strict()

export const adminPatchVehicleStatusSchema = z
  .object({
    status: vehicleStatus,
  })
  .strict()

export const adminCreatePlanSchema = z
  .object({
    name: z.string().trim().min(1),
    tier: planTier,
    status: planStatus.optional(),
    priceMonthly: z.coerce.number().refine(Number.isFinite, { message: 'Expected a finite number' }).nonnegative().optional(),
    priceYearly: z.coerce.number().refine(Number.isFinite, { message: 'Expected a finite number' }).nonnegative().optional(),
    features: z.array(z.string()).optional(),
  })
  .strict()

export const adminPatchPlanSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    tier: planTier.optional(),
    status: planStatus.optional(),
    priceMonthly: z.coerce.number().refine(Number.isFinite, { message: 'Expected a finite number' }).nonnegative().optional(),
    priceYearly: z.coerce.number().refine(Number.isFinite, { message: 'Expected a finite number' }).nonnegative().optional(),
    features: z.array(z.string()).optional(),
  })
  .strict()

export const adminCreateMessageSchema = z
  .object({
    toUserId: z.string().uuid(),
    subject: z.string().trim().min(1).max(500),
    body: z.string().min(1),
  })
  .strict()

export const adminPatchMessageReadSchema = z
  .object({
    read: z.boolean(),
  })
  .strict()

export const adminPatchMessageFolderSchema = z
  .object({
    folder: messageFolder,
  })
  .strict()

export const customerExtendRentalSchema = z
  .object({
    months: finiteInt.pipe(z.number().int().min(1).max(12)),
  })
  .strict()

export const dealerExtendRentalSchema = customerExtendRentalSchema

export const dealerReviewResponseSchema = z
  .object({
    response: z.string().trim().min(1, 'Response is required').max(2000),
  })
  .strict()

export const pauseRentalSchema = z
  .object({
    days: finiteInt.pipe(z.number().int().min(1).max(365)).optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .strict()

export const dealerPickupFulfilmentSchema = z
  .object({
    status: z.enum(['scheduled', 'delivered']),
  })
  .strict()

export const customerCreateReviewSchema = z
  .object({
    rating: reviewRating,
    comment: z.string().optional(),
  })
  .strict()

export const customerCreateMaintenanceRequestSchema = z
  .object({
    description: z.string().trim().min(1).max(2000),
    title: z.string().trim().min(1).max(200).optional(),
    photos: z.array(z.string().trim().min(1).max(500)).max(5).optional(),
  })
  .strict()

export const dealerScheduleMaintenanceSchema = z
  .object({
    scheduledAt: z.string().trim().min(1),
  })
  .strict()

export const customerValidatePromoSchema = z
  .object({
    code: z.string().trim().min(1),
    vehicleId: z.string().uuid(),
    termMonths: finiteInt.pipe(z.number().int().min(1).max(12)).optional(),
  })
  .strict()

export const customerCreatePaymentMethodSchema = z
  .object({
    brand: z.string().trim().min(1),
    last4: z.string().regex(/^\d{4}$/),
    expiryMonth: finiteInt.pipe(z.number().int().min(1).max(12)),
    expiryYear: finiteInt.pipe(z.number().int().min(new Date().getFullYear())),
    methodType: paymentMethodType.optional(),
  })
  .strict()

export const customerPatchMessageReadSchema = adminPatchMessageReadSchema
export const customerPatchMessageFolderSchema = adminPatchMessageFolderSchema

export const portalCreateMessageSchema = z
  .object({
    toUserId: z.string().uuid(),
    body: z.string().trim().min(1),
    subject: z.string().trim().min(1).max(500).optional(),
    rentalId: z.string().uuid().optional(),
    bookingRequestId: z.string().uuid().optional(),
    replyToMessageId: z.string().uuid().optional(),
  })
  .strict()

const moneyAmount = z.coerce
  .number()
  .refine(Number.isFinite, { message: 'Expected a finite number' })
  .nonnegative()

export const dealerDepositResolutionSchema = z
  .object({
    releaseAmount: moneyAmount,
    withheldAmount: moneyAmount,
    note: z.string().trim().max(2000).optional(),
  })
  .strict()

export const dealerReturnRentalSchema = z
  .object({
    mileage: finiteInt.pipe(z.number().int().nonnegative()).optional(),
    fuelLevel: z.string().trim().min(1).max(50).optional(),
    conditionNotes: z.string().trim().max(5000).optional(),
    photos: z.array(z.string().trim().min(1)).max(20).optional(),
    vehicleNextStatus: z.enum(['available', 'maintenance']).optional(),
    depositResolution: dealerDepositResolutionSchema.optional(),
  })
  .strict()

export const adminPatchBusinessSettingsSchema = z
  .object({
    platformCommissionRate: z.number().min(0).max(1).optional(),
    billingGraceDays: finiteInt.pipe(z.number().int().min(0).max(365)).optional(),
    paymentHoldTtlMinutes: finiteInt.pipe(z.number().int().min(1).max(1440)).optional(),
    cancelNoticeDays: finiteInt.pipe(z.number().int().min(0).max(365)).optional(),
    swapEligibleDays: finiteInt.pipe(z.number().int().min(0).max(365)).optional(),
    subscriptionDepositAmount: z.number().min(0).max(1_000_000).optional(),
  })
  .strict()

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
  .nullable()

export const adminCreatePromoSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(50)
      .transform((value) => value.toUpperCase()),
    discountType: z.enum(['percent', 'fixed']),
    discountValue: z.coerce.number().refine(Number.isFinite, { message: 'Expected a finite number' }).positive(),
    minTermMonths: finiteInt.pipe(z.number().int().min(1).max(120)).optional().default(1),
    maxUses: finiteInt.pipe(z.number().int().min(1)).nullable().optional(),
    perCustomerLimit: finiteInt.pipe(z.number().int().min(1).max(100)).optional().default(1),
    firstInvoiceOnly: z.boolean().optional().default(true),
    validFrom: isoDate.optional(),
    validUntil: isoDate.optional(),
    active: z.boolean().optional().default(true),
  })
  .strict()
  .refine(
    (data) => !data.validFrom || !data.validUntil || data.validFrom <= data.validUntil,
    { message: 'validFrom must be on or before validUntil', path: ['validUntil'] }
  )

export const adminPatchPromoSchema = z
  .object({
    discountType: z.enum(['percent', 'fixed']).optional(),
    discountValue: z.coerce.number().refine(Number.isFinite, { message: 'Expected a finite number' }).positive().optional(),
    minTermMonths: finiteInt.pipe(z.number().int().min(1).max(120)).optional(),
    maxUses: finiteInt.pipe(z.number().int().min(1)).nullable().optional(),
    perCustomerLimit: finiteInt.pipe(z.number().int().min(1).max(100)).optional(),
    firstInvoiceOnly: z.boolean().optional(),
    validFrom: isoDate.optional(),
    validUntil: isoDate.optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) => !data.validFrom || !data.validUntil || data.validFrom <= data.validUntil,
    { message: 'validFrom must be on or before validUntil', path: ['validUntil'] }
  )

export const adminPatchFeatureFlagsSchema = z
  .object({
    checkoutEnabled: z.boolean().optional(),
    onlinePaymentsEnabled: z.boolean().optional(),
    signupsEnabled: z.boolean().optional(),
    dealerSignupsEnabled: z.boolean().optional(),
  })
  .strict()

export const broadcastSegmentSchema = z.enum([
  'all_customers',
  'all_dealers',
  'overdue_customers',
  'active_subscribers',
  'pending_dealers',
])

export const adminCreateBroadcastSchema = z
  .object({
    segment: broadcastSegmentSchema,
    subject: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(10_000),
    channels: z
      .object({
        inApp: z.boolean(),
        email: z.boolean(),
      })
      .refine((channels) => channels.inApp || channels.email, {
        message: 'At least one channel (inApp or email) must be enabled',
      }),
  })
  .strict()
