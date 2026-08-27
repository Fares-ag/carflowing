import crypto from 'crypto'
import { isAdminPortalRole } from '@carflow/shared/types'
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm'
import { Router } from 'express'
import { hashPassword } from '../auth/password.js'
import { revokeAllRefreshSessions } from '../auth/sessions.js'
import { db } from '../db/index.js'
import {
  mapAuditLog,
  mapBookingRequest,
  mapComplaint,
  mapDealer,
  mapInvoice,
  mapMessage,
  mapPayment,
  mapPlan,
  mapProfileToUser,
  mapRental,
  mapRentalEvent,
  mapVehicle,
} from '../db/mappers.js'
import {
  appSettings,
  auditLogs,
  bookingRequests,
  complaints,
  complaintReplies,
  customerProfiles,
  dealers,
  invoices,
  maintenanceRecords,
  messages,
  payments,
  payouts,
  plans,
  profiles,
  rentalEvents,
  rentals,
  subscriptions,
  vehicles,
} from '../db/schema.js'
import { requireAuth, requireAdminPortal, requireFinanceCapability, requireFullAdmin, requireOpsCapability, requireSupportCapability, type AuthedRequest } from '../middleware/auth.js'
import { logAudit, logAuditSafe } from '../services/audit.js'
import { trackAnalyticsEvent, trackAnalyticsEventSafe } from '../services/analyticsEvents.js'
import { transitionBookingRequest } from '../services/booking.js'
import {
  aggregatePlatformRevenue,
  aggregateCustomerProfileStats,
  countRentals,
  countRentalsByStatus,
  countRentalsToday,
  countVehicles,
  monthlyPaymentBuckets,
  monthlyRentalBuckets,
  platformDashboardCounts,
  vehicleCategoryDistribution,
} from '../services/dashboardStats.js'
import {
  sendAccountSuspendedEmail,
  sendComplaintReplyEmail,
  sendDealerInviteEmail,
  sendDealerApprovedEmail,
  sendPayoutPaidEmail,
} from '../services/mail.js'
import { notifyUserSafe } from '../services/notify.js'
import { sendMessage } from '../services/messages.js'
import { adminChangeRentalStatus, cancelRental, pauseRental, resumeRental } from '../services/rentalLifecycle.js'
import { reverseInvoicePaymentRefund, voidInvoiceByAdmin } from '../services/billing.js'
import { generateDealerPayoutsUnderLock, markPayoutPaid, unmarkPayoutPaid } from '../services/payouts.js'
import {
  businessSettingsApiPayload,
  businessSettingsAuditSnapshot,
  ensureAppSettingsRow,
  featureFlagsAuditSnapshot,
  featureFlagsFromRuntime,
  featureFlagsPatchFromBody,
  invalidateAppSettingsCache,
  mapRuntimeAppSettings,
  settingsApiPayload,
  settingsAuditSnapshot,
} from '../services/appSettings.js'
import { requestSkipCashRefund } from '../services/skipcash.js'
import { asyncHandler, paginated, parsePagination, attachUuidParamGuard } from '../utils/http.js'
import { parseBody } from '../validation/parse.js'
import {
  adminCreateMessageSchema,
  adminCreatePlanSchema,
  adminCreateVehicleSchema,
  adminPatchBusinessSettingsSchema,
  adminPatchFeatureFlagsSchema,
  adminPatchMessageFolderSchema,
  adminPatchMessageReadSchema,
  adminPatchPlanSchema,
  adminPatchVehicleStatusSchema,
  pauseRentalSchema,
} from '../validation/schemas.js'
import { adminBroadcastRouter } from './adminBroadcast.js'
import { adminFeaturesRouter } from './adminFeatures.js'
import { adminPromoRouter } from './adminPromo.js'

export const adminRouter = Router()
attachUuidParamGuard(adminRouter)
adminRouter.use(requireAuth, requireAdminPortal)

// Mounted ahead of this router’s own routes so literal paths such as
// /vehicles/search match before the /vehicles/:id pattern captures them.
adminRouter.use(adminPromoRouter)
adminRouter.use(adminBroadcastRouter)
adminRouter.use(adminFeaturesRouter)

adminRouter.get(
  '/dashboard',
  asyncHandler(async (_req, res) => {
    const [counts, totalRevenue, statusCounts, bucketsR, bucketsP, todayBookingsCount] =
      await Promise.all([
        platformDashboardCounts(),
        aggregatePlatformRevenue(),
        countRentalsByStatus(),
        monthlyRentalBuckets(4),
        monthlyPaymentBuckets(4),
        countRentalsToday(),
      ])
    const recent = await db
      .select({ rental: rentals, vehicle: vehicles, customer: profiles })
      .from(rentals)
      .leftJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
      .leftJoin(profiles, eq(rentals.customerId, profiles.id))
      .orderBy(desc(rentals.createdAt))
      .limit(5)

    res.json({
      kpis: [
        { label: 'Total Revenue', value: totalRevenue },
        { label: 'Total Rentals', value: counts.rentals },
        { label: 'Total Vehicles', value: counts.vehicles },
        { label: 'Active Dealers', value: counts.dealers },
        { label: 'Active Users', value: counts.users },
      ],
      rentalsTrend: Object.entries(bucketsR).map(([date, value]) => ({ date, value })),
      revenueTrend: Object.entries(bucketsP).map(([date, value]) => ({ date, value })),
      recentRentals: recent.map((r) => ({
        ...mapRental(r.rental),
        customerName: r.customer?.name ?? null,
        customerEmail: r.customer?.email ?? null,
        vehicleName: r.vehicle?.name ?? null,
        vehicleYear: r.vehicle?.year ?? null,
      })),
      bookingStatusCounts: {
        active: statusCounts.active ?? 0,
        reserved: statusCounts.reserved ?? 0,
        completed: statusCounts.completed ?? 0,
        cancelled: statusCounts.cancelled ?? 0,
      },
      todayBookingsCount,
    })
  })
)

adminRouter.get(
  '/customer-stats',
  asyncHandler(async (_req, res) => {
    res.json(await aggregateCustomerProfileStats())
  })
)

adminRouter.get(
  '/analytics',
  asyncHandler(async (_req, res) => {
    const [revenue, statusCounts, bucketsP, bucketsR, categories, rentalsTotal, vehiclesTotal] =
      await Promise.all([
        aggregatePlatformRevenue(),
        countRentalsByStatus(),
        monthlyPaymentBuckets(4),
        monthlyRentalBuckets(4),
        vehicleCategoryDistribution(),
        countRentals(),
        countVehicles(),
      ])
    const topVehicles = await db
      .select({ name: vehicles.name, value: vehicles.pricePerDay })
      .from(vehicles)
      .orderBy(desc(vehicles.pricePerDay))
      .limit(5)

    res.json({
      kpis: [
        { label: 'Total Revenue', value: revenue },
        { label: 'Total Rentals', value: rentalsTotal },
        { label: 'Active Rentals', value: statusCounts.active ?? 0 },
        { label: 'Vehicles', value: vehiclesTotal },
      ],
      revenueTrend: Object.entries(bucketsP).map(([date, value]) => ({ date, value })),
      rentalsTrend: Object.entries(bucketsR).map(([date, value]) => ({ date, value })),
      categoryDistribution: categories,
      topVehicles: topVehicles.map((v) => ({ name: v.name, value: Number(v.value) })),
    })
  })
)

adminRouter.get(
  '/vehicles',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const [totalRow] = await db.select({ value: count() }).from(vehicles)
    const rows = await db
      .select()
      .from(vehicles)
      .orderBy(vehicles.id)
      .limit(limit)
      .offset(offset)
    res.json(paginated(rows.map(mapVehicle), Number(totalRow.value), page, pageSize))
  })
)

adminRouter.get(
  '/vehicles/:id',
  asyncHandler(async (req, res) => {
    const [row] = await db.select().from(vehicles).where(eq(vehicles.id, req.params.id)).limit(1)
    if (!row) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json(mapVehicle(row))
  })
)

adminRouter.post(
  '/vehicles',
  requireFullAdmin,
  asyncHandler(async (req, res) => {
    const b = parseBody(adminCreateVehicleSchema, req, res)
    if (!b) return

    const [dealer] = await db.select({ id: dealers.id }).from(dealers).where(eq(dealers.id, b.dealerId)).limit(1)
    if (!dealer) {
      res.status(400).json({ error: 'dealerId: Dealer not found' })
      return
    }

    const gallery = b.imageUrls?.length ? b.imageUrls : b.imageUrl ? [b.imageUrl] : []
    const [row] = await db
      .insert(vehicles)
      .values({
        dealerId: b.dealerId,
        name: b.name,
        make: b.make,
        model: b.model,
        year: b.year,
        category: b.category,
        status: 'available',
        pricePerDay: String(b.pricePerDay),
        mileage: b.mileage ?? 0,
        transmission: b.transmission,
        fuelType: b.fuelType,
        seats: b.seats ?? 4,
        imageUrl: gallery[0] ?? b.imageUrl ?? null,
        imageUrls: gallery,
        description: b.description ?? null,
        color: b.color ?? null,
        mileageCapKm: b.mileageCapKm ?? null,
        features: b.features ?? [],
      })
      .returning()
    res.status(201).json(mapVehicle(row))
  })
)

