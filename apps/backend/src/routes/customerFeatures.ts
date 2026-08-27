import { and, count, eq } from 'drizzle-orm'
import { Router } from 'express'
import { securityRouter } from '../auth/securityRouter.js'
import { db } from '../db/index.js'
import {
  mapMessage,
  mapPaymentMethod,
  mapRental,
} from '../db/mappers.js'
import {
  appSettings,
  customerProfiles,
  invoices,
  messages,
  paymentMethods,
  profiles,
  rentalReviews,
  rentals,
  userPreferences,
  vehicles,
} from '../db/schema.js'
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js'
import {
  assertBookingContext,
  assertRentalContext,
  customerCanMessageDealer,
  listMessageThreads,
  listThreadMessages,
  listUserMessages,
  resolveComposeSubject,
  resolveDealerByOwnerUserId,
  sendMessage,
  userOwnsMessage,
} from '../services/messages.js'
import { buildContractPdf, buildInvoicePdf } from '../services/pdfDocuments.js'
import { validatePromoCode } from '../services/promoCodes.js'
import { getReferralSummary } from '../services/referrals.js'
import { createRentalReview } from '../services/reviews.js'
import { extendRentalTerm } from '../services/rentalExtension.js'
import { pauseRental, resumeRental } from '../services/rentalLifecycle.js'
import {
  createCustomerMaintenanceRequest,
  listRentalMaintenanceRequests,
} from '../services/maintenance.js'
import { asyncHandler, paginated, parsePagination, attachUuidParamGuard } from '../utils/http.js'
import { parseBody } from '../validation/parse.js'
import {
  customerCreateMaintenanceRequestSchema,
  customerCreatePaymentMethodSchema,
  customerCreateReviewSchema,
  customerExtendRentalSchema,
  pauseRentalSchema,
  customerPatchMessageFolderSchema,
  customerPatchMessageReadSchema,
  customerValidatePromoSchema,
  portalCreateMessageSchema,
} from '../validation/schemas.js'

export const customerFeaturesRouter = Router()
attachUuidParamGuard(customerFeaturesRouter)
customerFeaturesRouter.use(requireAuth, requireRole('customer'))

customerFeaturesRouter.post(
  '/rentals/:id/extend',
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parseBody(customerExtendRentalSchema, req, res)
    if (!body) return

    const result = await extendRentalTerm({
      rentalId: req.params.id,
      scope: { customerId: req.user!.sub },
      actor: { id: req.user!.sub, role: 'customer' },
      months: body.months,
    })
    res.status(result.status).json(result.body)
  })
)

customerFeaturesRouter.post(
  '/rentals/:id/pause',
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parseBody(pauseRentalSchema, req, res)
    if (!body) return
    const result = await pauseRental({
      rentalId: req.params.id,
      actor: { id: req.user!.sub, role: 'customer' },
      days: body.days,
      reason: body.reason,
    })
    res.status(result.status).json(result.status < 400 ? mapRental(result.body) : result.body)
  })
)

customerFeaturesRouter.post(
  '/rentals/:id/resume',
  asyncHandler(async (req: AuthedRequest, res) => {
    const result = await resumeRental({
      rentalId: req.params.id,
      actor: { id: req.user!.sub, role: 'customer' },
    })
    res.status(result.status).json(result.status < 400 ? mapRental(result.body) : result.body)
  })
)

customerFeaturesRouter.post(
  '/rentals/:id/maintenance-requests',
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parseBody(customerCreateMaintenanceRequestSchema, req, res)
    if (!body) return

    const title = body.title?.trim() || 'Service request'
    const result = await createCustomerMaintenanceRequest({
      rentalId: req.params.id,
      customerId: req.user!.sub,
      title,
      description: body.description.trim(),
      photos: body.photos,
    })
    res.status(result.status).json(result.body)
  })
)

customerFeaturesRouter.get(
  '/rentals/:id/maintenance-requests',
  asyncHandler(async (req: AuthedRequest, res) => {
    const result = await listRentalMaintenanceRequests(req.params.id, req.user!.sub)
    res.status(result.status).json(result.body)
  })
)

