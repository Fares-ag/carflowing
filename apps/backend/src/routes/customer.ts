import crypto from 'crypto'
import {
  customerCreateBookingRequestSchema,
  customerPatchDocumentsSchema,
  customerPatchProfileSchema,
  customerCancelRentalSchema,
  validateCheckoutNote,
} from '@carflow/shared/validation'
import { and, count, desc, eq, gt, inArray, or } from 'drizzle-orm'
import { Router } from 'express'
import { hashPassword } from '../auth/password.js'
import { revokeAllRefreshSessions } from '../auth/sessions.js'
import { clearAuthCookies } from '../auth/tokens.js'
import { sendVerificationEmail } from '../auth/verification.js'
import { db } from '../db/index.js'
import {
  mapBookingRequest,
  mapComplaint,
  mapDealer,
  mapFavorite,
  mapInvoice,
  mapNotification,
  mapPayment,
  mapPaymentMethod,
  mapRental,
  mapRentalEvent,
  mapSubscription,
  mapSwapRequest,
  mapVehicle,
} from '../db/mappers.js'
import {
  bookingRequests,
  complaints,
  complaintReplies,
  consentRecords,
  customerProfiles,
  dealers,
  emailOutbox,
  emailVerificationTokens,
  favorites,
  invoices,
  messages,
  notifications,
  passwordResetTokens,
  paymentMethods,
  payments,
  profiles,
  referralCodes,
  refreshSessions,
  rentalEvents,
  rentals,
  subscriptions,
  swapRequests,
  twoFaChallenges,
  userPreferences,
  userSecurity,
  vehicles,
} from '../db/schema.js'
import { optionalAuth, requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js'
import { requireCheckoutEnabled } from '../middleware/featureFlags.js'
import { logAuditSafe } from '../services/audit.js'
import { billingCapabilities } from '../services/savedCardPayments.js'
import { trackAnalyticsEventSafe } from '../services/analyticsEvents.js'
import { createBookingRequestForVehicle, sanitizeCartNoteForPersist, withdrawPendingBookingRequest } from '../services/booking.js'
import { userOwnsStoredPath } from '../services/documentAccess.js'
import { getMaxPauseDays, getSubscriptionDepositAmount } from '../services/appSettings.js'
import { buildCustomerDashboardResponse } from '../services/dashboardStats.js'
import { cancelRental, swapEligibleFrom } from '../services/rentalLifecycle.js'
import {
  buildCatalogConditions,
  catalogNeedsDealerJoin,
  catalogOrderBy,
  parseCatalogQuery,
} from '../services/vehicleCatalog.js'
import {
  buildVehicleCatalogFilter,
  checkCustomerHoldCapacity,
  getHoldCutoffs,
  holdIsLiveCondition,
  holdLimitMessage,
  releaseHoldExceedingCap,
} from '../services/vehicleAvailability.js'
import {
  attachReviewAggregates,
  fetchVehicleReviewAggregates,
  listDealerPublicReviews,
  listVehicleReviews,
} from '../services/reviews.js'
import { deleteStoredFile } from '../storage/index.js'
import { asyncHandler, cursorPaginated, paginated, parseCursorPagination, parsePagination, attachUuidParamGuard } from '../utils/http.js'
import { parseBody, formatZodError } from '../validation/parse.js'
import { customerFeaturesRouter } from './customerFeatures.js'

export const customerRouter = Router()
attachUuidParamGuard(customerRouter)

async function deleteIdentityDocumentsSafely(
  profile:
    | {
        qidDocumentPath?: string | null
        driversLicensePath?: string | null
        avatarUrl?: string | null
      }
    | undefined
): Promise<void> {
  const docs: Array<{ label: string; path: string | null | undefined }> = [
    { label: 'qid', path: profile?.qidDocumentPath },
    { label: 'driversLicense', path: profile?.driversLicensePath },
    { label: 'avatar', path: profile?.avatarUrl },
  ]
  for (const { label, path: docPath } of docs) {
    if (!docPath?.trim()) continue
    try {
      await deleteStoredFile(docPath)
    } catch (err) {
      console.error('[account-delete] failed to delete identity document', { label, path: docPath, err })
    }
  }
}

/**
 * Removes an object that a new upload has just superseded. Never throws: the
 * DB already points at the new file, and an orphaned blob must not fail the
 * request that replaced it.
 */
async function deleteSupersededDocument(
  previous: string | null | undefined,
  next: string | null | undefined
): Promise<void> {
  const old = previous?.trim()
  if (!old || old === next?.trim()) return
  try {
    await deleteStoredFile(old)
  } catch (err) {
    console.error('[documents] failed to delete superseded document', { path: old, err })
  }
}

async function vehicleCatalogFilter(viewerId?: string, startDate?: string) {
  return buildVehicleCatalogFilter(viewerId, startDate)
}

async function withVehicleReviewStats<T extends { id: string }>(items: T[]) {
  const aggregates = await fetchVehicleReviewAggregates(items.map((item) => item.id))
  return attachReviewAggregates(items, aggregates)
}

// Public catalog — browse/detail pages load before login.
// Hide cars with pending bookings from other customers; the requester still sees theirs.
customerRouter.get(
  '/pricing-settings',
  optionalAuth,
  asyncHandler(async (_req, res) => {
    const subscriptionDepositAmount = await getSubscriptionDepositAmount()
    res.json({ subscriptionDepositAmount })
  })
)

customerRouter.get(
  '/vehicles',
  optionalAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const filters = parseCatalogQuery(req.query as Record<string, unknown>)
    const catalogWhere = await vehicleCatalogFilter(req.user?.sub, filters.startDate)
    const where = buildCatalogConditions(filters, catalogWhere)
    const orderBy = catalogOrderBy(filters.sort)
    const withDealer = catalogNeedsDealerJoin(filters)

    if (req.query.cursor !== undefined || req.query.mode === 'cursor') {
      const { pageSize, cursor, limit } = parseCursorPagination(req.query as Record<string, unknown>)
      const cursorWhere = cursor ? and(where!, gt(vehicles.id, cursor)) : where!
      if (withDealer) {
        const rows = await db
          .select({ vehicle: vehicles })
          .from(vehicles)
          .innerJoin(dealers, eq(vehicles.dealerId, dealers.id))
          .where(cursorWhere)
          .orderBy(vehicles.id)
          .limit(limit + 1)
        const pageRows = rows.slice(0, limit)
        const hasMore = rows.length > limit
        const items = await withVehicleReviewStats(pageRows.map((row) => mapVehicle(row.vehicle)))
        res.json(cursorPaginated(items, pageSize, hasMore ? items[items.length - 1]?.id ?? null : null))
        return
      }
      const rows = await db
        .select()
        .from(vehicles)
        .where(cursorWhere)
        .orderBy(vehicles.id)
        .limit(limit + 1)
      const pageRows = rows.slice(0, limit)
      const hasMore = rows.length > limit
      const items = await withVehicleReviewStats(pageRows.map(mapVehicle))
      res.json(cursorPaginated(items, pageSize, hasMore ? items[items.length - 1]?.id ?? null : null))
      return
    }

    const { page, pageSize, offset, limit } = parsePagination(req.query as Record<string, unknown>)

    if (withDealer) {
      const [totalRow] = await db
        .select({ value: count() })
        .from(vehicles)
        .innerJoin(dealers, eq(vehicles.dealerId, dealers.id))
        .where(where)
      const rows = await db
        .select({ vehicle: vehicles })
        .from(vehicles)
        .innerJoin(dealers, eq(vehicles.dealerId, dealers.id))
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset)
      res.json(
        paginated(
          await withVehicleReviewStats(rows.map((row) => mapVehicle(row.vehicle))),
          Number(totalRow.value),
          page,
          pageSize
        )
      )
      return
    }

    const [totalRow] = await db.select({ value: count() }).from(vehicles).where(where)
    const rows = await db
      .select()
      .from(vehicles)
      .where(where)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset)
    res.json(paginated(await withVehicleReviewStats(rows.map(mapVehicle)), Number(totalRow.value), page, pageSize))
  })
)