/**
 * Vehicle deletion is guarded (audit BUG-03): any rental or booking history
 * makes the vehicle un-deletable; retire it with status "inactive" instead.
 */
adminRouter.delete(
  '/vehicles/:id',
  requireFullAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const [anyRental] = await db
      .select({ id: rentals.id, status: rentals.status })
      .from(rentals)
      .where(eq(rentals.vehicleId, req.params.id))
      .limit(1)
    const [anyBooking] = await db
      .select({ id: bookingRequests.id })
      .from(bookingRequests)
      .where(eq(bookingRequests.vehicleId, req.params.id))
      .limit(1)
    if (anyRental || anyBooking) {
      const [retired] = await db
        .update(vehicles)
        .set({ status: 'inactive' })
        .where(eq(vehicles.id, req.params.id))
        .returning({ id: vehicles.id })
      if (!retired) {
        res.status(404).json({ error: 'Not found' })
        return
      }
      await logAuditSafe({
        actorId: req.user!.sub,
        actorRole: req.user!.role,
        action: 'vehicle.soft_delete',
        entityType: 'vehicle',
        entityId: req.params.id,
        after: { status: 'inactive' },
        note: anyRental ? 'Has rental history' : 'Has booking request history',
      })
      res.status(200).json({
        softDeleted: true,
        message:
          'Vehicle has booking/rental history and was retired (status set to inactive) instead of deleted.',
      })
      return
    }
    const deleted = await db
      .delete(vehicles)
      .where(eq(vehicles.id, req.params.id))
      .returning({ id: vehicles.id })
    if (deleted.length === 0) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    await logAuditSafe({
      actorId: req.user!.sub,
      actorRole: req.user!.role,
      action: 'vehicle.delete',
      entityType: 'vehicle',
      entityId: req.params.id,
    })
    res.status(204).end()
  })
)

adminRouter.patch(
  '/vehicles/:id/status',
  requireOpsCapability,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parseBody(adminPatchVehicleStatusSchema, req, res)
    if (!body) return

    const { guardedVehicleStatusChange } = await import('./dealer.js')
    const result = await guardedVehicleStatusChange({
      vehicleId: req.params.id,
      status: body.status,
    })
    if (result.status === 200) {
      await logAuditSafe({
        actorId: req.user!.sub,
        actorRole: req.user!.role,
        action: 'vehicle.status.override',
        entityType: 'vehicle',
        entityId: req.params.id,
        after: { status: body.status },
      })
    }
    res.status(result.status).json(result.body)
  })
)

adminRouter.get(
  '/customers',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const where = eq(profiles.role, 'customer')
    const [totalRow] = await db.select({ value: count() }).from(profiles).where(where)
    const rows = await db
      .select()
      .from(profiles)
      .where(where)
      .orderBy(desc(profiles.createdAt))
      .limit(limit)
      .offset(offset)
    res.json(paginated(rows.map(mapProfileToUser), Number(totalRow.value), page, pageSize))
  })
)

adminRouter.get(
  '/customers/with-stats',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const where = eq(profiles.role, 'customer')
    const [totalRow] = await db.select({ value: count() }).from(profiles).where(where)
    const rows = await db
      .select()
      .from(profiles)
      .where(where)
      .orderBy(desc(profiles.createdAt))
      .limit(limit)
      .offset(offset)
    const ids = rows.map((u) => u.id)
    const cps = ids.length
      ? await db.select().from(customerProfiles).where(inArray(customerProfiles.userId, ids))
      : []
    const cpByUser = new Map(cps.map((c) => [c.userId, c]))
    // Live stats (the audit found the denormalized counters were never
    // maintained): count rentals and net completed payments per customer.
    const rentalStats = ids.length
      ? await db
          .select({ customerId: rentals.customerId, value: count() })
          .from(rentals)
          .where(inArray(rentals.customerId, ids))
          .groupBy(rentals.customerId)
      : []
    const spendStats = ids.length
      ? await db
          .select({
            customerId: payments.customerId,
            spent: sql<string>`COALESCE(SUM(CASE WHEN ${payments.type} = 'refund' THEN -${payments.amount} ELSE ${payments.amount} END), 0)`,
          })
          .from(payments)
          .where(
            and(
              inArray(payments.customerId, ids),
              inArray(payments.status, ['completed', 'refunded'])
            )
          )
          .groupBy(payments.customerId)
      : []
    const rentalsBy = new Map(rentalStats.map((r) => [r.customerId, Number(r.value)]))
    const spentBy = new Map(spendStats.map((r) => [r.customerId!, Number(r.spent)]))
    const items = rows.map((u) => {
      const cp = cpByUser.get(u.id)
      return {
        ...mapProfileToUser(u),
        customerStatus: cp?.status ?? 'unverified',
        rentalsCount: rentalsBy.get(u.id) ?? 0,
        totalSpent: spentBy.get(u.id) ?? 0,
      }
    })
    res.json(paginated(items, Number(totalRow.value), page, pageSize))
  })
)

adminRouter.get(
  '/customers/:userId',
  asyncHandler(async (req, res) => {
    const [u] = await db.select().from(profiles).where(eq(profiles.id, req.params.userId)).limit(1)
    if (!u) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const [cp] = await db
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, u.id))
      .limit(1)
    res.json({
      ...mapProfileToUser(u),
      customerStatus: cp?.status ?? 'unverified',
      rentalsCount: cp?.rentalsCount ?? 0,
      totalSpent: Number(cp?.totalSpent ?? 0),
      qidDocumentPath: cp?.qidDocumentPath ?? undefined,
      driversLicensePath: cp?.driversLicensePath ?? undefined,
    })
  })
)

adminRouter.patch(
  '/customers/:userId/status',
  requireFullAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { status } = req.body as { status?: string }
    if (status !== 'active' && status !== 'suspended' && status !== 'pending') {
      res.status(400).json({ error: 'status must be active, suspended, or pending' })
      return
    }
    const [before] = await db
      .select({
        status: profiles.status,
        email: profiles.email,
        name: profiles.name,
        role: profiles.role,
      })
      .from(profiles)
      .where(eq(profiles.id, req.params.userId))
      .limit(1)
    if (!before) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    // Staff accounts are suspended through /staff/:id/deactivate, which also
    // blocks self-lockout. Without this check that guard is trivially bypassed.
    if (before.role !== 'customer') {
      res.status(404).json({ error: 'Not found' })
      return
    }
    await db.update(profiles).set({ status }).where(eq(profiles.id, req.params.userId))
    if (status === 'suspended') {
      await revokeAllRefreshSessions(req.params.userId)
      if (before.email) {
        void sendAccountSuspendedEmail({ to: before.email, name: before.name }).catch((err) =>
          console.error('Account suspended email failed:', err)
        )
      }
    }
    await logAuditSafe({
      actorId: req.user!.sub,
      actorRole: req.user!.role,
      action: 'customer.status.change',
      entityType: 'profile',
      entityId: req.params.userId,
      before: { status: before.status },
      after: { status },
    })
    await notifyUserSafe({
      userId: req.params.userId,
      type: status === 'suspended' ? 'error' : 'info',
      title: status === 'suspended' ? 'Account suspended' : 'Account status updated',
      message:
        status === 'suspended'
          ? 'Your account has been suspended. Contact support for assistance.'
          : `Your account status is now "${status}".`,
    })
    res.json({ ok: true })
  })
)

const ADMIN_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

adminRouter.patch(
  '/customers/:userId/profile',
  requireFullAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const u = req.body
    const patch: Record<string, unknown> = {}
    if (u.name !== undefined) patch.name = u.name
    if (u.phone !== undefined) patch.phone = u.phone
    if (u.email !== undefined) {
      const normalized = String(u.email).trim().toLowerCase()
      if (!ADMIN_EMAIL_RE.test(normalized)) {
        res.status(400).json({ error: 'Invalid email address' })
        return
      }
      const [taken] = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.email, normalized))
        .limit(1)
      if (taken && taken.id !== req.params.userId) {
        res.status(409).json({ error: 'An account with this email already exists' })
        return
      }
      patch.email = normalized
      patch.emailVerifiedAt = null
    }
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: 'No fields to update' })
      return
    }
    await db.update(profiles).set(patch as any).where(eq(profiles.id, req.params.userId))
    await logAuditSafe({
      actorId: req.user!.sub,
      actorRole: req.user!.role,
      action: 'customer.profile.edit',
      entityType: 'profile',
      entityId: req.params.userId,
      after: patch,
    })
    res.json({ ok: true })
  })
)