customerFeaturesRouter.post(
  '/rentals/:id/reviews',
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parseBody(customerCreateReviewSchema, req, res)
    if (!body) return
    const result = await createRentalReview({
      rentalId: req.params.id,
      customerId: req.user!.sub,
      rating: body.rating,
      comment: body.comment,
    })
    res.status(result.status).json(result.body)
  })
)

customerFeaturesRouter.get(
  '/rentals/:id/reviews',
  asyncHandler(async (req: AuthedRequest, res) => {
    const [row] = await db
      .select()
      .from(rentalReviews)
      .where(
        and(eq(rentalReviews.rentalId, req.params.id), eq(rentalReviews.customerId, req.user!.sub))
      )
      .limit(1)
    res.json(row ? { id: row.id, rating: row.rating, comment: row.comment, createdAt: row.createdAt.toISOString() } : null)
  })
)

customerFeaturesRouter.post(
  '/promo-codes/validate',
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parseBody(customerValidatePromoSchema, req, res)
    if (!body) return

    const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, body.vehicleId)).limit(1)
    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' })
      return
    }
    const months = body.termMonths ?? 1
    const listMonthly = Number(vehicle.pricePerDay) * 30
    const result = await validatePromoCode({
      code: body.code,
      customerId: req.user!.sub,
      termMonths: months,
      subtotal: listMonthly,
    })
    res.json(result)
  })
)

customerFeaturesRouter.post(
  '/payment-methods',
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parseBody(customerCreatePaymentMethodSchema, req, res)
    if (!body) return

    const existing = await db
      .select({ id: paymentMethods.id })
      .from(paymentMethods)
      .where(eq(paymentMethods.userId, req.user!.sub))
    const isFirst = existing.length === 0
    const [row] = await db
      .insert(paymentMethods)
      .values({
        userId: req.user!.sub,
        brand: body.brand,
        last4: body.last4,
        expiryMonth: body.expiryMonth,
        expiryYear: body.expiryYear,
        methodType: body.methodType ?? 'card',
        provider: 'reference',
        isDefault: isFirst,
      })
      .returning()
    res.status(201).json(mapPaymentMethod(row))
  })
)

customerFeaturesRouter.get(
  '/invoices/:id/pdf',
  asyncHandler(async (req: AuthedRequest, res) => {
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, req.params.id), eq(invoices.ownerId, req.user!.sub)))
      .limit(1)
    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found' })
      return
    }
    const [user] = await db.select().from(profiles).where(eq(profiles.id, req.user!.sub)).limit(1)
    const [settings] = await db.select().from(appSettings).limit(1)
    const pdf = buildInvoicePdf({
      companyName: settings?.companyName ?? 'CarFlow',
      invoiceId: invoice.id,
      date: String(invoice.date),
      description: invoice.description,
      amount: Number(invoice.amount),
      status: invoice.status,
      customerName: user?.name ?? 'Customer',
    })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.id.slice(0, 8)}.pdf"`)
    res.send(pdf)
  })
)