customerRouter.get(
  '/vehicles/:id',
  optionalAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const [row] = await db.select().from(vehicles).where(eq(vehicles.id, req.params.id)).limit(1)
    if (!row || row.status !== 'available') {
      res.status(404).json({ error: 'Vehicle not found' })
      return
    }
    // Only a *live* hold hides the car: an abandoned request that has outlived
    // its SLA must not delist the vehicle until the sweeper gets to it.
    const cutoffs = await getHoldCutoffs()
    const [pending] = await db
      .select({ customerId: bookingRequests.customerId })
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.vehicleId, row.id),
          eq(bookingRequests.status, 'pending'),
          holdIsLiveCondition(cutoffs)
        )
      )
      .limit(1)
    if (pending && pending.customerId !== req.user?.sub) {
      res.status(404).json({ error: 'Vehicle not found' })
      return
    }
    const [mapped] = await withVehicleReviewStats([mapVehicle(row)])
    res.json(mapped)
  })
)

customerRouter.get(
  '/vehicles/:id/reviews',
  optionalAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const [vehicle] = await db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(and(eq(vehicles.id, req.params.id), eq(vehicles.status, 'available')))
      .limit(1)
    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' })
      return
    }
    const { page, pageSize } = parsePagination(req.query as Record<string, unknown>)
    res.json(await listVehicleReviews(req.params.id, page, pageSize))
  })
)

customerRouter.get(
  '/dealers/:dealerId/reviews',
  optionalAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const [dealer] = await db
      .select({ id: dealers.id })
      .from(dealers)
      .where(eq(dealers.id, req.params.dealerId))
      .limit(1)
    if (!dealer) {
      res.status(404).json({ error: 'Dealer not found' })
      return
    }
    const { page, pageSize } = parsePagination(req.query as Record<string, unknown>)
    res.json(await listDealerPublicReviews(req.params.dealerId, page, pageSize))
  })
)

customerRouter.use(requireAuth, requireRole('customer'))

customerRouter.get(
  '/dashboard',
  asyncHandler(async (req: AuthedRequest, res) => {
    res.json(await buildCustomerDashboardResponse(req.user!.sub))
  })
)

customerRouter.get(
  '/rentals',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const where = eq(rentals.customerId, req.user!.sub)
    const [totalRow] = await db.select({ value: count() }).from(rentals).where(where)
    const rows = await db
      .select()
      .from(rentals)
      .where(where)
      .orderBy(desc(rentals.createdAt))
      .limit(limit)
      .offset(offset)
    res.json(paginated(rows.map(mapRental), Number(totalRow.value), page, pageSize))
  })
)