adminRouter.patch(
  '/customers/:userId/verification',
  requireFullAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { status, reason, decision } = req.body as {
      status?: string
      reason?: string
      decision?: string
    }
    if (!['active', 'suspended', 'verified', 'unverified'].includes(String(status))) {
      res.status(400).json({ error: 'Invalid verification status' })
      return
    }
    const trimmedReason = typeof reason === 'string' ? reason.trim() : ''
    if (trimmedReason.length > 2000) {
      res.status(400).json({ error: 'Reason must be 2000 characters or fewer' })
      return
    }
    if (decision !== undefined && decision !== 'approve' && decision !== 'reject') {
      res.status(400).json({ error: 'decision must be approve or reject' })
      return
    }
    const [beforeProfile] = await db
      .select({ status: customerProfiles.status })
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, req.params.userId))
      .limit(1)
    const beforeStatus = beforeProfile?.status ?? 'unverified'
    // Race-safe upsert (customer_profiles.user_id is now unique).
    await db
      .insert(customerProfiles)
      .values({ userId: req.params.userId, status: status as any })
      .onConflictDoUpdate({
        target: customerProfiles.userId,
        set: { status: status as any },
      })
    const resolvedDecision =
      decision ??
      (status === 'verified' ? 'approve' : status === 'unverified' ? 'reject' : undefined)
    await logAuditSafe({
      actorId: req.user!.sub,
      actorRole: req.user!.role,
      action:
        resolvedDecision === 'approve'
          ? 'customer.verification.approve'
          : resolvedDecision === 'reject'
            ? 'customer.verification.reject'
            : 'customer.verification.change',
      entityType: 'customer_profile',
      entityId: req.params.userId,
      before: { status: beforeStatus },
      after: {
        status,
        decision: resolvedDecision ?? null,
        reason: trimmedReason || null,
      },
      note: trimmedReason || null,
    })
    res.json({ ok: true })
  })
)

adminRouter.get(
  '/rentals',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const [totalRow] = await db.select({ value: count() }).from(rentals)
    const rows = await db
      .select()
      .from(rentals)
      .orderBy(desc(rentals.createdAt))
      .limit(limit)
      .offset(offset)
    res.json(paginated(rows.map(mapRental), Number(totalRow.value), page, pageSize))
  })
)

adminRouter.get(
  '/rentals/details',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const [totalRow] = await db.select({ value: count() }).from(rentals)
    const rows = await db
      .select({ rental: rentals, vehicle: vehicles, customer: profiles, dealer: dealers })
      .from(rentals)
      .leftJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
      .leftJoin(profiles, eq(rentals.customerId, profiles.id))
      .leftJoin(dealers, eq(rentals.dealerId, dealers.id))
      .orderBy(desc(rentals.createdAt))
      .limit(limit)
      .offset(offset)
    const items = rows.map((r) => ({
      ...mapRental(r.rental),
      vehicle: r.vehicle ? mapVehicle(r.vehicle) : undefined,
      customer: r.customer ? mapProfileToUser(r.customer) : undefined,
      dealer: r.dealer ? { id: r.dealer.id, name: r.dealer.name } : undefined,
    }))
    res.json(paginated(items, Number(totalRow.value), page, pageSize))
  })
)

/**
 * Rental status override with an enforced transition table (no more silently
 * corrupting inventory/billing — audit BUG-02/BUG-09), full audit trail, and
 * vehicle release handled by the lifecycle service.
 */
adminRouter.patch(
  '/rentals/:id/status',
  requireOpsCapability,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { status, note } = req.body as { status?: string; note?: string }
    const valid = ['reserved', 'active', 'paused', 'past_due', 'completed', 'cancelled']
    if (!status || !valid.includes(status)) {
      res.status(400).json({ error: `status must be one of ${valid.join(', ')}` })
      return
    }
    const result = await adminChangeRentalStatus({
      rentalId: req.params.id,
      toStatus: status as any,
      actorId: req.user!.sub,
      note,
    })
    res.status(result.status).json(result.status < 400 ? mapRental(result.body) : result.body)
  })
)

adminRouter.post(
  '/rentals/:id/cancel',
  requireFullAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { reason } = req.body as { reason?: string }
    const result = await cancelRental({
      rentalId: req.params.id,
      actor: { id: req.user!.sub, role: 'admin' },
      reason,
    })
    res.status(result.status).json(result.status < 400 ? mapRental(result.body) : result.body)
  })
)

adminRouter.post(
  '/rentals/:id/pause',
  requireOpsCapability,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parseBody(pauseRentalSchema, req, res)
    if (!body) return
    const result = await pauseRental({
      rentalId: req.params.id,
      actor: { id: req.user!.sub, role: 'admin' },
      days: body.days,
      reason: body.reason,
    })
    res.status(result.status).json(result.status < 400 ? mapRental(result.body) : result.body)
  })
)

adminRouter.post(
  '/rentals/:id/resume',
  requireOpsCapability,
  asyncHandler(async (req: AuthedRequest, res) => {
    const result = await resumeRental({
      rentalId: req.params.id,
      actor: { id: req.user!.sub, role: 'admin' },
    })
    res.status(result.status).json(result.status < 400 ? mapRental(result.body) : result.body)
  })
)

/** Rental drill-down: events, invoices, payments — for real incident forensics. */
adminRouter.get(
  '/rentals/:id/full',
  asyncHandler(async (req, res) => {
    const [row] = await db
      .select({ rental: rentals, vehicle: vehicles, customer: profiles, dealer: dealers })
      .from(rentals)
      .leftJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
      .leftJoin(profiles, eq(rentals.customerId, profiles.id))
      .leftJoin(dealers, eq(rentals.dealerId, dealers.id))
      .where(eq(rentals.id, req.params.id))
      .limit(1)
    if (!row) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const [events, invoiceRows, paymentRows, audit] = await Promise.all([
      db.select().from(rentalEvents).where(eq(rentalEvents.rentalId, row.rental.id)).orderBy(desc(rentalEvents.createdAt)),
      db.select().from(invoices).where(eq(invoices.rentalId, row.rental.id)).orderBy(desc(invoices.date)),
      db.select().from(payments).where(eq(payments.rentalId, row.rental.id)).orderBy(desc(payments.createdAt)),
      db
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.entityType, 'rental'), eq(auditLogs.entityId, row.rental.id)))
        .orderBy(desc(auditLogs.createdAt))
        .limit(50),
    ])
    res.json({
      ...mapRental(row.rental),
      vehicle: row.vehicle ? mapVehicle(row.vehicle) : undefined,
      customer: row.customer ? mapProfileToUser(row.customer) : undefined,
      dealer: row.dealer ? { id: row.dealer.id, name: row.dealer.name } : undefined,
      events: events.map(mapRentalEvent),
      invoices: invoiceRows.map(mapInvoice),
      payments: paymentRows.map(mapPayment),
      auditTrail: audit.map(mapAuditLog),
    })
  })
)

adminRouter.get(
  '/dealers',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const [totalRow] = await db.select({ value: count() }).from(dealers)
    const rows = await db
      .select()
      .from(dealers)
      .orderBy(desc(dealers.createdAt))
      .limit(limit)
      .offset(offset)
    res.json(paginated(rows.map(mapDealer), Number(totalRow.value), page, pageSize))
  })
)

