import { Router } from 'express'
import { and, count, desc, eq, exists, inArray, notExists, or } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  bookingRequests,
  complaints,
  customerProfiles,
  favorites,
  invoices,
  notifications,
  paymentMethods,
  profiles,
  rentals,
  subscriptions,
  vehicles,
} from '../db/schema.js'
import {
  mapBookingRequest,
  mapComplaint,
  mapFavorite,
  mapInvoice,
  mapNotification,
  mapPaymentMethod,
  mapRental,
  mapSubscription,
  mapVehicle,
} from '../db/mappers.js'
import { optionalAuth, requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js'
import { asyncHandler, paginated, parsePagination } from '../utils/http.js'
import { createBookingRequestForVehicle } from '../services/booking.js'
import { clearAuthCookies } from '../auth/tokens.js'
import { revokeAllRefreshSessions } from '../auth/sessions.js'

export const customerRouter = Router()

function vehicleCatalogFilter(viewerId?: string) {
  const noPending = notExists(
    db
      .select({ id: bookingRequests.id })
      .from(bookingRequests)
      .where(and(eq(bookingRequests.vehicleId, vehicles.id), eq(bookingRequests.status, 'pending')))
  )
  if (!viewerId) {
    return and(eq(vehicles.status, 'available'), noPending)
  }
  const ownPending = exists(
    db
      .select({ id: bookingRequests.id })
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.vehicleId, vehicles.id),
          eq(bookingRequests.status, 'pending'),
          eq(bookingRequests.customerId, viewerId)
        )
      )
  )
  return and(eq(vehicles.status, 'available'), or(noPending, ownPending))
}

// Public catalog — browse/detail pages load before login.
// Hide cars with pending bookings from other customers; the requester still sees theirs.
customerRouter.get(
  '/vehicles',
  optionalAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const where = vehicleCatalogFilter(req.user?.sub)
    const [totalRow] = await db.select({ value: count() }).from(vehicles).where(where)
    const rows = await db
      .select()
      .from(vehicles)
      .where(where)
      .limit(limit)
      .offset(offset)
    res.json(paginated(rows.map(mapVehicle), Number(totalRow.value), page, pageSize))
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
    const [pending] = await db
      .select({ customerId: bookingRequests.customerId })
      .from(bookingRequests)
      .where(and(eq(bookingRequests.vehicleId, row.id), eq(bookingRequests.status, 'pending')))
      .limit(1)
    if (pending && pending.customerId !== req.user?.sub) {
      res.status(404).json({ error: 'Vehicle not found' })
      return
    }
    res.json(mapVehicle(row))
  })
)

customerRouter.use(requireAuth, requireRole('customer'))

customerRouter.get(
  '/dashboard',
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = req.user!.sub
    const allRentals = await db
      .select()
      .from(rentals)
      .where(eq(rentals.customerId, userId))
      .orderBy(desc(rentals.createdAt))
    const upcomingRentals = allRentals
      .filter((r) => r.status === 'reserved' || r.status === 'active')
      .slice(0, 5)
      .map(mapRental)
    const recentRentals = allRentals.slice(0, 5).map(mapRental)
    const [fav] = await db
      .select({ value: count() })
      .from(favorites)
      .where(eq(favorites.customerId, userId))
    res.json({
      upcomingRentals,
      recentRentals,
      favoritesCount: Number(fav?.value ?? 0),
    })
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
      .select({ rental: rentals, vehicle: vehicles })
      .from(rentals)
      .leftJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
      .where(where)
      .orderBy(desc(rentals.createdAt))
      .limit(limit)
      .offset(offset)
    const items = rows.map((r) => ({
      ...mapRental(r.rental),
      vehicle: r.vehicle ? mapVehicle(r.vehicle) : undefined,
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
    const pendingRows = await db
      .select({ vehicleId: bookingRequests.vehicleId })
      .from(bookingRequests)
      .where(and(inArray(bookingRequests.vehicleId, vehicleIds), eq(bookingRequests.status, 'pending')))
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
      .returning()
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
  asyncHandler(async (req: AuthedRequest, res) => {
    const { vehicleId, note } = req.body as { vehicleId?: string; note?: string }
    if (!vehicleId) {
      res.status(400).json({ error: 'vehicleId required' })
      return
    }
    const result = await createBookingRequestForVehicle({ customerId: req.user!.sub, vehicleId, note })
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
    const [row] = await db
      .update(bookingRequests)
      .set({ status: 'declined' })
      .where(
        and(
          eq(bookingRequests.id, req.params.id),
          eq(bookingRequests.customerId, req.user!.sub),
          eq(bookingRequests.status, 'pending')
        )
      )
      .returning()
    if (!row) {
      res.status(404).json({ error: 'Not found or already resolved' })
      return
    }
    res.json(mapBookingRequest(row))
  })
)

customerRouter.patch(
  '/booking-requests/:id/note',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { note } = req.body as { note?: string }
    const [row] = await db
      .update(bookingRequests)
      .set({ note: note ?? null })
      .where(
        and(eq(bookingRequests.id, req.params.id), eq(bookingRequests.customerId, req.user!.sub))
      )
      .returning()
    if (!row) {
      res.status(404).json({ error: 'Not found' })
      return
    }
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
    const { qidDocumentPath, driversLicensePath } = req.body as {
      qidDocumentPath?: string
      driversLicensePath?: string
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

customerRouter.patch(
  '/profile',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { name, phone, email } = req.body as {
      name?: string
      phone?: string
      email?: string
    }
    const patch: Record<string, unknown> = {}
    if (name !== undefined) patch.name = name
    if (phone !== undefined) patch.phone = phone
    if (email !== undefined) patch.email = email
    const [row] = await db
      .update(profiles)
      .set(patch as any)
      .where(eq(profiles.id, req.user!.sub))
      .returning()
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
    res.json({ profile: user ?? null, customerProfile: cp ?? null })
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
    await db.update(profiles).set({ avatarUrl }).where(eq(profiles.id, req.user!.sub))
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

customerRouter.patch(
  '/rentals/:id/status',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { status } = req.body as { status?: string }
    const [row] = await db
      .update(rentals)
      .set({ status: status as any })
      .where(and(eq(rentals.id, req.params.id), eq(rentals.customerId, req.user!.sub)))
      .returning()
    if (!row) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    if (status === 'completed' || status === 'cancelled') {
      await db.update(vehicles).set({ status: 'available' }).where(eq(vehicles.id, row.vehicleId))
    }
    res.json(mapRental(row))
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
    res.status(201).json(mapComplaint(row))
  })
)

customerRouter.delete(
  '/account',
  asyncHandler(async (req: AuthedRequest, res) => {
    const activeRentals = await db
      .select({ id: rentals.id })
      .from(rentals)
      .where(
        and(
          eq(rentals.customerId, req.user!.sub),
          inArray(rentals.status, ['reserved', 'active'])
        )
      )
    if (activeRentals.length > 0) {
      res.status(409).json({ error: 'Cannot delete account with active rentals' })
      return
    }

    await revokeAllRefreshSessions(req.user!.sub)
    await db.delete(favorites).where(eq(favorites.customerId, req.user!.sub))
    await db.delete(paymentMethods).where(eq(paymentMethods.userId, req.user!.sub))
    await db.delete(customerProfiles).where(eq(customerProfiles.userId, req.user!.sub))
    await db.delete(profiles).where(eq(profiles.id, req.user!.sub))
    clearAuthCookies(res)
    res.status(204).end()
  })
)