customerRouter.get(
  '/rentals/details',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const where = eq(rentals.customerId, req.user!.sub)
    const [totalRow] = await db.select({ value: count() }).from(rentals).where(where)
    const rows = await db
      .select({ rental: rentals, vehicle: vehicles, dealer: dealers })
      .from(rentals)
      .leftJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
      .leftJoin(dealers, eq(rentals.dealerId, dealers.id))
      .where(where)
      .orderBy(desc(rentals.createdAt))
      .limit(limit)
      .offset(offset)
    const items = rows.map((r) => ({
      ...mapRental(r.rental),
      vehicle: r.vehicle ? mapVehicle(r.vehicle) : undefined,
      dealer: r.dealer ? mapDealer(r.dealer) : undefined,
    }))
    res.json(paginated(items, Number(totalRow.value), page, pageSize))
  })
)

customerRouter.get(
  '/favorites',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const where = eq(favorites.customerId, req.user!.sub)
    const [totalRow] = await db.select({ value: count() }).from(favorites).where(where)
    const rows = await db
      .select()
      .from(favorites)
      .where(where)
      .orderBy(desc(favorites.createdAt))
      .limit(limit)
      .offset(offset)
    res.json(paginated(rows.map(mapFavorite), Number(totalRow.value), page, pageSize))
  })
)

customerRouter.get(
  '/favorites/vehicles',
  asyncHandler(async (req: AuthedRequest, res) => {
    const favRows = await db
      .select()
      .from(favorites)
      .where(eq(favorites.customerId, req.user!.sub))
      .orderBy(desc(favorites.createdAt))
    if (favRows.length === 0) {
      res.json({ items: [] })
      return
    }
    const vehicleIds = favRows.map((f) => f.vehicleId)
    const vehicleRows = await db.select().from(vehicles).where(inArray(vehicles.id, vehicleIds))
    const favouriteCutoffs = await getHoldCutoffs()
    const pendingRows = await db
      .select({ vehicleId: bookingRequests.vehicleId })
      .from(bookingRequests)
      .where(
        and(
          inArray(bookingRequests.vehicleId, vehicleIds),
          eq(bookingRequests.status, 'pending'),
          holdIsLiveCondition(favouriteCutoffs)
        )
      )
    const pendingIds = new Set(pendingRows.map((p) => p.vehicleId))
    const vehicleMap = new Map(vehicleRows.map((v) => [v.id, v]))
    const items = favRows.map((f) => {
      const vehicle = vehicleMap.get(f.vehicleId)
      let unavailableReason: 'removed' | 'pending_booking' | 'unavailable' | null = null
      if (!vehicle) {
        unavailableReason = 'removed'
      } else if (pendingIds.has(f.vehicleId)) {
        unavailableReason = 'pending_booking'
      } else if (vehicle.status !== 'available') {
        unavailableReason = 'unavailable'
      }
      return {
        favorite: mapFavorite(f),
        vehicle: vehicle ? mapVehicle(vehicle) : null,
        unavailableReason,
      }
    })
    res.json({ items })
  })
)

customerRouter.post(
  '/favorites',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { vehicleId } = req.body as { vehicleId?: string }
    if (!vehicleId) {
      res.status(400).json({ error: 'vehicleId required' })
      return
    }
    const [row] = await db
      .insert(favorites)
      .values({ customerId: req.user!.sub, vehicleId })
      .onConflictDoNothing({ target: [favorites.customerId, favorites.vehicleId] })
      .returning()
    if (!row) {
      const [existing] = await db
        .select()
        .from(favorites)
        .where(and(eq(favorites.customerId, req.user!.sub), eq(favorites.vehicleId, vehicleId)))
        .limit(1)
      if (existing) {
        res.status(200).json(mapFavorite(existing))
        return
      }
      res.status(409).json({ error: 'Unable to save favorite' })
      return
    }
    res.status(201).json(mapFavorite(row))
  })
)

customerRouter.delete(
  '/favorites/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    await db
      .delete(favorites)
      .where(and(eq(favorites.id, req.params.id), eq(favorites.customerId, req.user!.sub)))
    res.status(204).end()
  })
)

customerRouter.delete(
  '/favorites',
  asyncHandler(async (req: AuthedRequest, res) => {
    await db.delete(favorites).where(eq(favorites.customerId, req.user!.sub))
    res.status(204).end()
  })
)

customerRouter.get(
  '/booking-requests',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const where = eq(bookingRequests.customerId, req.user!.sub)
    const [totalRow] = await db.select({ value: count() }).from(bookingRequests).where(where)
    const rows = await db
      .select()
      .from(bookingRequests)
      .where(where)
      .orderBy(desc(bookingRequests.createdAt))
      .limit(limit)
      .offset(offset)
    res.json(paginated(rows.map(mapBookingRequest), Number(totalRow.value), page, pageSize))
  })
)

customerRouter.get(
  '/booking-requests/details',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const where = eq(bookingRequests.customerId, req.user!.sub)
    const [totalRow] = await db.select({ value: count() }).from(bookingRequests).where(where)
    const rows = await db
      .select({ br: bookingRequests, vehicle: vehicles })
      .from(bookingRequests)
      .leftJoin(vehicles, eq(bookingRequests.vehicleId, vehicles.id))
      .where(where)
      .orderBy(desc(bookingRequests.createdAt))
      .limit(limit)
      .offset(offset)
    const items = rows.map((r) => ({
      ...mapBookingRequest(r.br),
      vehicle: r.vehicle ? mapVehicle(r.vehicle) : undefined,
    }))
    res.json(paginated(items, Number(totalRow.value), page, pageSize))
  })
)