adminRouter.post(
  '/dealers',
  requireFullAdmin,
  asyncHandler(async (req, res) => {
    const {
      email,
      ownerEmail,
      name,
      contactEmail,
      contactPhone,
      address,
      password,
    } = req.body as {
      email?: string
      ownerEmail?: string
      name?: string
      contactEmail?: string
      contactPhone?: string
      address?: string
      password?: string
    }
    const ownerEmailRaw = String(email || ownerEmail || '')
      .trim()
      .toLowerCase()
    if (!ownerEmailRaw || !ownerEmailRaw.includes('@')) {
      res.status(400).json({ error: 'A valid owner email is required' })
      return
    }
    if (!name?.trim()) {
      res.status(400).json({ error: 'Dealer name is required' })
      return
    }

    let [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.email, ownerEmailRaw))
      .limit(1)

    let accountCreated = false
    let temporaryPassword: string | undefined

    if (!profile) {
      temporaryPassword =
        typeof password === 'string' && password.trim().length >= 6
          ? password.trim()
          : crypto.randomBytes(9).toString('base64url')
      const passwordHash = await hashPassword(temporaryPassword)
      ;[profile] = await db
        .insert(profiles)
        .values({
          email: ownerEmailRaw,
          name: name.trim(),
          passwordHash,
          role: 'dealer',
          status: 'active',
          phone: contactPhone?.trim() || null,
        })
        .returning()
      accountCreated = true
    } else {
      // Promoting a customer into a dealer is a supported flow (ADM-16). Staff
      // accounts are not: silently rewriting their role would lock them out of
      // the admin portal.
      if (profile.role !== 'dealer' && profile.role !== 'customer') {
        res.status(400).json({
          error: `This email belongs to a ${profile.role} staff account and cannot be converted into a dealer.`,
        })
        return
      }
      await db
        .update(profiles)
        .set({
          role: 'dealer',
          ...(contactPhone?.trim() ? { phone: contactPhone.trim() } : {}),
        })
        .where(eq(profiles.id, profile.id))
    }

    let row
    try {
      [row] = await db
        .insert(dealers)
        .values({
          name: name.trim(),
          ownerUserId: profile.id,
          status: 'active',
          contactEmail: (contactEmail || ownerEmailRaw).trim().toLowerCase(),
          contactPhone: contactPhone?.trim() || null,
          address: address?.trim() || null,
        })
        .returning()
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        res.status(409).json({ error: 'This account already owns a dealer' })
        return
      }
      throw err
    }
    await logAuditSafe({
      actorId: (req as AuthedRequest).user!.sub,
      actorRole: req.user!.role,
      action: 'dealer.create',
      entityType: 'dealer',
      entityId: row.id,
      after: { name: row.name, ownerUserId: row.ownerUserId, accountCreated },
    })

    if (accountCreated && temporaryPassword) {
      void sendDealerInviteEmail({
        to: ownerEmailRaw,
        dealerName: name.trim(),
        temporaryPassword,
      }).catch((err) => console.error('Dealer invite email failed:', err))
    }

    res.status(201).json({
      ...mapDealer(row),
      accountCreated,
      ...(accountCreated ? { temporaryPassword } : {}),
    })
  })
)

/**
 * Dealer deletion is guarded (audit BUG-03): a dealer with any rental history
 * cannot be deleted (the FK RESTRICTs as a second line of defense) — suspend
 * them instead. Deleting a history-free dealer is audited.
 */
adminRouter.delete(
  '/dealers/:id',
  requireFullAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const [dealer] = await db.select().from(dealers).where(eq(dealers.id, req.params.id)).limit(1)
    if (!dealer) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const [anyRental] = await db
      .select({ id: rentals.id })
      .from(rentals)
      .where(eq(rentals.dealerId, dealer.id))
      .limit(1)
    if (anyRental) {
      res.status(409).json({
        error:
          'This dealer has rental history and cannot be deleted. Suspend the dealer instead to take them off the platform.',
      })
      return
    }
    const ownerUserId = dealer.ownerUserId
    await db.delete(dealers).where(eq(dealers.id, req.params.id))
    const remaining = await db
      .select({ id: dealers.id })
      .from(dealers)
      .where(eq(dealers.ownerUserId, ownerUserId))
      .limit(1)
    if (remaining.length === 0) {
      await db.update(profiles).set({ role: 'customer' }).where(eq(profiles.id, ownerUserId))
    }
    await logAuditSafe({
      actorId: req.user!.sub,
      actorRole: req.user!.role,
      action: 'dealer.delete',
      entityType: 'dealer',
      entityId: dealer.id,
      before: { name: dealer.name, ownerUserId },
    })
    res.status(204).end()
  })
)

adminRouter.patch(
  '/dealers/:id/status',
  requireFullAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { status } = req.body as { status?: string }
    if (status !== 'active' && status !== 'suspended' && status !== 'pending') {
      res.status(400).json({ error: 'status must be active, suspended, or pending' })
      return
    }
    const [row] = await db
      .update(dealers)
      .set({ status })
      .where(eq(dealers.id, req.params.id))
      .returning()
    if (!row) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    if (status === 'suspended') {
      await revokeAllRefreshSessions(row.ownerUserId)
    }
    await logAuditSafe({
      actorId: req.user!.sub,
      actorRole: req.user!.role,
      action: 'dealer.status.change',
      entityType: 'dealer',
      entityId: row.id,
      after: { status },
    })
    await notifyUserSafe({
      userId: row.ownerUserId,
      type: status === 'active' ? 'success' : 'warning',
      title:
        status === 'active'
          ? 'Dealer account approved'
          : status === 'suspended'
            ? 'Dealer account suspended'
            : 'Dealer account status changed',
      message:
        status === 'active'
          ? 'Your dealer account is approved. You can now list vehicles and receive bookings.'
          : `Your dealer account status is now "${status}".`,
    })
    if (status === 'active') {
      const [owner] = await db.select().from(profiles).where(eq(profiles.id, row.ownerUserId)).limit(1)
      if (owner?.email) {
        void sendDealerApprovedEmail({ to: owner.email, dealerName: row.name }).catch(console.error)
      }
    }
    res.json(mapDealer(row))
  })
)

adminRouter.patch(
  '/dealers/:id/bank-details',
  requireFullAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { verified, bankAccountName, bankName, bankIban } = req.body as {
      verified?: boolean
      bankAccountName?: string
      bankName?: string
      bankIban?: string
    }
    const patch: Record<string, unknown> = {}
    if (bankAccountName !== undefined) patch.bankAccountName = bankAccountName?.trim() || null
    if (bankName !== undefined) patch.bankName = bankName?.trim() || null
    if (bankIban !== undefined) patch.bankIban = bankIban?.trim() || null
    if (verified === true) patch.bankDetailsVerifiedAt = new Date()
    if (verified === false) patch.bankDetailsVerifiedAt = null
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: 'No fields to update' })
      return
    }
    const [row] = await db
      .update(dealers)
      .set(patch as any)
      .where(eq(dealers.id, req.params.id))
      .returning()
    if (!row) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    await logAuditSafe({
      actorId: req.user!.sub,
      actorRole: req.user!.role,
      action: 'dealer.bank_details.update',
      entityType: 'dealer',
      entityId: row.id,
      after: {
        verified: !!row.bankDetailsVerifiedAt,
        hasIban: !!row.bankIban,
      },
    })
    res.json(mapDealer(row))
  })
)

adminRouter.get(
  '/payments/summary',
  asyncHandler(async (_req, res) => {
    const stuckCutoff = new Date(Date.now() - 30 * 60 * 1000)
    const [row] = await db
      .select({
        grossRevenue: sql<string>`coalesce(sum(case when ${payments.type} != 'refund' and ${payments.status} in ('completed', 'refunded') then ${payments.amount}::numeric else 0 end), 0)`,
        refundTotal: sql<string>`coalesce(sum(${payments.refundedAmount}::numeric), 0)`,
        pendingCount: sql<number>`count(*) filter (where ${payments.type} != 'refund' and ${payments.status} = 'pending')`,
        completedCount: sql<number>`count(*) filter (where ${payments.type} != 'refund' and ${payments.status} in ('completed', 'refunded'))`,
        refundedCount: sql<number>`count(*) filter (where ${payments.type} != 'refund' and ${payments.status} = 'refunded')`,
        needsRefundCount: sql<number>`count(*) filter (where ${payments.needsRefund} = true)`,
        stuckPendingCount: sql<number>`count(*) filter (where ${payments.type} != 'refund' and ${payments.status} = 'pending' and ${payments.createdAt} < ${stuckCutoff.toISOString()}::timestamptz)`,
      })
      .from(payments)
    const [overdueRow] = await db
      .select({ value: count() })
      .from(invoices)
      .where(eq(invoices.status, 'overdue'))
    const grossRevenue = Number(row?.grossRevenue ?? 0)
    const refundTotal = Number(row?.refundTotal ?? 0)
    res.json({
      totalRevenue: grossRevenue - refundTotal,
      grossRevenue,
      pendingCount: Number(row?.pendingCount ?? 0),
      completedCount: Number(row?.completedCount ?? 0),
      refundedCount: Number(row?.refundedCount ?? 0),
      refundTotal,
      needsRefundCount: Number(row?.needsRefundCount ?? 0),
      stuckPendingCount: Number(row?.stuckPendingCount ?? 0),
      overdueInvoicesCount: Number(overdueRow?.value ?? 0),
    })
  })
)