customerFeaturesRouter.get(
  '/rentals/:id/contract/pdf',
  asyncHandler(async (req: AuthedRequest, res) => {
    const [row] = await db
      .select({ rental: rentals, vehicle: vehicles })
      .from(rentals)
      .leftJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
      .where(and(eq(rentals.id, req.params.id), eq(rentals.customerId, req.user!.sub)))
      .limit(1)
    if (!row) {
      res.status(404).json({ error: 'Rental not found' })
      return
    }
    const [user] = await db.select().from(profiles).where(eq(profiles.id, req.user!.sub)).limit(1)
    const [settings] = await db.select().from(appSettings).limit(1)
    const pdf = buildContractPdf({
      companyName: settings?.companyName ?? 'CarFlow',
      customerName: user?.name ?? 'Customer',
      vehicleName: row.vehicle?.name ?? 'Vehicle',
      startDate: String(row.rental.startDate),
      endDate: String(row.rental.endDate),
      monthlyAmount: Number(row.rental.monthlyAmount),
      termMonths: row.rental.termMonths,
    })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="contract-${row.rental.id.slice(0, 8)}.pdf"`)
    res.send(pdf)
  })
)

customerFeaturesRouter.get(
  '/messages',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const folder = (req.query.folder as string | undefined) ?? 'inbox'
    const result = await listUserMessages(req.user!.sub, { folder, offset, limit })
    res.json(paginated(result.items, result.total, page, pageSize))
  })
)

customerFeaturesRouter.get(
  '/messages/threads',
  asyncHandler(async (req: AuthedRequest, res) => {
    const threads = await listMessageThreads(req.user!.sub)
    res.json(threads)
  })
)

customerFeaturesRouter.get(
  '/messages/thread',
  asyncHandler(async (req: AuthedRequest, res) => {
    const threadSubject = String(req.query.subject ?? '').trim()
    if (!threadSubject) {
      res.status(400).json({ error: 'subject query parameter is required' })
      return
    }
    const items = await listThreadMessages(req.user!.sub, threadSubject)
    res.json(items)
  })
)

customerFeaturesRouter.post(
  '/messages',
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parseBody(portalCreateMessageSchema, req, res)
    if (!body) return

    const dealer = await resolveDealerByOwnerUserId(body.toUserId)
    if (!dealer) {
      res.status(404).json({ error: 'Dealer not found' })
      return
    }

    const subject = await resolveComposeSubject({
      subject: body.subject,
      rentalId: body.rentalId,
      bookingRequestId: body.bookingRequestId,
      replyToMessageId: body.replyToMessageId,
      userId: req.user!.sub,
    })
    if (!subject) {
      res.status(400).json({ error: 'Could not resolve thread subject' })
      return
    }

    const allowed = await customerCanMessageDealer(req.user!.sub, dealer.id)
    if (!allowed) {
      res.status(403).json({ error: 'No active rental or booking relationship with this dealer' })
      return
    }
    if (body.rentalId && !(await assertRentalContext(body.rentalId, dealer.id, req.user!.sub))) {
      res.status(403).json({ error: 'Rental does not match this dealer' })
      return
    }
    if (
      body.bookingRequestId &&
      !(await assertBookingContext(body.bookingRequestId, dealer.id, req.user!.sub))
    ) {
      res.status(403).json({ error: 'Booking request does not match this dealer' })
      return
    }

    const sent = await sendMessage({
      fromUserId: req.user!.sub,
      toUserId: body.toUserId,
      subject,
      body: body.body,
    })
    res.status(201).json(sent)
  })
)

customerFeaturesRouter.get(
  '/messages/unread-count',
  asyncHandler(async (req: AuthedRequest, res) => {
    const [row] = await db
      .select({ value: count() })
      .from(messages)
      .where(
        and(
          eq(messages.toUserId, req.user!.sub),
          eq(messages.folder, 'inbox'),
          eq(messages.read, false)
        )
      )
    res.json({ count: Number(row?.value ?? 0) })
  })
)

customerFeaturesRouter.patch(
  '/messages/:id/read',
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parseBody(customerPatchMessageReadSchema, req, res)
    if (!body) return

    const [existing] = await db.select().from(messages).where(eq(messages.id, req.params.id)).limit(1)
    if (!existing || !userOwnsMessage(req.user!.sub, existing)) {
      res.status(404).json({ error: 'Not found' })
      return
    }

    const [row] = await db
      .update(messages)
      .set({ read: body.read })
      .where(eq(messages.id, req.params.id))
      .returning()
    res.json(mapMessage(row))
  })
)

customerFeaturesRouter.patch(
  '/messages/:id/folder',
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parseBody(customerPatchMessageFolderSchema, req, res)
    if (!body) return

    const [existing] = await db.select().from(messages).where(eq(messages.id, req.params.id)).limit(1)
    if (!existing || !userOwnsMessage(req.user!.sub, existing)) {
      res.status(404).json({ error: 'Not found' })
      return
    }

    if (existing.folder === 'sent') {
      res.status(409).json({
        error: 'Sent messages cannot be moved between folders.',
      })
      return
    }

    const [row] = await db
      .update(messages)
      .set({ folder: body.folder as any })
      .where(eq(messages.id, req.params.id))
      .returning()
    res.json(mapMessage(row))
  })
)

customerFeaturesRouter.get(
  '/preferences',
  asyncHandler(async (req: AuthedRequest, res) => {
    const [row] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, req.user!.sub))
      .limit(1)
    res.json(
      row ?? {
        emailNotifications: true,
        pushNotifications: true,
        smsNotifications: false,
        whatsappNotifications: false,
        marketingEmails: false,
        locale: 'en',
        theme: 'system',
      }
    )
  })
)

customerFeaturesRouter.patch(
  '/preferences',
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = req.body as Partial<{
      emailNotifications: boolean
      pushNotifications: boolean
      smsNotifications: boolean
      whatsappNotifications: boolean
      marketingEmails: boolean
      locale: string
      theme: string
    }>
    const [existing] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, req.user!.sub))
      .limit(1)
    const patch = {
      ...(body.emailNotifications !== undefined ? { emailNotifications: !!body.emailNotifications } : {}),
      ...(body.pushNotifications !== undefined ? { pushNotifications: !!body.pushNotifications } : {}),
      ...(body.smsNotifications !== undefined ? { smsNotifications: !!body.smsNotifications } : {}),
      ...(body.whatsappNotifications !== undefined
        ? { whatsappNotifications: !!body.whatsappNotifications }
        : {}),
      ...(body.marketingEmails !== undefined ? { marketingEmails: !!body.marketingEmails } : {}),
      ...(body.locale !== undefined ? { locale: body.locale === 'ar' ? 'ar' : 'en' } : {}),
      ...(body.theme !== undefined ? { theme: body.theme } : {}),
      updatedAt: new Date(),
    }
    const [row] = existing
      ? await db
          .update(userPreferences)
          .set(patch)
          .where(eq(userPreferences.userId, req.user!.sub))
          .returning()
      : await db
          .insert(userPreferences)
          .values({ userId: req.user!.sub, ...patch })
          .returning()
    res.json(row)
  })
)

customerFeaturesRouter.get(
  '/referrals',
  asyncHandler(async (req: AuthedRequest, res) => {
    const summary = await getReferralSummary(req.user!.sub)
    res.json(summary)
  })
)

customerFeaturesRouter.patch(
  '/profile/billing-address',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { line1, line2, city, country, postalCode } = req.body as {
      line1?: string
      line2?: string
      city?: string
      country?: string
      postalCode?: string
    }
    const [existing] = await db
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, req.user!.sub))
      .limit(1)
    const values = {
      billingAddressLine1: line1?.trim() || null,
      billingAddressLine2: line2?.trim() || null,
      billingCity: city?.trim() || null,
      billingCountry: country?.trim() || null,
      billingPostalCode: postalCode?.trim() || null,
    }
    const [row] = existing
      ? await db
          .update(customerProfiles)
          .set(values)
          .where(eq(customerProfiles.id, existing.id))
          .returning()
      : await db
          .insert(customerProfiles)
          .values({ userId: req.user!.sub, ...values })
          .returning()
    res.json({
      line1: row.billingAddressLine1,
      line2: row.billingAddressLine2,
      city: row.billingCity,
      country: row.billingCountry,
      postalCode: row.billingPostalCode,
    })
  })
)

customerFeaturesRouter.get(
  '/profile/billing-address',
  asyncHandler(async (req: AuthedRequest, res) => {
    const [row] = await db
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, req.user!.sub))
      .limit(1)
    res.json({
      line1: row?.billingAddressLine1 ?? '',
      line2: row?.billingAddressLine2 ?? '',
      city: row?.billingCity ?? '',
      country: row?.billingCountry ?? '',
      postalCode: row?.billingPostalCode ?? '',
    })
  })
)

/**
 * TOTP + SMS verification. The handlers live in a shared, role-agnostic router
 * (src/auth/securityRouter.ts) that is also mounted at /api/auth/security so
 * staff and dealers can enrol; these customer paths are kept so the customer
 * app and its tests are unaffected.
 */
customerFeaturesRouter.use('/security', securityRouter)