customerRouter.post(
  '/booking-requests',
  requireCheckoutEnabled,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parseBody(customerCreateBookingRequestSchema, req, res)
    if (!body) return
    if (body.note) {
      const noteCheck = validateCheckoutNote(body.note)
      if (!noteCheck.ok) {
        res.status(400).json({ error: noteCheck.error })
        return
      }
    }
    // Every pending request delists its vehicle for everyone else, so one
    // account may only hold a handful at a time. The pre-flight check keeps the
    // dealer from being notified about a request we are about to refuse; the
    // post-create reconciliation closes the concurrent-request race.
    const capacity = await checkCustomerHoldCapacity(req.user!.sub)
    if (!capacity.allowed) {
      res.status(409).json({ error: holdLimitMessage(capacity.limit) })
      return
    }
    const result = await createBookingRequestForVehicle({
      customerId: req.user!.sub,
      vehicleId: body.vehicleId,
      note: body.note,
    })
    if (result.status === 201 && 'id' in result.body) {
      const released = await releaseHoldExceedingCap(req.user!.sub, result.body.id)
      if (released) {
        res.status(409).json({ error: holdLimitMessage(capacity.limit) })
        return
      }
    }
    res.status(result.status).json(result.body)
  })
)

customerRouter.patch(
  '/booking-requests/:id/status',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { status } = req.body as { status?: string }
    // Customers may only withdraw their own pending request; approving is a
    // dealer/admin-only transition (see dealer.ts / admin.ts).
    if (status !== 'declined') {
      res.status(403).json({ error: 'Customers can only withdraw a pending booking request' })
      return
    }
    const result = await withdrawPendingBookingRequest({
      customerId: req.user!.sub,
      bookingRequestId: req.params.id,
    })
    res.status(result.status).json(result.body)
  })
)

customerRouter.patch(
  '/booking-requests/:id/note',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { note } = req.body as { note?: string }
    if (note) {
      const noteCheck = validateCheckoutNote(note)
      if (!noteCheck.ok) {
        res.status(400).json({ error: noteCheck.error })
        return
      }
    }
    const persistedNote = sanitizeCartNoteForPersist(note ?? null)
    // The note carries the cart (duration → price at approval), so it is
    // frozen once the request leaves `pending`, is an online-payment hold,
    // or already has a completed payment attached (audit: price tampering).
    const [existing] = await db
      .select()
      .from(bookingRequests)
      .where(
        and(eq(bookingRequests.id, req.params.id), eq(bookingRequests.customerId, req.user!.sub))
      )
      .limit(1)
    if (!existing) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    if (existing.status !== 'pending' || existing.awaitingPayment) {
      res.status(409).json({ error: 'This request can no longer be edited' })
      return
    }
    const [paid] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.bookingRequestId, existing.id), eq(payments.status, 'completed')))
      .limit(1)
    if (paid) {
      res.status(409).json({ error: 'This request has a completed payment and can no longer be edited' })
      return
    }
    const [row] = await db
      .update(bookingRequests)
      .set({ note: persistedNote })
      .where(eq(bookingRequests.id, existing.id))
      .returning()
    res.json(mapBookingRequest(row))
  })
)

customerRouter.get(
  '/subscription',
  asyncHandler(async (req: AuthedRequest, res) => {
    const [row] = await db
      .select()
      .from(subscriptions)
      .where(
        and(eq(subscriptions.ownerId, req.user!.sub), eq(subscriptions.ownerType, 'customer'))
      )
      .limit(1)
    res.json(row ? mapSubscription(row) : null)
  })
)

customerRouter.get(
  '/invoices',
  asyncHandler(async (req: AuthedRequest, res) => {
    const rows = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.ownerId, req.user!.sub), eq(invoices.ownerType, 'customer')))
      .orderBy(desc(invoices.date))
      .limit(500)
    res.json(rows.map(mapInvoice))
  })
)

customerRouter.get(
  '/payment-methods',
  asyncHandler(async (req: AuthedRequest, res) => {
    const rows = await db
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.userId, req.user!.sub))
    res.json(rows.map(mapPaymentMethod))
  })
)

customerRouter.get(
  '/billing-capabilities',
  asyncHandler(async (_req: AuthedRequest, res) => {
    res.json(billingCapabilities())
  })
)

customerRouter.delete(
  '/payment-methods/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    await db
      .delete(paymentMethods)
      .where(
        and(eq(paymentMethods.id, req.params.id), eq(paymentMethods.userId, req.user!.sub))
      )
    res.status(204).end()
  })
)

customerRouter.post(
  '/payment-methods/:id/default',
  asyncHandler(async (req: AuthedRequest, res) => {
    await db
      .update(paymentMethods)
      .set({ isDefault: false })
      .where(eq(paymentMethods.userId, req.user!.sub))
    await db
      .update(paymentMethods)
      .set({ isDefault: true })
      .where(
        and(eq(paymentMethods.id, req.params.id), eq(paymentMethods.userId, req.user!.sub))
      )
    res.json({ ok: true })
  })
)

customerRouter.get(
  '/profile',
  asyncHandler(async (req: AuthedRequest, res) => {
    const [row] = await db
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, req.user!.sub))
      .limit(1)
    if (!row) {
      res.json(null)
      return
    }
    res.json({
      id: row.id,
      userId: row.userId,
      status: row.status,
      joinDate: row.joinDate.toISOString(),
      rentalsCount: row.rentalsCount,
      totalSpent: Number(row.totalSpent),
      qidDocumentPath: row.qidDocumentPath ?? undefined,
      driversLicensePath: row.driversLicensePath ?? undefined,
    })
  })
)