adminRouter.get(
  '/payments',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const [totalRow] = await db.select({ value: count() }).from(payments)
    const rows = await db
      .select()
      .from(payments)
      .orderBy(desc(payments.createdAt))
      .limit(limit)
      .offset(offset)
    res.json(paginated(rows.map(mapPayment), Number(totalRow.value), page, pageSize))
  })
)

adminRouter.get(
  '/payments/details',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const [totalRow] = await db.select({ value: count() }).from(payments)
    const rows = await db
      .select({ payment: payments, customer: profiles })
      .from(payments)
      .leftJoin(profiles, eq(payments.customerId, profiles.id))
      .orderBy(desc(payments.createdAt))
      .limit(limit)
      .offset(offset)
    const items = rows.map((r) => ({
      ...mapPayment(r.payment),
      customer: r.customer ? mapProfileToUser(r.customer) : undefined,
    }))
    res.json(paginated(items, Number(totalRow.value), page, pageSize))
  })
)

/**
 * Refund with honest outcomes (audit BUG-04): a payment is only marked
 * refunded when the provider confirmed the refund, or when the operator
 * explicitly attests (`manualConfirmed: true`) that they completed it in the
 * SkipCash dashboard / by cash. Partial refunds record a `refund` payment row
 * and accumulate `refundedAmount`; the original flips to `refunded` only when
 * fully repaid. Every refund is audited.
 */
adminRouter.post(
  '/payments/:id/refund',
  requireFinanceCapability,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { amount, manualConfirmed } = req.body as {
      amount?: number
      manualConfirmed?: boolean
    }
    const [payment] = await db.select().from(payments).where(eq(payments.id, req.params.id)).limit(1)
    if (!payment) {
      res.status(404).json({ error: 'Payment not found' })
      return
    }
    if (payment.status === 'refunded') {
      res.status(409).json({ error: 'Payment already refunded' })
      return
    }
    const eligible =
      payment.needsRefund ||
      payment.status === 'completed' ||
      (payment.status === 'failed' && payment.provider === 'skipcash' && payment.needsRefund)
    if (!eligible) {
      res.status(400).json({ error: 'Payment is not eligible for refund' })
      return
    }

    const paid = Number(payment.amount)
    const alreadyRefunded = Number(payment.refundedAmount ?? 0)
    const remaining = Math.max(0, paid - alreadyRefunded)
    const requested = amount === undefined ? remaining : Number(amount)
    if (!Number.isFinite(requested) || requested <= 0 || requested > remaining + 0.001) {
      res.status(400).json({
        error: `Refund amount must be between 0 and the remaining ${remaining.toFixed(2)}`,
      })
      return
    }

    const result = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, payment.id))
        .for('update')
        .limit(1)
      if (!locked || locked.status === 'refunded') {
        return { status: 409 as const, body: { error: 'Payment already refunded' } as any }
      }
      // Re-validate the cap UNDER THE LOCK: two concurrent refunds both
      // passed the unlocked pre-check; without this the second one could
      // over-refund past the payment amount (re-audit F6).
      const lockedRemaining = Math.max(0, Number(locked.amount) - Number(locked.refundedAmount ?? 0))
      if (requested > lockedRemaining + 0.001) {
        return {
          status: 409 as const,
          body: {
            error: `Refund exceeds the remaining ${lockedRemaining.toFixed(2)} (a concurrent refund may have just completed)`,
          } as any,
        }
      }
      // The provider call runs UNDER the row lock. Outside it, two concurrent
      // refunds both clear the unlocked pre-check and both reach SkipCash, so
      // real money leaves twice while the ledger records a single refund.
      let refundedByProvider = false
      let providerMessage: string | undefined
      if (locked.provider === 'skipcash' && locked.externalTransactionId) {
        const providerResult = await requestSkipCashRefund({
          externalPaymentId: locked.externalTransactionId,
          amount: requested,
        })
        refundedByProvider = providerResult.refunded
        providerMessage = providerResult.message
      }
      if (!refundedByProvider && manualConfirmed !== true) {
        // Nothing has actually been refunded — say so instead of pretending.
        return {
          status: 409 as const,
          body: {
            error:
              providerMessage ||
              'Automatic refund is not available. Process it manually (SkipCash dashboard or cash), then retry with manualConfirmed: true.',
            requiresManualConfirmation: true,
          } as any,
        }
      }
      const newRefunded = Number(locked.refundedAmount ?? 0) + requested
      const fullyRefunded = newRefunded >= Number(locked.amount) - 0.001
      const method = refundedByProvider ? 'provider' : 'manual'
      const [refundRow] = await tx
        .insert(payments)
        .values({
          rentalId: locked.rentalId,
          customerId: locked.customerId,
          dealerId: locked.dealerId,
          invoiceId: locked.invoiceId,
          amount: String(requested),
          status: 'completed',
          type: 'refund',
          method: locked.method,
          provider: refundedByProvider ? 'skipcash' : 'manual',
          refundOfPaymentId: locked.id,
          note: refundedByProvider
            ? 'Refunded via SkipCash API'
            : 'Manual refund confirmed by admin',
        })
        .returning()
      const [updated] = await tx
        .update(payments)
        .set({
          refundedAmount: String(newRefunded),
          status: fullyRefunded ? 'refunded' : locked.status,
          needsRefund: false,
          note: [locked.note, `Refund ${requested.toFixed(2)} (${method}) recorded`]
            .filter(Boolean)
            .join('\n'),
        })
        .where(eq(payments.id, locked.id))
        .returning()
      if (locked.invoiceId && locked.customerId && locked.dealerId) {
        await reverseInvoicePaymentRefund(tx, {
          paymentId: locked.id,
          invoiceId: locked.invoiceId,
          customerId: locked.customerId,
          dealerId: locked.dealerId,
          paymentAmount: Number(locked.amount),
          refundAmount: requested,
          fullyRefunded,
        })
      }
      await logAudit(tx, {
        actorId: req.user!.sub,
        actorRole: req.user!.role,
        action: 'payment.refund',
        entityType: 'payment',
        entityId: locked.id,
        before: { refundedAmount: locked.refundedAmount, status: locked.status },
        after: {
          refundedAmount: String(newRefunded),
          status: fullyRefunded ? 'refunded' : locked.status,
          refundPaymentId: refundRow.id,
          via: method,
        },
      })
      await trackAnalyticsEvent(tx, {
        eventType: 'refund_issued',
        userId: locked.customerId,
        entityType: 'payment',
        entityId: locked.id,
        properties: { refundAmount: requested, refundPaymentId: refundRow.id, via: method },
      })
      return { status: 200 as const, body: mapPayment(updated) }
    })

    if (result.status === 200 && payment.customerId) {
      await notifyUserSafe({
        userId: payment.customerId,
        type: 'success',
        title: 'Refund processed',
        message: `A refund of QAR ${requested.toFixed(2)} has been processed.`,
      })
    }
    res.status(result.status).json(result.body)
  })
)

adminRouter.get(
  '/plans',
  asyncHandler(async (_req, res) => {
    const rows = await db.select().from(plans)
    res.json(rows.map(mapPlan))
  })
)

adminRouter.get(
  '/plan-stats',
  asyncHandler(async (_req, res) => {
    const allPlans = await db.select().from(plans)
    const allSubs = await db.select().from(subscriptions)
    res.json({
      totalPlans: allPlans.length,
      activePlans: allPlans.filter((p) => p.status === 'active').length,
      activeSubscriptions: allSubs.filter((s) => s.status === 'active').length,
    })
  })
)

adminRouter.post(
  '/plans',
  requireFullAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const b = parseBody(adminCreatePlanSchema, req, res)
    if (!b) return

    const [row] = await db
      .insert(plans)
      .values({
        name: b.name,
        tier: b.tier,
        status: b.status || 'draft',
        priceMonthly: String(b.priceMonthly ?? 0),
        priceYearly: String(b.priceYearly ?? 0),
        features: b.features ?? [],
      })
      .returning()
    await logAuditSafe({
      actorId: req.user!.sub,
      actorRole: req.user!.role,
      action: 'plan.create',
      entityType: 'plan',
      entityId: row.id,
      after: mapPlan(row),
    })
    res.status(201).json(mapPlan(row))
  })
)