customerRouter.patch(
  '/profile/documents',
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parseBody(customerPatchDocumentsSchema, req, res)
    if (!body) return
    const { qidDocumentPath, driversLicensePath } = body
    // Stored paths must belong to the caller (re-audit L7b: arbitrary
    // strings pointed admin/dealer viewers at other users' documents).
    for (const p of [qidDocumentPath, driversLicensePath]) {
      if (p !== undefined && p !== null && p !== '' && !userOwnsStoredPath(req.user!.sub, p)) {
        res.status(400).json({ error: 'Document path does not belong to your account' })
        return
      }
    }
    const [existing] = await db
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, req.user!.sub))
      .limit(1)
    if (existing) {
      const [row] = await db
        .update(customerProfiles)
        .set({
          ...(qidDocumentPath !== undefined ? { qidDocumentPath } : {}),
          ...(driversLicensePath !== undefined ? { driversLicensePath } : {}),
        })
        .where(eq(customerProfiles.id, existing.id))
        .returning()
      // The scan we just replaced is no longer reachable from anywhere and the
      // app promises it is deleted — so delete it (audit: orphaned ID scans).
      await deleteSupersededDocument(existing.qidDocumentPath, row.qidDocumentPath)
      await deleteSupersededDocument(existing.driversLicensePath, row.driversLicensePath)
      res.json(row)
      return
    }
    const [row] = await db
      .insert(customerProfiles)
      .values({
        userId: req.user!.sub,
        qidDocumentPath: qidDocumentPath ?? null,
        driversLicensePath: driversLicensePath ?? null,
      })
      .returning()
    res.json(row)
  })
)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

customerRouter.patch(
  '/profile',
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parseBody(customerPatchProfileSchema, req, res)
    if (!body) return
    const { name, phone, email } = body
    const patch: Record<string, unknown> = {}
    if (name !== undefined) patch.name = name
    if (phone !== undefined) patch.phone = phone
    if (email !== undefined) {
      const normalized = email.trim().toLowerCase()
      if (!EMAIL_RE.test(normalized)) {
        res.status(400).json({ error: 'Invalid email address' })
        return
      }
      const [taken] = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.email, normalized))
        .limit(1)
      if (taken && taken.id !== req.user!.sub) {
        res.status(409).json({ error: 'An account with this email already exists' })
        return
      }
      patch.email = normalized
      // Changing the address invalidates verification until re-confirmed.
      patch.emailVerifiedAt = null
    }
    const [row] = await db
      .update(profiles)
      .set(patch as any)
      .where(eq(profiles.id, req.user!.sub))
      .returning()
    if (email !== undefined) {
      void sendVerificationEmail({ id: row.id, email: row.email }).catch((err) =>
        console.error('verify email send failed', err)
      )
    }
    res.json({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      avatarUrl: row.avatarUrl,
    })
  })
)

customerRouter.get(
  '/profile/full',
  asyncHandler(async (req: AuthedRequest, res) => {
    const [user] = await db.select().from(profiles).where(eq(profiles.id, req.user!.sub)).limit(1)
    const [cp] = await db
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, req.user!.sub))
      .limit(1)
    // select() returns every profiles column, including password_hash.
    const { passwordHash: _passwordHash, ...safeProfile } = user ?? {}
    res.json({ profile: user ? safeProfile : null, customerProfile: cp ?? null })
  })
)

customerRouter.patch(
  '/profile/avatar',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { avatarUrl } = req.body as { avatarUrl?: string }
    if (!avatarUrl) {
      res.status(400).json({ error: 'avatarUrl required' })
      return
    }
    const [previous] = await db
      .select({ avatarUrl: profiles.avatarUrl })
      .from(profiles)
      .where(eq(profiles.id, req.user!.sub))
      .limit(1)
    await db.update(profiles).set({ avatarUrl }).where(eq(profiles.id, req.user!.sub))
    // Only ever delete an object this user owns: avatarUrl can also point at a
    // third-party image the account was created with.
    if (previous?.avatarUrl && userOwnsStoredPath(req.user!.sub, previous.avatarUrl)) {
      await deleteSupersededDocument(previous.avatarUrl, avatarUrl)
    }
    res.json({ ok: true })
  })
)

customerRouter.get(
  '/notifications',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const where = eq(notifications.userId, req.user!.sub)
    const [totalRow] = await db.select({ value: count() }).from(notifications).where(where)
    const rows = await db
      .select()
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset)
    res.json(paginated(rows.map(mapNotification), Number(totalRow.value), page, pageSize))
  })
)

customerRouter.get(
  '/notifications/unread-count',
  asyncHandler(async (req: AuthedRequest, res) => {
    const [row] = await db
      .select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, req.user!.sub), eq(notifications.read, false)))
    res.json({ count: Number(row?.value ?? 0) })
  })
)

customerRouter.post(
  '/notifications/:id/read',
  asyncHandler(async (req: AuthedRequest, res) => {
    await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.id, req.params.id), eq(notifications.userId, req.user!.sub)))
    res.json({ ok: true })
  })
)

customerRouter.post(
  '/notifications/read-all',
  asyncHandler(async (req: AuthedRequest, res) => {
    await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.userId, req.user!.sub))
    res.json({ ok: true })
  })
)