adminRouter.patch(
  '/plans/:id',
  requireFullAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const u = parseBody(adminPatchPlanSchema, req, res)
    if (!u) return

    const patch: Record<string, unknown> = {}
    if (u.name !== undefined) patch.name = u.name
    if (u.tier !== undefined) patch.tier = u.tier
    if (u.status !== undefined) patch.status = u.status
    if (u.priceMonthly !== undefined) patch.priceMonthly = String(u.priceMonthly)
    if (u.priceYearly !== undefined) patch.priceYearly = String(u.priceYearly)
    if (u.features !== undefined) patch.features = u.features
    const [before] = await db.select().from(plans).where(eq(plans.id, req.params.id)).limit(1)
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: 'No fields to update' })
      return
    }
    const [row] = await db
      .update(plans)
      .set(patch as any)
      .where(eq(plans.id, req.params.id))
      .returning()
    if (!row) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    await logAuditSafe({
      actorId: req.user!.sub,
      actorRole: req.user!.role,
      action: 'plan.update',
      entityType: 'plan',
      entityId: row.id,
      before: before ? mapPlan(before) : undefined,
      after: mapPlan(row),
    })
    res.json(mapPlan(row))
  })
)

adminRouter.delete(
  '/plans/:id',
  requireFullAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const [activeSubRow] = await db
      .select({ value: count() })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.planId, req.params.id),
          inArray(subscriptions.status, ['trial', 'active', 'past_due'])
        )
      )
    if (Number(activeSubRow?.value ?? 0) > 0) {
      res.status(409).json({ error: 'Cannot delete plan with active subscriptions' })
      return
    }
    const [dealerRow] = await db
      .select({ value: count() })
      .from(dealers)
      .where(eq(dealers.planId, req.params.id))
    if (Number(dealerRow?.value ?? 0) > 0) {
      res.status(409).json({ error: 'Cannot delete plan assigned to dealers' })
      return
    }
    const [before] = await db.select().from(plans).where(eq(plans.id, req.params.id)).limit(1)
    await db.delete(plans).where(eq(plans.id, req.params.id))
    if (before) {
      await logAuditSafe({
        actorId: req.user!.sub,
        actorRole: req.user!.role,
        action: 'plan.delete',
        entityType: 'plan',
        entityId: req.params.id,
        before: mapPlan(before),
      })
    }
    res.status(204).end()
  })
)

adminRouter.get(
  '/complaints',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const [totalRow] = await db.select({ value: count() }).from(complaints)
    const rows = await db
      .select({ complaint: complaints, customer: profiles })
      .from(complaints)
      .leftJoin(profiles, eq(complaints.customerId, profiles.id))
      .orderBy(desc(complaints.createdAt))
      .limit(limit)
      .offset(offset)
    res.json(
      paginated(
        rows.map((r) => ({
          ...mapComplaint(r.complaint),
          customerName: r.customer?.name ?? undefined,
          customerEmail: r.customer?.email ?? undefined,
        })),
        Number(totalRow.value),
        page,
        pageSize
      )
    )
  })
)

adminRouter.patch(
  '/complaints/:id/status',
  requireSupportCapability,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!['open', 'in_progress', 'resolved'].includes(String(req.body.status))) {
      res.status(400).json({ error: 'status must be open, in_progress, or resolved' })
      return
    }
    const [before] = await db.select().from(complaints).where(eq(complaints.id, req.params.id)).limit(1)
    const [row] = await db
      .update(complaints)
      .set({ status: req.body.status })
      .where(eq(complaints.id, req.params.id))
      .returning()
    if (!row) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    await logAuditSafe({
      actorId: req.user!.sub,
      actorRole: req.user!.role,
      action: 'complaint.status.change',
      entityType: 'complaint',
      entityId: row.id,
      before: before ? { status: before.status } : undefined,
      after: { status: row.status },
    })
    res.json(mapComplaint(row))
  })
)

adminRouter.get(
  '/complaints/:id/replies',
  asyncHandler(async (req, res) => {
    const [complaint] = await db.select().from(complaints).where(eq(complaints.id, req.params.id)).limit(1)
    if (!complaint) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const rows = await db
      .select({ reply: complaintReplies, author: profiles })
      .from(complaintReplies)
      .leftJoin(profiles, eq(complaintReplies.authorId, profiles.id))
      .where(eq(complaintReplies.complaintId, req.params.id))
      .orderBy(complaintReplies.createdAt)
    res.json(
      rows.map((r) => ({
        id: r.reply.id,
        complaintId: r.reply.complaintId,
        authorId: r.reply.authorId,
        body: r.reply.body,
        createdAt: r.reply.createdAt.toISOString(),
        authorName: r.author?.name,
        authorEmail: r.author?.email,
        authorRole: r.author?.role,
      }))
    )
  })
)

adminRouter.post(
  '/complaints/:id/replies',
  requireSupportCapability,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = String((req.body as { body?: string }).body ?? '').trim()
    if (body.length < 8) {
      res.status(400).json({ error: 'Reply must be at least 8 characters' })
      return
    }
    const [complaint] = await db.select().from(complaints).where(eq(complaints.id, req.params.id)).limit(1)
    if (!complaint) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const [reply] = await db
      .insert(complaintReplies)
      .values({
        complaintId: req.params.id,
        authorId: req.user!.sub,
        body,
      })
      .returning()
    if (complaint.status === 'open') {
      await db.update(complaints).set({ status: 'in_progress' }).where(eq(complaints.id, complaint.id))
    }
    await logAuditSafe({
      actorId: req.user!.sub,
      actorRole: req.user!.role,
      action: 'complaint.reply',
      entityType: 'complaint',
      entityId: complaint.id,
      after: { replyId: reply.id },
      note: body.slice(0, 120),
    })
    const [author] = await db.select().from(profiles).where(eq(profiles.id, req.user!.sub)).limit(1)
    const [customer] = await db
      .select({ email: profiles.email, name: profiles.name })
      .from(profiles)
      .where(eq(profiles.id, complaint.customerId))
      .limit(1)
    if (customer?.email) {
      void sendComplaintReplyEmail({
        to: customer.email,
        customerName: customer.name,
        complaintSubject: complaint.subject,
        replyBody: body,
        authorName: author?.name ?? 'CarFlow Support',
      }).catch((err) => console.error('Complaint reply email failed:', err))
    }
    res.status(201).json({
      id: reply.id,
      complaintId: reply.complaintId,
      authorId: reply.authorId,
      body: reply.body,
      createdAt: reply.createdAt.toISOString(),
      authorName: author?.name,
      authorEmail: author?.email,
      authorRole: author?.role,
    })
  })
)

adminRouter.get(
  '/messages',
  requireSupportCapability,
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const folder = req.query.folder as string | undefined
    const where = folder ? eq(messages.folder, folder as any) : undefined
    const [totalRow] = where
      ? await db.select({ value: count() }).from(messages).where(where)
      : await db.select({ value: count() }).from(messages)
    const q = db
      .select({ message: messages, fromUser: profiles })
      .from(messages)
      .leftJoin(profiles, eq(messages.fromUserId, profiles.id))
      .orderBy(desc(messages.createdAt))
      .limit(limit)
      .offset(offset)
    const rows = where ? await q.where(where) : await q
    const items = rows.map((r) => ({
      ...mapMessage(r.message),
      fromName: r.fromUser?.name,
      fromEmail: r.fromUser?.email,
      fromRole: r.fromUser?.role,
      sender: r.fromUser
        ? { id: r.fromUser.id, name: r.fromUser.name, email: r.fromUser.email, role: r.fromUser.role }
        : undefined,
    }))
    res.json(paginated(items, Number(totalRow.value), page, pageSize))
  })
)

adminRouter.get(
  '/messages/folder-counts',
  requireSupportCapability,
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select({ folder: messages.folder, value: count() })
      .from(messages)
      .groupBy(messages.folder)
    const counts = { inbox: 0, sent: 0, starred: 0, archived: 0, unread: 0 }
    for (const r of rows) {
      if (r.folder in counts) {
        counts[r.folder as keyof typeof counts] = Number(r.value)
      }
    }
    const [unreadRow] = await db
      .select({ value: count() })
      .from(messages)
      .where(and(eq(messages.folder, 'inbox'), eq(messages.read, false)))
    counts.unread = Number(unreadRow?.value ?? 0)
    res.json(counts)
  })
)

adminRouter.get(
  '/messages/activity',
  requireSupportCapability,
  asyncHandler(async (req, res) => {
    const limit = Math.min(50, Number(req.query.limit) || 10)
    const rows = await db
      .select({ message: messages, fromUser: profiles })
      .from(messages)
      .leftJoin(profiles, eq(messages.fromUserId, profiles.id))
      .orderBy(desc(messages.createdAt))
      .limit(limit)
    res.json(
      rows.map((r) => ({
        ...mapMessage(r.message),
        fromName: r.fromUser?.name,
      }))
    )
  })
)

async function loadAdminScopedMessage(messageId: string) {
  const [msg] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1)
  if (!msg) return null
  const [fromUser] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, msg.fromUserId))
    .limit(1)
  const [toUser] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, msg.toUserId))
    .limit(1)
  if (!isAdminPortalRole(fromUser?.role ?? '') && !isAdminPortalRole(toUser?.role ?? '')) {
    return null
  }
  return msg
}

adminRouter.post(
  '/messages',
  requireSupportCapability,
  asyncHandler(async (req: AuthedRequest, res) => {
    const message = parseBody(adminCreateMessageSchema, req, res)
    if (!message) return

    const { toUserId, subject, body } = message
    const sent = await sendMessage({
      fromUserId: req.user!.sub,
      toUserId,
      subject,
      body,
    })
    const [fromUser] = await db.select().from(profiles).where(eq(profiles.id, req.user!.sub)).limit(1)
    res.status(201).json({
      ...sent,
      fromName: fromUser?.name,
      fromEmail: fromUser?.email,
    })
  })
)

adminRouter.patch(
  '/messages/:id/read',
  requireSupportCapability,
  asyncHandler(async (req, res) => {
    const body = parseBody(adminPatchMessageReadSchema, req, res)
    if (!body) return

    const existing = await loadAdminScopedMessage(req.params.id)
    if (!existing) {
      res.status(404).json({ error: 'Not found' })
      return
    }

    const [row] = await db
      .update(messages)
      .set({ read: body.read })
      .where(eq(messages.id, req.params.id))
      .returning()
    if (!row) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json(mapMessage(row))
  })
)

adminRouter.patch(
  '/messages/:id/folder',
  requireSupportCapability,
  asyncHandler(async (req, res) => {
    const body = parseBody(adminPatchMessageFolderSchema, req, res)
    if (!body) return

    const existing = await loadAdminScopedMessage(req.params.id)
    if (!existing) {
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
      .set({ folder: body.folder })
      .where(eq(messages.id, req.params.id))
      .returning()
    if (!row) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json(mapMessage(row))
  })
)

adminRouter.get(
  '/booking-requests',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const [totalRow] = await db.select({ value: count() }).from(bookingRequests)
    const rows = await db
      .select()
      .from(bookingRequests)
      .orderBy(desc(bookingRequests.createdAt))
      .limit(limit)
      .offset(offset)
    res.json(paginated(rows.map(mapBookingRequest), Number(totalRow.value), page, pageSize))
  })
)

adminRouter.get(
  '/booking-requests/:id',
  asyncHandler(async (req, res) => {
    const [row] = await db
      .select()
      .from(bookingRequests)
      .where(eq(bookingRequests.id, req.params.id))
      .limit(1)
    if (!row) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json(mapBookingRequest(row))
  })
)

adminRouter.patch(
  '/booking-requests/:id/status',
  requireFullAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { status, declineReason } = req.body as { status?: string; declineReason?: string }
    if (status !== 'approved' && status !== 'declined') {
      res.status(400).json({ error: 'status must be approved or declined' })
      return
    }
    const result = await transitionBookingRequest({
      bookingRequestId: req.params.id,
      status,
      declineReason,
      actor: { id: req.user!.sub, role: 'admin' },
    })
    res.status(result.status).json(result.body)
  })
)

adminRouter.delete(
  '/booking-requests/:id',
  requireFullAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    // A request with money against it is part of the financial trail.
    const [paid] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          eq(payments.bookingRequestId, req.params.id),
          inArray(payments.status, ['completed', 'refunded'])
        )
      )
      .limit(1)
    if (paid) {
      res.status(409).json({
        error: 'This request has payments attached and cannot be deleted. Decline it instead.',
      })
      return
    }
    await db.delete(bookingRequests).where(eq(bookingRequests.id, req.params.id))
    await logAuditSafe({
      actorId: req.user!.sub,
      actorRole: req.user!.role,
      action: 'booking_request.delete',
      entityType: 'booking_request',
      entityId: req.params.id,
    })
    res.status(204).end()
  })
)

// ---------------------------------------------------------------------------
// Audit log (read side) — audit BUG-08
// ---------------------------------------------------------------------------
adminRouter.get(
  '/audit-logs',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const entityType = (req.query.entityType as string | undefined)?.trim() || undefined
    const entityId = (req.query.entityId as string | undefined)?.trim() || undefined
    const filters = []
    if (entityType) filters.push(eq(auditLogs.entityType, entityType))
    if (entityId) filters.push(eq(auditLogs.entityId, entityId))
    const where = filters.length > 0 ? and(...filters) : undefined
    const [totalRow] = where
      ? await db.select({ value: count() }).from(auditLogs).where(where)
      : await db.select({ value: count() }).from(auditLogs)
    const base = db
      .select({ log: auditLogs, actor: profiles })
      .from(auditLogs)
      .leftJoin(profiles, eq(auditLogs.actorId, profiles.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset)
    const rows = where ? await base.where(where) : await base
    const items = rows.map((r) => ({
      ...mapAuditLog(r.log),
      actorName: r.actor?.name,
      actorEmail: r.actor?.email,
    }))
    res.json(paginated(items, Number(totalRow.value), page, pageSize))
  })
)

adminRouter.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    const row = await ensureAppSettingsRow()
    res.json(settingsApiPayload(row))
  })
)

adminRouter.get(
  '/settings/flags',
  requireFullAdmin,
  asyncHandler(async (_req, res) => {
    const row = await ensureAppSettingsRow()
    res.json(featureFlagsFromRuntime(mapRuntimeAppSettings(row)))
  })
)

adminRouter.patch(
  '/settings/flags',
  requireFullAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parseBody(adminPatchFeatureFlagsSchema, req, res)
    if (!body) return

    const existing = await ensureAppSettingsRow()
    const patch = featureFlagsPatchFromBody(body)
    if (Object.keys(patch).length === 0) {
      res.json(featureFlagsFromRuntime(mapRuntimeAppSettings(existing)))
      return
    }

    const [row] = await db
      .update(appSettings)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(appSettings.id, existing.id))
      .returning()
    invalidateAppSettingsCache()
    await logAuditSafe({
      actorId: req.user!.sub,
      actorRole: req.user!.role,
      action: 'settings.flags.update',
      entityType: 'app_settings',
      entityId: row.id,
      before: featureFlagsAuditSnapshot(existing),
      after: featureFlagsAuditSnapshot(row),
    })
    res.json(featureFlagsFromRuntime(mapRuntimeAppSettings(row)))
  })
)

adminRouter.get(
  '/settings/business',
  asyncHandler(async (_req, res) => {
    const row = await ensureAppSettingsRow()
    res.json(businessSettingsApiPayload(row))
  })
)

function parseSettingsPatch(body: Record<string, unknown>): Record<string, unknown> | { error: string } {
  const patch: Record<string, unknown> = {}
  if (body.companyName !== undefined) {
    if (typeof body.companyName !== 'string' || !body.companyName.trim()) {
      return { error: 'companyName must be a non-empty string' }
    }
    patch.companyName = body.companyName.trim()
  }
  if (body.supportEmail !== undefined) {
    if (typeof body.supportEmail !== 'string' || !body.supportEmail.trim()) {
      return { error: 'supportEmail must be a non-empty string' }
    }
    patch.supportEmail = body.supportEmail.trim()
  }
  if (body.supportPhone !== undefined) {
    patch.supportPhone =
      body.supportPhone === null || body.supportPhone === ''
        ? null
        : typeof body.supportPhone === 'string'
          ? body.supportPhone.trim()
          : null
  }
  for (const key of ['signupsEnabled', 'dealerSignupsEnabled', 'onlinePaymentsEnabled', 'newBookingsEnabled'] as const) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== 'boolean') {
        return { error: `${key} must be a boolean` }
      }
      patch[key] = body[key]
    }
  }
  return patch
}

function businessPatchFromBody(body: {
  platformCommissionRate?: number
  billingGraceDays?: number
  paymentHoldTtlMinutes?: number
  cancelNoticeDays?: number
  swapEligibleDays?: number
  subscriptionDepositAmount?: number
}): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  if (body.platformCommissionRate !== undefined) {
    patch.platformCommissionRate = String(body.platformCommissionRate)
  }
  if (body.billingGraceDays !== undefined) {
    patch.billingGraceDays = body.billingGraceDays
  }
  if (body.paymentHoldTtlMinutes !== undefined) {
    patch.paymentHoldTtlMinutes = body.paymentHoldTtlMinutes
  }
  if (body.cancelNoticeDays !== undefined) {
    patch.cancelNoticeDays = body.cancelNoticeDays
  }
  if (body.swapEligibleDays !== undefined) {
    patch.swapEligibleDays = body.swapEligibleDays
  }
  if (body.subscriptionDepositAmount !== undefined) {
    patch.subscriptionDepositAmount = String(body.subscriptionDepositAmount)
  }
  return patch
}