// Customers may only CANCEL their own subscription; every other transition
// (activation, completion, past_due) belongs to dealers, admins, or billing.
// Fixes audit BUG-02 (arbitrary customer-set rental status).
customerRouter.patch(
  '/rentals/:id/status',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { status } = req.body as { status?: string }
    if (status !== 'cancelled') {
      res.status(403).json({ error: 'Customers can only cancel their subscription' })
      return
    }
    const cancelFields = customerCancelRentalSchema.safeParse({
      reason: (req.body as { reason?: unknown }).reason,
      collection: (req.body as { collection?: unknown }).collection,
    })
    if (!cancelFields.success) {
      res.status(400).json({ error: formatZodError(cancelFields.error) })
      return
    }
    const result = await cancelRental({
      rentalId: req.params.id,
      actor: { id: req.user!.sub, role: 'customer' },
      reason: cancelFields.data.reason,
      collection: cancelFields.data.collection,
    })
    res.status(result.status).json(result.status < 400 ? mapRental(result.body) : result.body)
  })
)

customerRouter.post(
  '/rentals/:id/cancel',
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parseBody(customerCancelRentalSchema, req, res)
    if (!body) return
    const result = await cancelRental({
      rentalId: req.params.id,
      actor: { id: req.user!.sub, role: 'customer' },
      reason: body.reason,
      collection: body.collection,
    })
    res.status(result.status).json(result.status < 400 ? mapRental(result.body) : result.body)
  })
)

/** Full subscription view: rental + vehicle + invoices + events + swap state. */
customerRouter.get(
  '/rentals/:id/subscription',
  asyncHandler(async (req: AuthedRequest, res) => {
    const [row] = await db
      .select({ rental: rentals, vehicle: vehicles })
      .from(rentals)
      .leftJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
      .where(and(eq(rentals.id, req.params.id), eq(rentals.customerId, req.user!.sub)))
      .limit(1)
    if (!row) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const invoiceRows = await db
      .select()
      .from(invoices)
      .where(eq(invoices.rentalId, row.rental.id))
      .orderBy(desc(invoices.date))
    const eventRows = await db
      .select()
      .from(rentalEvents)
      .where(eq(rentalEvents.rentalId, row.rental.id))
      .orderBy(desc(rentalEvents.createdAt))
    const swapRows = await db
      .select()
      .from(swapRequests)
      .where(eq(swapRequests.rentalId, row.rental.id))
      .orderBy(desc(swapRequests.createdAt))
    const eligibleFrom = await swapEligibleFrom(row.rental.activatedAt)
    const maxPauseDays = await getMaxPauseDays()
    res.json({
      rental: mapRental(row.rental),
      vehicle: row.vehicle ? mapVehicle(row.vehicle) : null,
      invoices: invoiceRows.map(mapInvoice),
      events: eventRows.map(mapRentalEvent),
      swapRequests: swapRows.map(mapSwapRequest),
      swapEligibleFrom: eligibleFrom ? eligibleFrom.toISOString() : null,
      maxPauseDays,
    })
  })
)

/** Request an invygo-style car swap (same dealer, after the eligibility window). */
customerRouter.post(
  '/rentals/:id/swap-requests',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { vehicleId, note } = req.body as { vehicleId?: string; note?: string }
    if (!vehicleId) {
      res.status(400).json({ error: 'vehicleId required' })
      return
    }
    const [rental] = await db
      .select()
      .from(rentals)
      .where(and(eq(rentals.id, req.params.id), eq(rentals.customerId, req.user!.sub)))
      .limit(1)
    if (!rental) {
      res.status(404).json({ error: 'Rental not found' })
      return
    }
    if (rental.status !== 'active') {
      res.status(409).json({ error: 'Swaps are only available on an active subscription' })
      return
    }
    const eligibleFrom = await swapEligibleFrom(rental.activatedAt)
    if (!eligibleFrom || eligibleFrom > new Date()) {
      res.status(409).json({
        error: eligibleFrom
          ? `Swaps unlock on ${eligibleFrom.toISOString().slice(0, 10)}`
          : 'Swaps unlock after handover',
      })
      return
    }
    if (vehicleId === rental.vehicleId) {
      res.status(400).json({ error: 'That is already your current vehicle' })
      return
    }
    const [target] = await db.select().from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1)
    if (!target || target.dealerId !== rental.dealerId) {
      res.status(404).json({ error: 'Vehicle not found in your dealer’s fleet' })
      return
    }
    if (target.status !== 'available') {
      res.status(409).json({ error: 'That vehicle is not currently available' })
      return
    }
    try {
      const [row] = await db
        .insert(swapRequests)
        .values({
          rentalId: rental.id,
          customerId: req.user!.sub,
          currentVehicleId: rental.vehicleId,
          requestedVehicleId: vehicleId,
          note: note?.trim() || null,
        })
        .returning()
      trackAnalyticsEventSafe({
        eventType: 'swap_requested',
        userId: req.user!.sub,
        entityType: 'swap_request',
        entityId: row.id,
        properties: {
          rentalId: rental.id,
          currentVehicleId: rental.vehicleId,
          requestedVehicleId: vehicleId,
        },
      })
      const { notifyDealerOwner } = await import('../services/notify.js')
      await notifyDealerOwner(db, rental.dealerId, {
        type: 'info',
        title: 'Car swap requested',
        message: 'A subscriber requested a vehicle swap. Review it in Swap Requests.',
      }).catch(() => undefined)
      res.status(201).json(mapSwapRequest(row))
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        res.status(409).json({ error: 'You already have a pending swap request' })
        return
      }
      throw err
    }
  })
)