adminRouter.patch(
  '/settings/business',
  requireFullAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parseBody(adminPatchBusinessSettingsSchema, req, res)
    if (!body) return

    const existing = await ensureAppSettingsRow()
    const patch = businessPatchFromBody(body)
    if (Object.keys(patch).length === 0) {
      res.json(businessSettingsApiPayload(existing))
      return
    }

    const [row] = await db
      .update(appSettings)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(appSettings.id, existing.id))
      .returning()
    invalidateAppSettingsCache()
    await logAuditSafe({
      actorId: req.user!.sub,
      actorRole: req.user!.role,
      action: 'settings.business.update',
      entityType: 'app_settings',
      entityId: row.id,
      before: businessSettingsAuditSnapshot(existing),
      after: businessSettingsAuditSnapshot(row),
    })
    res.json(businessSettingsApiPayload(row))
  })
)

adminRouter.patch(
  '/settings',
  requireFullAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await ensureAppSettingsRow()
    const parsed = parseSettingsPatch(req.body as Record<string, unknown>)
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error })
      return
    }
    if (Object.keys(parsed).length === 0) {
      res.json(settingsApiPayload(existing))
      return
    }
    const [row] = await db
      .update(appSettings)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(appSettings.id, existing.id))
      .returning()
    invalidateAppSettingsCache()
    await logAuditSafe({
      actorId: req.user!.sub,
      actorRole: req.user!.role,
      action: 'settings.update',
      entityType: 'app_settings',
      entityId: row.id,
      before: settingsAuditSnapshot(existing),
      after: settingsAuditSnapshot(row),
    })
    res.json(settingsApiPayload(row))
  })
)

adminRouter.get(
  '/maintenance',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const status = (req.query.status as string | undefined)?.trim()
    const filters = status ? [eq(maintenanceRecords.status, status)] : []
    const where = filters.length ? and(...filters) : undefined
    const [totalRow] = where
      ? await db.select({ value: count() }).from(maintenanceRecords).where(where)
      : await db.select({ value: count() }).from(maintenanceRecords)
    const rows = await db
      .select()
      .from(maintenanceRecords)
      .where(where)
      .orderBy(desc(maintenanceRecords.createdAt))
      .limit(limit)
      .offset(offset)
    res.json(paginated(rows, Number(totalRow.value), page, pageSize))
  })
)

adminRouter.patch(
  '/maintenance/:id/complete',
  requireOpsCapability,
  asyncHandler(async (req: AuthedRequest, res) => {
    const [record] = await db
      .select()
      .from(maintenanceRecords)
      .where(eq(maintenanceRecords.id, req.params.id))
      .limit(1)
    if (!record) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    await db.transaction(async (tx) => {
      await tx
        .update(maintenanceRecords)
        .set({ status: 'completed', completedAt: new Date() })
        .where(eq(maintenanceRecords.id, record.id))
      const [openRental] = await tx
        .select({ id: rentals.id })
        .from(rentals)
        .where(
          and(
            eq(rentals.vehicleId, record.vehicleId),
            inArray(rentals.status, ['reserved', 'active', 'past_due'])
          )
        )
        .limit(1)
      if (!openRental) {
        await tx
          .update(vehicles)
          .set({ status: 'available' })
          .where(and(eq(vehicles.id, record.vehicleId), eq(vehicles.status, 'maintenance')))
      }
    })
    await logAuditSafe({
      actorId: req.user!.sub,
      actorRole: req.user!.role,
      action: 'maintenance.complete',
      entityType: 'maintenance_record',
      entityId: record.id,
      after: { vehicleId: record.vehicleId, status: 'completed' },
    })
    res.json({ ok: true })
  })
)

adminRouter.get(
  '/payouts',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const [totalRow] = await db.select({ value: count() }).from(payouts)
    const rows = await db
      .select({ payout: payouts, dealer: dealers })
      .from(payouts)
      .innerJoin(dealers, eq(payouts.dealerId, dealers.id))
      .orderBy(desc(payouts.createdAt))
      .limit(limit)
      .offset(offset)
    res.json(
      paginated(
        rows.map((r) => ({
          id: r.payout.id,
          dealerId: r.payout.dealerId,
          dealerName: r.dealer.name,
          amount: Number(r.payout.amount),
          status: r.payout.status,
          periodStart: r.payout.periodStart,
          periodEnd: r.payout.periodEnd,
          paidAt: r.payout.paidAt?.toISOString() ?? null,
          createdAt: r.payout.createdAt.toISOString(),
        })),
        Number(totalRow.value),
        page,
        pageSize
      )
    )
  })
)

adminRouter.post(
  '/payouts/generate',
  requireFinanceCapability,
  asyncHandler(async (req: AuthedRequest, res) => {
    const created = await generateDealerPayoutsUnderLock()
    if (created === null) {
      res.status(409).json({ error: 'Payout generation already in progress' })
      return
    }
    await logAuditSafe({
      actorId: req.user!.sub,
      actorRole: req.user!.role,
      action: 'payout.generate',
      entityType: 'payout_batch',
      after: { created },
    })
    res.json({ created })
  })
)

adminRouter.post(
  '/payouts/:id/mark-paid',
  requireFinanceCapability,
  asyncHandler(async (req: AuthedRequest, res) => {
    const ok = await markPayoutPaid(req.params.id, (req.body as { note?: string }).note)
    if (!ok) {
      res.status(404).json({ error: 'Payout not found or already paid' })
      return
    }
    const [payout] = await db.select().from(payouts).where(eq(payouts.id, req.params.id)).limit(1)
    if (payout) {
      const [dealer] = await db
        .select({
          name: dealers.name,
          contactEmail: dealers.contactEmail,
          ownerUserId: dealers.ownerUserId,
        })
        .from(dealers)
        .where(eq(dealers.id, payout.dealerId))
        .limit(1)
      const [owner] = dealer
        ? await db
            .select({ email: profiles.email })
            .from(profiles)
            .where(eq(profiles.id, dealer.ownerUserId))
            .limit(1)
        : []
      const to = owner?.email ?? dealer?.contactEmail
      if (to && dealer) {
        void sendPayoutPaidEmail({
          to,
          dealerName: dealer.name,
          amount: Number(payout.amount),
          payoutId: payout.id,
        }).catch((err) => console.error('Payout paid email failed:', err))
      }
    }
    await logAuditSafe({
      actorId: req.user!.sub,
      actorRole: req.user!.role,
      action: 'payout.mark_paid',
      entityType: 'payout',
      entityId: req.params.id,
    })
    if (payout) {
      trackAnalyticsEventSafe({
        eventType: 'payout_paid',
        entityType: 'payout',
        entityId: payout.id,
        properties: { dealerId: payout.dealerId, amount: Number(payout.amount) },
      })
    }
    res.json({ ok: true })
  })
)

adminRouter.post(
  '/payouts/:id/unmark-paid',
  requireFinanceCapability,
  asyncHandler(async (req: AuthedRequest, res) => {
    const [before] = await db.select().from(payouts).where(eq(payouts.id, req.params.id)).limit(1)
    const ok = await unmarkPayoutPaid(req.params.id, (req.body as { note?: string }).note)
    if (!ok) {
      res.status(404).json({ error: 'Payout not found or not in paid status' })
      return
    }
    const [after] = await db.select().from(payouts).where(eq(payouts.id, req.params.id)).limit(1)
    await logAuditSafe({
      actorId: req.user!.sub,
      actorRole: req.user!.role,
      action: 'payout.unmark_paid',
      entityType: 'payout',
      entityId: req.params.id,
      before: before ? { status: before.status, paidAt: before.paidAt?.toISOString() ?? null } : undefined,
      after: after ? { status: after.status, paidAt: after.paidAt?.toISOString() ?? null } : undefined,
    })
    res.json({ ok: true })
  })
)

adminRouter.post(
  '/invoices/:id/void',
  requireFinanceCapability,
  asyncHandler(async (req: AuthedRequest, res) => {
    const [before] = await db.select().from(invoices).where(eq(invoices.id, req.params.id)).limit(1)
    const outcome = await voidInvoiceByAdmin(req.params.id)
    if (outcome === 'not-found') {
      res.status(404).json({ error: 'Invoice not found' })
      return
    }
    if (outcome === 'not-voidable') {
      res.status(409).json({ error: `Invoice cannot be voided while status is "${before?.status ?? 'unknown'}"` })
      return
    }
    await logAuditSafe({
      actorId: req.user!.sub,
      actorRole: req.user!.role,
      action: 'invoice.void',
      entityType: 'invoice',
      entityId: req.params.id,
      before: before ? { status: before.status } : undefined,
      after: { status: 'void' },
      note: (req.body as { reason?: string }).reason ?? null,
    })
    res.json({ ok: true })
  })
)