customerRouter.patch(
  '/swap-requests/:id/cancel',
  asyncHandler(async (req: AuthedRequest, res) => {
    const [row] = await db
      .update(swapRequests)
      .set({ status: 'cancelled', resolvedAt: new Date() })
      .where(
        and(
          eq(swapRequests.id, req.params.id),
          eq(swapRequests.customerId, req.user!.sub),
          eq(swapRequests.status, 'pending')
        )
      )
      .returning()
    if (!row) {
      res.status(404).json({ error: 'Not found or already resolved' })
      return
    }
    res.json(mapSwapRequest(row))
  })
)

customerRouter.get(
  '/complaints',
  asyncHandler(async (req: AuthedRequest, res) => {
    const rows = await db
      .select()
      .from(complaints)
      .where(eq(complaints.customerId, req.user!.sub))
      .orderBy(desc(complaints.createdAt))
      .limit(100)
    const items = await Promise.all(
      rows.map(async (c) => {
        const replies = await db
          .select({ reply: complaintReplies, author: profiles })
          .from(complaintReplies)
          .innerJoin(profiles, eq(complaintReplies.authorId, profiles.id))
          .where(eq(complaintReplies.complaintId, c.id))
          .orderBy(complaintReplies.createdAt)
        return {
          ...mapComplaint(c),
          replies: replies.map((r) => ({
            id: r.reply.id,
            body: r.reply.body,
            createdAt: r.reply.createdAt.toISOString(),
            authorName: r.author.name,
            fromSupport: r.author.id !== req.user!.sub,
          })),
        }
      })
    )
    res.json({ items })
  })
)

customerRouter.post(
  '/complaints',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { category, priority, subject, description } = req.body as {
      category?: string
      priority?: string
      subject?: string
      description?: string
    }
    if (!category?.trim() || !subject?.trim() || !description?.trim()) {
      res.status(400).json({ error: 'category, subject, and description are required' })
      return
    }
    const validPriority =
      priority === 'low' || priority === 'medium' || priority === 'high' || priority === 'urgent'
        ? priority
        : 'medium'
    const [row] = await db
      .insert(complaints)
      .values({
        customerId: req.user!.sub,
        category: category.trim(),
        priority: validPriority,
        subject: subject.trim(),
        description: description.trim(),
      })
      .returning()
    trackAnalyticsEventSafe({
      eventType: 'complaint_opened',
      userId: req.user!.sub,
      entityType: 'complaint',
      entityId: row.id,
      properties: { category: row.category, priority: row.priority },
    })
    res.status(201).json(mapComplaint(row))
  })
)

/**
 * Portability export (GDPR art. 20 / Qatar PDPPL): everything we hold about the
 * caller, not just the profile row. Documents are listed as a manifest with the
 * authenticated download path — the bytes themselves stay behind the document
 * proxy so an export can never leak a scan to an unauthenticated reader.
 */
customerRouter.get(
  '/account/export',
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.user!.sub
    const [user] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1)
    if (!user) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const { passwordHash: _passwordHash, ...safeProfile } = user
    const [cp] = await db
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, userId))
      .limit(1)
    const rentalRows = await db
      .select()
      .from(rentals)
      .where(eq(rentals.customerId, userId))
      .orderBy(desc(rentals.createdAt))
    const invoiceRows = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.ownerId, userId), eq(invoices.ownerType, 'customer')))
      .orderBy(desc(invoices.date))
    const paymentRows = await db
      .select()
      .from(payments)
      .where(eq(payments.customerId, userId))
      .orderBy(desc(payments.createdAt))
    const bookingRows = await db
      .select()
      .from(bookingRequests)
      .where(eq(bookingRequests.customerId, userId))
      .orderBy(desc(bookingRequests.createdAt))
    const messageRows = await db
      .select()
      .from(messages)
      .where(or(eq(messages.fromUserId, userId), eq(messages.toUserId, userId)))
      .orderBy(desc(messages.createdAt))
    const complaintRows = await db
      .select()
      .from(complaints)
      .where(eq(complaints.customerId, userId))
      .orderBy(desc(complaints.createdAt))
    const complaintIds = complaintRows.map((c) => c.id)
    const replyRows = complaintIds.length
      ? await db
          .select()
          .from(complaintReplies)
          .where(inArray(complaintReplies.complaintId, complaintIds))
          .orderBy(complaintReplies.createdAt)
      : []
    const notificationRows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
    const favoriteRows = await db
      .select()
      .from(favorites)
      .where(eq(favorites.customerId, userId))
      .orderBy(desc(favorites.createdAt))
    const paymentMethodRows = await db
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.userId, userId))
    const consentRows = await db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.profileId, userId))
      .orderBy(desc(consentRecords.acceptedAt))

    const documents = (
      [
        { type: 'qid' as const, path: cp?.qidDocumentPath },
        { type: 'drivers_license' as const, path: cp?.driversLicensePath },
      ] satisfies Array<{ type: string; path?: string | null }>
    )
      .filter((doc): doc is { type: 'qid' | 'drivers_license'; path: string } => !!doc.path?.trim())
      .map((doc) => ({
        type: doc.type,
        storagePath: doc.path,
        downloadUrl: `/api/uploads/documents/file?path=${encodeURIComponent(doc.path)}`,
      }))

    res.json({
      exportedAt: new Date().toISOString(),
      profile: safeProfile,
      customerProfile: cp ?? null,
      rentals: rentalRows.map(mapRental),
      invoices: invoiceRows.map(mapInvoice),
      payments: paymentRows.map(mapPayment),
      bookingRequests: bookingRows.map(mapBookingRequest),
      messages: messageRows.map((m) => ({
        id: m.id,
        direction: m.fromUserId === userId ? 'sent' : 'received',
        subject: m.subject,
        body: m.body,
        folder: m.folder,
        read: m.read,
        createdAt: m.createdAt.toISOString(),
      })),
      complaints: complaintRows.map((c) => ({
        ...mapComplaint(c),
        replies: replyRows
          .filter((r) => r.complaintId === c.id)
          .map((r) => ({
            id: r.id,
            body: r.body,
            createdAt: r.createdAt.toISOString(),
            fromSupport: r.authorId !== userId,
          })),
      })),
      notifications: notificationRows.map(mapNotification),
      favorites: favoriteRows.map(mapFavorite),
      paymentMethods: paymentMethodRows.map(mapPaymentMethod),
      consents: consentRows.map((c) => ({
        documentKind: c.documentKind,
        documentVersion: c.documentVersion,
        acceptedAt: c.acceptedAt.toISOString(),
      })),
      documents,
    })
  })
)

customerRouter.delete(
  '/account',
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.user!.sub
    const activeRentals = await db
      .select({ id: rentals.id })
      .from(rentals)
      .where(
        and(
          eq(rentals.customerId, userId),
          inArray(rentals.status, ['reserved', 'active', 'past_due'])
        )
      )
    if (activeRentals.length > 0) {
      res.status(409).json({ error: 'Cannot delete account with active rentals' })
      return
    }

    const anyRentals = await db
      .select({ id: rentals.id })
      .from(rentals)
      .where(eq(rentals.customerId, userId))
      .limit(1)

    const [account] = await db
      .select({ email: profiles.email, avatarUrl: profiles.avatarUrl })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1)

    const [identityDocs] = await db
      .select({
        qidDocumentPath: customerProfiles.qidDocumentPath,
        driversLicensePath: customerProfiles.driversLicensePath,
      })
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, userId))
      .limit(1)

    await db.transaction(async (tx) => {
      // Personal data with no retention claim, removed on both paths. The
      // hard-delete path would cascade most of it, but the anonymize path
      // keeps the profile row alive, so every table has to be named here.
      await tx.delete(favorites).where(eq(favorites.customerId, userId))
      await tx.delete(paymentMethods).where(eq(paymentMethods.userId, userId))
      await tx
        .delete(messages)
        .where(or(eq(messages.fromUserId, userId), eq(messages.toUserId, userId)))
      await tx.delete(complaintReplies).where(eq(complaintReplies.authorId, userId))
      await tx.delete(complaints).where(eq(complaints.customerId, userId))
      await tx.delete(notifications).where(eq(notifications.userId, userId))
      await tx.delete(userPreferences).where(eq(userPreferences.userId, userId))
      await tx.delete(userSecurity).where(eq(userSecurity.userId, userId))
      await tx.delete(referralCodes).where(eq(referralCodes.userId, userId))
      await tx.delete(refreshSessions).where(eq(refreshSessions.userId, userId))
      await tx.delete(twoFaChallenges).where(eq(twoFaChallenges.userId, userId))
      await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId))
      await tx.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId))
      // Queued/sent mail keeps the full rendered body — and the address — long
      // after the account is gone.
      if (account?.email) {
        await tx.delete(emailOutbox).where(eq(emailOutbox.to, account.email))
      }
      // The consent record is the evidence that consent was given; keep the
      // fact, drop the identifiers attached to it.
      await tx
        .update(consentRecords)
        .set({ ipAddress: null, userAgent: null })
        .where(eq(consentRecords.profileId, userId))
      await tx.delete(customerProfiles).where(eq(customerProfiles.userId, userId))

      if (anyRentals.length > 0) {
        // Rental/financial history must survive (RESTRICT FK + retention):
        // anonymize the profile instead of deleting it (re-audit L3).
        const randomSecret = crypto.randomBytes(24).toString('hex')
        await tx
          .update(profiles)
          .set({
            email: `deleted-${userId}@users.carflow.invalid`,
            name: 'Deleted User',
            phone: null,
            avatarUrl: null,
            status: 'suspended',
            emailVerifiedAt: null,
            passwordHash: await hashPassword(randomSecret),
          })
          .where(eq(profiles.id, userId))
      } else {
        await tx.delete(profiles).where(eq(profiles.id, userId))
      }
    })

    // Blob/disk objects are outside the transaction: only delete them once the
    // rows that referenced them are gone for good.
    const ownedAvatar =
      account?.avatarUrl && userOwnsStoredPath(userId, account.avatarUrl) ? account.avatarUrl : null
    await deleteIdentityDocumentsSafely({ ...identityDocs, avatarUrl: ownedAvatar })

    await revokeAllRefreshSessions(userId)
    await logAuditSafe({
      // The profile row is gone on the hard-delete path, and audit_logs.actor_id
      // is an FK — naming it there would drop the record of the deletion.
      actorId: anyRentals.length > 0 ? userId : null,
      actorRole: 'customer',
      action: anyRentals.length > 0 ? 'account.anonymized' : 'account.deleted',
      entityType: 'profile',
      entityId: userId,
    })
    clearAuthCookies(res)
    res.status(204).end()
  })
)

customerRouter.use(customerFeaturesRouter)
