import { and, count, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { Router } from 'express'
import { db } from '../db/index.js'
import {
  mapBookingRequest,
  mapDealer,
  mapInvoice,
  mapLead,
  mapMaintenanceRecord,
  mapMessage,
  mapNotification,
  mapPayment,
  mapPaymentMethod,
  mapProfileToUser,
  mapRental,
  mapRentalEvent,
  mapSubscription,
  mapSwapRequest,
  mapVehicle,
} from '../db/mappers.js'
import {
  bookingRequests,
  customerProfiles,
  dealers,
  invoices,
  leads,
  maintenanceRecords,
  rentalReviews,
  messages,
  notifications,
  paymentMethods,
  payments,
  profiles,
  rentalEvents,
  rentals,
  subscriptions,
  swapRequests,
  vehicles,
} from '../db/schema.js'
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js'
import { logAudit } from '../services/audit.js'
import { findOldestUnpaidInvoice, settleInvoice } from '../services/billing.js'
import { transitionBookingRequest } from '../services/booking.js'
import {
  aggregateDealerRevenue,
  buildDealerAnalyticsResponse,
  countRentals,
  monthlyPaymentBuckets,
  countVehicles,
} from '../services/dashboardStats.js'
import { normalizeVehicleImages, parseOptionalVehicleFeatures } from '../services/vehicleFields.js'
import { dealerCanAccessCustomerDocuments } from '../services/documentAccess.js'
import {
  assertBookingContext,
  assertRentalContext,
  dealerCanMessageCustomer,
  listMessageThreads,
  listThreadMessages,
  listUserMessages,
  resolveComposeSubject,
  sendMessage,
  userOwnsMessage,
} from '../services/messages.js'
import { notifyUser } from '../services/notify.js'
import {
  acceptDealerMaintenanceRequest,
  completeDealerMaintenanceRecord,
  scheduleDealerMaintenanceRequest,
} from '../services/maintenance.js'
import {
  decideSwapRequest,
  pauseRental,
  recordHandover,
  recordReturn,
  resumeRental,
  acknowledgePickupFulfilment,
} from '../services/rentalLifecycle.js'
import { extendRentalTerm } from '../services/rentalExtension.js'
import { listDealerReviews, respondToReview } from '../services/reviews.js'
import { asyncHandler, paginated, parsePagination, attachUuidParamGuard } from '../utils/http.js'
import { parseBody } from '../validation/parse.js'
import {
  customerPatchMessageFolderSchema,
  customerPatchMessageReadSchema,
  dealerExtendRentalSchema,
  pauseRentalSchema,
  dealerPickupFulfilmentSchema,
  dealerReviewResponseSchema,
  dealerReturnRentalSchema,
  dealerScheduleMaintenanceSchema,
  portalCreateMessageSchema,
} from '../validation/schemas.js'


export const dealerRouter = Router()
attachUuidParamGuard(dealerRouter)
dealerRouter.use(requireAuth, requireRole('dealer'))

export async function getDealerOrThrow(userId: string) {
  const [dealer] = await db.select().from(dealers).where(eq(dealers.ownerUserId, userId)).limit(1)
  if (!dealer) throw Object.assign(new Error('Dealer profile not found'), { status: 404 })
  if (dealer.status !== 'active') {
    throw Object.assign(new Error('Your dealer account is pending admin approval'), { status: 403 })
  }
  return dealer
}

dealerRouter.get(
  '/dashboard',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const [totalRevenue, rentalsTotal, vehicleCount, leadsCount, buckets, recent] =
      await Promise.all([
        aggregateDealerRevenue(dealer.id),
        countRentals(dealer.id),
        countVehicles(dealer.id),
        db.select({ value: count() }).from(leads).where(eq(leads.dealerId, dealer.id)),
        monthlyPaymentBuckets(6, dealer.id),
        db
          .select({ rental: rentals, vehicle: vehicles, customer: profiles })
          .from(rentals)
          .leftJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
          .leftJoin(profiles, eq(rentals.customerId, profiles.id))
          .where(eq(rentals.dealerId, dealer.id))
          .orderBy(desc(rentals.createdAt))
          .limit(5),
      ])
    const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const inventory = await db.select().from(vehicles).where(eq(vehicles.dealerId, dealer.id))

    res.json({
      kpis: [
        { label: 'Total Revenue', value: totalRevenue },
        { label: 'Total Rentals', value: rentalsTotal },
        { label: 'Active Vehicles', value: vehicleCount },
        { label: 'Active Leads', value: Number(leadsCount[0]?.value ?? 0) },
      ],
      revenueTrend: Object.entries(buckets).map(([key, value]) => ({
        date: key,
        value,
      })),
      bookingTrend: [],
      revenueChartData: Object.entries(buckets).map(([key, revenue]) => {
        const [, m] = key.split('-')
        return { month: `${MONTH[parseInt(m, 10) - 1]} ${key.slice(0, 4)}`, revenue }
      }),
      recentRentals: recent.map((r) => ({
        id: r.rental.id,
        customerName: r.customer?.name ?? 'Unknown customer',
        vehicleName: r.vehicle?.name ?? 'Unknown',
        status: r.rental.status,
        createdAt: r.rental.createdAt.toISOString(),
        paymentStatus: r.rental.paymentStatus,
        totalAmount: Number(r.rental.totalAmount),
      })),
      vehiclesWithStatus: inventory.map((v) => ({
        id: v.id,
        name: v.name,
        status: v.status,
      })),
    })
  })
)

dealerRouter.get(
  '/analytics',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    res.json(await buildDealerAnalyticsResponse(dealer.id))
  })
)

dealerRouter.get(
  '/inventory',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const where = eq(vehicles.dealerId, dealer.id)
    const [totalRow] = await db.select({ value: count() }).from(vehicles).where(where)
    const rows = await db.select().from(vehicles).where(where).limit(limit).offset(offset)
    res.json(paginated(rows.map(mapVehicle), Number(totalRow.value), page, pageSize))
  })
)

dealerRouter.post(
  '/vehicles',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const body = req.body as Record<string, unknown>
    const { imageUrl, imageUrls } = normalizeVehicleImages(body)
    const features = parseOptionalVehicleFeatures(body.features)
    const mileageCapKm =
      body.mileageCapKm !== undefined
        ? Number(body.mileageCapKm)
        : body.mileage_cap_km !== undefined
          ? Number(body.mileage_cap_km)
          : undefined
    const [row] = await db
      .insert(vehicles)
      .values({
        dealerId: dealer.id,
        name: body.name,
        make: body.make,
        model: body.model,
        year: body.year,
        category: body.category,
        status: CREATABLE_VEHICLE_STATUSES.includes(body.status as any)
          ? body.status
          : 'available',
        pricePerDay: String(body.pricePerDay ?? body.price_per_day ?? 0),
        mileage: body.mileage ?? 0,
        transmission: body.transmission,
        fuelType: body.fuelType ?? body.fuel_type,
        seats: body.seats ?? 4,
        imageUrl,
        imageUrls,
        description: typeof body.description === 'string' ? body.description.trim() || null : null,
        color: typeof body.color === 'string' ? body.color.trim() || null : null,
        mileageCapKm:
          mileageCapKm !== undefined && Number.isFinite(mileageCapKm) ? Math.max(0, mileageCapKm) : null,
        features: features ?? [],
        licensePlate: body.licensePlate ?? body.license_plate ?? null,
        locationCity:
          typeof body.locationCity === 'string'
            ? body.locationCity.trim() || null
            : typeof body.location_city === 'string'
              ? body.location_city.trim() || null
              : null,
        locationArea:
          typeof body.locationArea === 'string'
            ? body.locationArea.trim() || null
            : typeof body.location_area === 'string'
              ? body.location_area.trim() || null
              : null,
        latitude:
          body.latitude != null && Number.isFinite(Number(body.latitude))
            ? String(body.latitude)
            : null,
        longitude:
          body.longitude != null && Number.isFinite(Number(body.longitude))
            ? String(body.longitude)
            : null,
      } as typeof vehicles.$inferInsert)
      .returning()
    await db
      .update(dealers)
      .set({ vehiclesCount: sql`${dealers.vehiclesCount} + 1` })
      .where(eq(dealers.id, dealer.id))
    res.status(201).json(mapVehicle(row))
  })
)

dealerRouter.patch(
  '/vehicles/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const u = req.body
    const patch: Record<string, unknown> = {}
    if (u.name !== undefined) patch.name = u.name
    if (u.make !== undefined) patch.make = u.make
    if (u.model !== undefined) patch.model = u.model
    if (u.year !== undefined) patch.year = u.year
    if (u.category !== undefined) patch.category = u.category
    if (u.status !== undefined) {
      // Status changes go through the guarded endpoint; silently ignoring a
      // mixed payload would surprise callers, so reject it explicitly.
      res.status(400).json({ error: 'Use PATCH /vehicles/:id/status to change vehicle status' })
      return
    }
    if (u.pricePerDay !== undefined) patch.pricePerDay = String(u.pricePerDay)
    if (u.mileage !== undefined) patch.mileage = u.mileage
    if (u.transmission !== undefined) patch.transmission = u.transmission
    if (u.fuelType !== undefined) patch.fuelType = u.fuelType
    if (u.seats !== undefined) patch.seats = u.seats
    if (u.imageUrls !== undefined || u.image_urls !== undefined) {
      const normalized = normalizeVehicleImages(u as Record<string, unknown>)
      patch.imageUrl = normalized.imageUrl
      patch.imageUrls = normalized.imageUrls
    } else if (u.imageUrl !== undefined || u.image_url !== undefined) {
      // Cover-only edit. normalizeVehicleImages would collapse imageUrls to just
      // this one URL, silently deleting the rest of the gallery.
      patch.imageUrl =
        typeof u.imageUrl === 'string'
          ? u.imageUrl
          : typeof u.image_url === 'string'
            ? u.image_url
            : null
    }
    if (u.description !== undefined) patch.description = u.description?.trim() || null
    if (u.color !== undefined) patch.color = u.color
    if (u.mileageCapKm !== undefined || u.mileage_cap_km !== undefined) {
      const cap = Number(u.mileageCapKm ?? u.mileage_cap_km)
      patch.mileageCapKm = Number.isFinite(cap) ? Math.max(0, cap) : null
    }
    if (u.features !== undefined) patch.features = parseOptionalVehicleFeatures(u.features) ?? []
    if (u.licensePlate !== undefined) patch.licensePlate = u.licensePlate
    if (u.locationCity !== undefined || u.location_city !== undefined) {
      const city = u.locationCity ?? u.location_city
      patch.locationCity = typeof city === 'string' ? city.trim() || null : null
    }
    if (u.locationArea !== undefined || u.location_area !== undefined) {
      const area = u.locationArea ?? u.location_area
      patch.locationArea = typeof area === 'string' ? area.trim() || null : null
    }
    if (u.latitude !== undefined) {
      patch.latitude = u.latitude != null && Number.isFinite(Number(u.latitude)) ? String(u.latitude) : null
    }
    if (u.longitude !== undefined) {
      patch.longitude =
        u.longitude != null && Number.isFinite(Number(u.longitude)) ? String(u.longitude) : null
    }
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: 'No fields to update' })
      return
    }
    const [row] = await db
      .update(vehicles)
      .set(patch as any)
      .where(and(eq(vehicles.id, req.params.id), eq(vehicles.dealerId, dealer.id)))
      .returning()
    if (!row) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json(mapVehicle(row))
  })
)

const VEHICLE_STATUSES = ['available', 'rented', 'maintenance', 'inactive'] as const

/** 'rented' is owned by the rental lifecycle, never set directly at creation. */
const CREATABLE_VEHICLE_STATUSES = ['available', 'maintenance', 'inactive'] as const

/**
 * Guarded vehicle status change: a vehicle with an open rental cannot be made
 * bookable again by hand (that produced ghost double-bookings — audit §3/§8);
 * end the rental via the return flow instead.
 */
async function guardedVehicleStatusChange(params: {
  vehicleId: string
  dealerId?: string
  status: string
}): Promise<{ status: number; body: any }> {
  if (!VEHICLE_STATUSES.includes(params.status as any)) {
    return { status: 400, body: { error: `status must be one of ${VEHICLE_STATUSES.join(', ')}` } }
  }
  if (params.status === 'rented') {
    // 'rented' is system-managed (approval/swap set it); manual writes create
    // a vehicle marked rented with no open rental (re-audit L5).
    return {
      status: 400,
      body: { error: 'Status "rented" is managed by bookings and cannot be set manually' },
    }
  }
  return db.transaction(async (tx) => {
    const scope = params.dealerId
      ? and(eq(vehicles.id, params.vehicleId), eq(vehicles.dealerId, params.dealerId))
      : eq(vehicles.id, params.vehicleId)
    const [vehicle] = await tx.select().from(vehicles).where(scope).for('update').limit(1)
    if (!vehicle) return { status: 404, body: { error: 'Not found' } }
    if (params.status !== 'rented') {
      const [openRental] = await tx
        .select({ id: rentals.id, status: rentals.status })
        .from(rentals)
        .where(
          and(
            eq(rentals.vehicleId, vehicle.id),
            inArray(rentals.status, ['reserved', 'active', 'paused', 'past_due'])
          )
        )
        .limit(1)
      if (openRental) {
        return {
          status: 409,
          body: {
            error: `Vehicle has an open rental (${openRental.status}). Complete or cancel the rental first.`,
          },
        }
      }
    }
    const [row] = await tx
      .update(vehicles)
      .set({ status: params.status as any })
      .where(eq(vehicles.id, vehicle.id))
      .returning()
    return { status: 200, body: mapVehicle(row) }
  })
}

dealerRouter.patch(
  '/vehicles/:id/status',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const { status } = req.body
    const result = await guardedVehicleStatusChange({
      vehicleId: req.params.id,
      dealerId: dealer.id,
      status: String(status),
    })
    res.status(result.status === 200 ? 200 : result.status).json(result.body)
  })
)

export { guardedVehicleStatusChange }

dealerRouter.delete(
  '/vehicles/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const [activeRental] = await db
      .select({ id: rentals.id })
      .from(rentals)
      .where(
        and(
          eq(rentals.vehicleId, req.params.id),
          eq(rentals.dealerId, dealer.id),
          inArray(rentals.status, ['reserved', 'active', 'paused', 'past_due'])
        )
      )
      .limit(1)
    if (activeRental) {
      res.status(409).json({ error: 'Cannot delete a vehicle with an active or reserved rental' })
      return
    }
    const [historicRental] = await db
      .select({ id: rentals.id })
      .from(rentals)
      .where(and(eq(rentals.vehicleId, req.params.id), eq(rentals.dealerId, dealer.id)))
      .limit(1)
    if (historicRental) {
      res.status(409).json({
        error:
          'This vehicle has rental history and cannot be deleted. Set its status to "inactive" to retire it.',
      })
      return
    }
    const blockers: Array<[string, typeof bookingRequests | typeof maintenanceRecords | typeof rentalReviews]> =
      [
        ['booking requests', bookingRequests],
        ['maintenance records', maintenanceRecords],
        ['reviews', rentalReviews],
      ]
    for (const [label, table] of blockers) {
      const [row] = await db
        .select({ id: table.id })
        .from(table)
        .where(eq(table.vehicleId, req.params.id))
        .limit(1)
      if (row) {
        res.status(409).json({
          error: `This vehicle has ${label} and cannot be deleted. Set its status to "inactive" to retire it.`,
        })
        return
      }
    }
    const deleted = await db
      .delete(vehicles)
      .where(and(eq(vehicles.id, req.params.id), eq(vehicles.dealerId, dealer.id)))
      .returning({ id: vehicles.id })
    if (deleted.length === 0) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    await db
      .update(dealers)
      .set({ vehiclesCount: sql`GREATEST(${dealers.vehiclesCount} - 1, 0)` })
      .where(eq(dealers.id, dealer.id))
    res.status(204).end()
  })
)

dealerRouter.get(
  '/booking-requests',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const dealerVehicles = await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.dealerId, dealer.id))
    const ids = dealerVehicles.map((v) => v.id)
    if (ids.length === 0) {
      res.json(paginated([], 0, page, pageSize))
      return
    }
    // Unpaid online-payment holds are internal; dealers only see requests
    // that are actionable (paid online, or pay-at-shop).
    const where = and(
      inArray(bookingRequests.vehicleId, ids),
      eq(bookingRequests.awaitingPayment, false)
    )
    const [totalRow] = await db.select({ value: count() }).from(bookingRequests).where(where)
    const rows = await db
      .select({ br: bookingRequests, vehicle: vehicles, customer: profiles })
      .from(bookingRequests)
      .innerJoin(vehicles, eq(bookingRequests.vehicleId, vehicles.id))
      .leftJoin(profiles, eq(bookingRequests.customerId, profiles.id))
      .where(where)
      .orderBy(desc(bookingRequests.createdAt))
      .limit(limit)
      .offset(offset)
    const items = rows.map((r) => ({
      ...mapBookingRequest(r.br),
      vehicle: mapVehicle(r.vehicle),
      customer: r.customer
        ? { id: r.customer.id, name: r.customer.name, email: r.customer.email }
        : undefined,
    }))
    res.json(paginated(items, Number(totalRow.value), page, pageSize))
  })
)

dealerRouter.patch(
  '/booking-requests/:id/status',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const { status, declineReason } = req.body as { status?: string; declineReason?: string }
    if (status !== 'approved' && status !== 'declined') {
      res.status(400).json({ error: 'status must be approved or declined' })
      return
    }
    const result = await transitionBookingRequest({
      bookingRequestId: req.params.id,
      status,
      declineReason,
      scopeDealerId: dealer.id,
      actor: { id: req.user!.sub, role: 'dealer' },
    })
    res.status(result.status).json(result.body)
  })
)

// ---------------------------------------------------------------------------
// Rental / subscription lifecycle (handover, return, swaps) — audit BUG-07/09
// ---------------------------------------------------------------------------

dealerRouter.get(
  '/rentals',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const status = req.query.status as string | undefined
    const filters = [eq(rentals.dealerId, dealer.id)]
    if (
      status &&
      ['reserved', 'active', 'paused', 'past_due', 'completed', 'cancelled'].includes(status)
    ) {
      filters.push(eq(rentals.status, status as any))
    }
    const where = and(...filters)
    const [totalRow] = await db.select({ value: count() }).from(rentals).where(where)
    const rows = await db
      .select({ rental: rentals, vehicle: vehicles, customer: profiles })
      .from(rentals)
      .leftJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
      .leftJoin(profiles, eq(rentals.customerId, profiles.id))
      .where(where)
      .orderBy(desc(rentals.createdAt))
      .limit(limit)
      .offset(offset)
    const items = rows.map((r) => ({
      ...mapRental(r.rental),
      vehicle: r.vehicle ? mapVehicle(r.vehicle) : undefined,
      customer: r.customer ? mapProfileToUser(r.customer) : undefined,
    }))
    res.json(paginated(items, Number(totalRow.value), page, pageSize))
  })
)

dealerRouter.get(
  '/rentals/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const [row] = await db
      .select({ rental: rentals, vehicle: vehicles, customer: profiles })
      .from(rentals)
      .leftJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
      .leftJoin(profiles, eq(rentals.customerId, profiles.id))
      .where(and(eq(rentals.id, req.params.id), eq(rentals.dealerId, dealer.id)))
      .limit(1)
    if (!row) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const events = await db
      .select()
      .from(rentalEvents)
      .where(eq(rentalEvents.rentalId, row.rental.id))
      .orderBy(desc(rentalEvents.createdAt))
    const invoiceRows = await db
      .select()
      .from(invoices)
      .where(eq(invoices.rentalId, row.rental.id))
      .orderBy(desc(invoices.date))
    res.json({
      ...mapRental(row.rental),
      vehicle: row.vehicle ? mapVehicle(row.vehicle) : undefined,
      customer: row.customer ? mapProfileToUser(row.customer) : undefined,
      events: events.map(mapRentalEvent),
      invoices: invoiceRows.map(mapInvoice),
    })
  })
)

/** Pickup: records mileage/condition and activates the subscription. */
dealerRouter.post(
  '/rentals/:id/handover',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const { mileage, fuelLevel, conditionNotes, photos } = req.body as {
      mileage?: number
      fuelLevel?: string
      conditionNotes?: string
      photos?: string[]
    }
    const result = await recordHandover({
      rentalId: req.params.id,
      dealerId: dealer.id,
      actorId: req.user!.sub,
      mileage: typeof mileage === 'number' ? mileage : undefined,
      fuelLevel,
      conditionNotes,
      photos: Array.isArray(photos) ? photos.slice(0, 20).map(String) : undefined,
    })
    res.status(result.status).json(result.status < 400 ? mapRental(result.body) : result.body)
  })
)

/** Return + inspection: completes the subscription, frees or parks the car. */
dealerRouter.post(
  '/rentals/:id/return',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const body = parseBody(dealerReturnRentalSchema, req, res)
    if (!body) return

    const result = await recordReturn({
      rentalId: req.params.id,
      dealerId: dealer.id,
      actorId: req.user!.sub,
      mileage: body.mileage,
      fuelLevel: body.fuelLevel,
      conditionNotes: body.conditionNotes,
      photos: body.photos,
      vehicleNextStatus: body.vehicleNextStatus ?? 'available',
      depositResolution: body.depositResolution,
    })
    res.status(result.status).json(result.status < 400 ? mapRental(result.body) : result.body)
  })
)

/** Extend minimum term for an active subscription (dealer-initiated). */
dealerRouter.post(
  '/rentals/:id/extend',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const body = parseBody(dealerExtendRentalSchema, req, res)
    if (!body) return

    const result = await extendRentalTerm({
      rentalId: req.params.id,
      scope: { dealerId: dealer.id },
      actor: { id: req.user!.sub, role: 'dealer' },
      months: body.months,
    })
    res.status(result.status).json(result.body)
  })
)

/** Pause an active subscription (travel hold) on behalf of the customer. */
dealerRouter.post(
  '/rentals/:id/pause',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const body = parseBody(pauseRentalSchema, req, res)
    if (!body) return
    const result = await pauseRental({
      rentalId: req.params.id,
      actor: { id: req.user!.sub, role: 'dealer' },
      dealerId: dealer.id,
      days: body.days,
      reason: body.reason,
    })
    res.status(result.status).json(result.status < 400 ? mapRental(result.body) : result.body)
  })
)

/** Resume a paused subscription and shift billing forward. */
dealerRouter.post(
  '/rentals/:id/resume',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const result = await resumeRental({
      rentalId: req.params.id,
      actor: { id: req.user!.sub, role: 'dealer' },
      dealerId: dealer.id,
    })
    res.status(result.status).json(result.status < 400 ? mapRental(result.body) : result.body)
  })
)

/** Customer reviews for this dealer's fleet. */
dealerRouter.get(
  '/reviews',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const { page, pageSize } = parsePagination(req.query as Record<string, unknown>)
    const result = await listDealerReviews(dealer.id, page, pageSize)
    res.json(result)
  })
)

/** Post one public response to a customer review. */
dealerRouter.post(
  '/reviews/:id/respond',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const body = parseBody(dealerReviewResponseSchema, req, res)
    if (!body) return
    const result = await respondToReview({
      reviewId: req.params.id,
      dealerId: dealer.id,
      actorId: req.user!.sub,
      response: body.response,
    })
    res.status(result.status).json(result.body)
  })
)

/** Mark customer delivery/pickup as scheduled or delivered. */
dealerRouter.post(
  '/rentals/:id/pickup-fulfilment',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const body = parseBody(dealerPickupFulfilmentSchema, req, res)
    if (!body) return

    const result = await acknowledgePickupFulfilment({
      rentalId: req.params.id,
      dealerId: dealer.id,
      actorId: req.user!.sub,
      status: body.status,
    })
    res.status(result.status).json(result.status < 400 ? mapRental(result.body) : result.body)
  })
)

dealerRouter.get(
  '/swap-requests',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const dealerRentals = db
      .select({ id: rentals.id })
      .from(rentals)
      .where(eq(rentals.dealerId, dealer.id))
    const where = inArray(swapRequests.rentalId, dealerRentals)
    const [totalRow] = await db.select({ value: count() }).from(swapRequests).where(where)
    const rows = await db
      .select()
      .from(swapRequests)
      .where(where)
      .orderBy(desc(swapRequests.createdAt))
      .limit(limit)
      .offset(offset)
    // Hydrate vehicles + customer for display.
    const vehicleIds = [
      ...new Set(rows.flatMap((r) => [r.currentVehicleId, r.requestedVehicleId])),
    ]
    const customerIds = [...new Set(rows.map((r) => r.customerId))]
    const vehicleRows = vehicleIds.length
      ? await db.select().from(vehicles).where(inArray(vehicles.id, vehicleIds))
      : []
    const customerRows = customerIds.length
      ? await db.select().from(profiles).where(inArray(profiles.id, customerIds))
      : []
    const vMap = new Map(vehicleRows.map((v) => [v.id, mapVehicle(v)]))
    const cMap = new Map(customerRows.map((c) => [c.id, mapProfileToUser(c)]))
    const items = rows.map((r) => ({
      ...mapSwapRequest(r),
      currentVehicle: vMap.get(r.currentVehicleId),
      requestedVehicle: vMap.get(r.requestedVehicleId),
      customer: cMap.get(r.customerId),
    }))
    res.json(paginated(items, Number(totalRow.value), page, pageSize))
  })
)

dealerRouter.patch(
  '/swap-requests/:id/status',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const { status, declineReason, mileageOut, mileageIn } = req.body as {
      status?: string
      declineReason?: string
      mileageOut?: number
      mileageIn?: number
    }
    if (status !== 'approved' && status !== 'declined') {
      res.status(400).json({ error: 'status must be approved or declined' })
      return
    }
    const result = await decideSwapRequest({
      swapRequestId: req.params.id,
      dealerId: dealer.id,
      actorId: req.user!.sub,
      approve: status === 'approved',
      declineReason,
      mileageOut: typeof mileageOut === 'number' ? mileageOut : undefined,
      mileageIn: typeof mileageIn === 'number' ? mileageIn : undefined,
    })
    res.status(result.status).json(result.body)
  })
)

/**
 * Records an offline (cash/card-at-shop) payment against a rental's oldest
 * unpaid invoice. The amount is SERVER-DERIVED from the invoice — the client
 * cannot choose what a rental costs (audit BUG-13) — and the customer is
 * always the rental's customer. Activation is NOT a side effect of payment:
 * handover activates (audit BUG-07). Settling the invoice restores past_due
 * subscriptions automatically.
 */
dealerRouter.post(
  '/payments/offline',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const { rentalId, method } = req.body as { rentalId?: string; method?: string }
    const methodType =
      method === 'bank' || method === 'wallet' || method === 'card' ? method : 'card'
    if (!rentalId) {
      res.status(400).json({ error: 'rentalId required' })
      return
    }

    const result = await db.transaction(async (tx) => {
      const [rental] = await tx
        .select()
        .from(rentals)
        .where(and(eq(rentals.id, rentalId), eq(rentals.dealerId, dealer.id)))
        .for('update')
        .limit(1)
      if (!rental) {
        return { status: 404 as const, body: { error: 'Rental not found' } as any }
      }
      if (rental.status === 'cancelled') {
        return {
          status: 409 as const,
          body: { error: 'Cannot record a payment on a cancelled rental' } as any,
        }
      }
      // Completed rentals may still carry overdue receivables (returns no
      // longer void overdue invoices — re-audit F10), so they stay payable.
      const invoice = await findOldestUnpaidInvoice(tx, rental.id)
      if (!invoice) {
        const [existing] = await tx
          .select()
          .from(payments)
          .where(and(eq(payments.rentalId, rental.id), eq(payments.status, 'completed')))
          .orderBy(desc(payments.createdAt))
          .limit(1)
        if (existing) {
          // Idempotent: nothing due; return the latest completed payment.
          return { status: 200 as const, body: mapPayment(existing) }
        }
        return { status: 409 as const, body: { error: 'Nothing is due on this rental' } as any }
      }

      const [row] = await tx
        .insert(payments)
        .values({
          rentalId: rental.id,
          customerId: rental.customerId,
          dealerId: dealer.id,
          invoiceId: invoice.id,
          amount: invoice.amount,
          status: 'completed',
          type: 'rental',
          method: methodType,
          provider: 'manual',
        })
        .returning()
      const outcome = await settleInvoice(tx, { invoiceId: invoice.id, paymentId: row.id })
      if (outcome !== 'settled') {
        // The invoice was settled/voided by a concurrent payment between our
        // lookup and now — abort so the cash is never double-recorded.
        throw Object.assign(
          new Error('This invoice was just settled by another payment. Do not collect.'),
          { status: 409 }
        )
      }
      await notifyUser(tx, {
        userId: rental.customerId,
        type: 'success',
        title: 'Payment received',
        message: `Your dealer recorded a payment of QAR ${Number(invoice.amount).toFixed(2)}. Thank you!`,
      })
      await logAudit(tx, {
        actorId: req.user!.sub,
        actorRole: 'dealer',
        action: 'payment.offline.recorded',
        entityType: 'payment',
        entityId: row.id,
        after: { rentalId: rental.id, invoiceId: invoice.id, amount: invoice.amount },
      })
      return { status: 201 as const, body: mapPayment(row) }
    })

    res.status(result.status).json(result.body)
  })
)

dealerRouter.get(
  '/customer-documents/:customerId',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const allowed = await dealerCanAccessCustomerDocuments(dealer.id, req.params.customerId)
    if (!allowed) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    const [row] = await db
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, req.params.customerId))
      .limit(1)
    res.json({
      qidDocumentPath: row?.qidDocumentPath ?? null,
      driversLicensePath: row?.driversLicensePath ?? null,
    })
  })
)

dealerRouter.get(
  '/leads',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const where = eq(leads.dealerId, dealer.id)
    const [totalRow] = await db.select({ value: count() }).from(leads).where(where)
    const rows = await db
      .select()
      .from(leads)
      .where(where)
      .orderBy(desc(leads.createdAt))
      .limit(limit)
      .offset(offset)
    res.json(paginated(rows.map(mapLead), Number(totalRow.value), page, pageSize))
  })
)

dealerRouter.post(
  '/leads',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const b = req.body
    const leadPriority = b.priority === 'low' || b.priority === 'high' ? b.priority : 'medium'
    const [row] = await db
      .insert(leads)
      .values({
        dealerId: dealer.id,
        name: b.name,
        email: b.email,
        phone: b.phone ?? null,
        source: b.source || 'manual',
        stage: b.stage || 'new',
        priority: leadPriority,
        notes: b.notes ?? null,
      })
      .returning()
    res.status(201).json(mapLead(row))
  })
)

dealerRouter.patch(
  '/leads/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const u = req.body
    const patch: Record<string, unknown> = {}
    if (u.name !== undefined) patch.name = u.name
    if (u.email !== undefined) patch.email = u.email
    if (u.phone !== undefined) patch.phone = u.phone
    if (u.source !== undefined) patch.source = u.source
    if (u.stage !== undefined) patch.stage = u.stage
    if (u.priority !== undefined) {
      patch.priority =
        u.priority === 'low' || u.priority === 'high' ? u.priority : 'medium'
    }
    if (u.notes !== undefined) patch.notes = u.notes
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: 'No fields to update' })
      return
    }
    const [row] = await db
      .update(leads)
      .set(patch as any)
      .where(and(eq(leads.id, req.params.id), eq(leads.dealerId, dealer.id)))
      .returning()
    if (!row) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json(mapLead(row))
  })
)

dealerRouter.delete(
  '/leads/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    await db.delete(leads).where(and(eq(leads.id, req.params.id), eq(leads.dealerId, dealer.id)))
    res.status(204).end()
  })
)

dealerRouter.get(
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

dealerRouter.post(
  '/notifications/:id/read',
  asyncHandler(async (req: AuthedRequest, res) => {
    const [row] = await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.id, req.params.id), eq(notifications.userId, req.user!.sub)))
      .returning()
    res.json(row ? mapNotification(row) : null)
  })
)

dealerRouter.post(
  '/notifications/read-all',
  asyncHandler(async (req: AuthedRequest, res) => {
    const rows = await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.userId, req.user!.sub))
      .returning()
    res.json(rows.map(mapNotification))
  })
)

dealerRouter.get(
  '/vehicle-count',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const [row] = await db
      .select({ value: count() })
      .from(vehicles)
      .where(eq(vehicles.dealerId, dealer.id))
    res.json({ count: Number(row?.value ?? 0) })
  })
)

dealerRouter.get(
  '/subscription',
  asyncHandler(async (req: AuthedRequest, res) => {
    const [row] = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.ownerId, req.user!.sub), eq(subscriptions.ownerType, 'dealer')))
      .limit(1)
    res.json(row ? mapSubscription(row) : null)
  })
)

dealerRouter.get(
  '/payment-methods',
  asyncHandler(async (req: AuthedRequest, res) => {
    const rows = await db
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.userId, req.user!.sub))
    res.json(rows.map(mapPaymentMethod))
  })
)

dealerRouter.delete(
  '/payment-methods/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    await db
      .delete(paymentMethods)
      .where(and(eq(paymentMethods.id, req.params.id), eq(paymentMethods.userId, req.user!.sub)))
    res.status(204).end()
  })
)

dealerRouter.get(
  '/billing-history',
  asyncHandler(async (req: AuthedRequest, res) => {
    const rows = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.ownerId, req.user!.sub), eq(invoices.ownerType, 'dealer')))
      .orderBy(desc(invoices.date))
      .limit(500)
    res.json(
      rows.map((r) => ({
        ...mapInvoice(r),
        id: r.id,
        amount: Number(r.amount),
        status: r.status,
        date: String(r.date),
        description: r.description,
      }))
    )
  })
)

dealerRouter.get(
  '/settings',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    res.json({
      ...mapDealer(dealer),
      website: dealer.website ?? undefined,
      description: dealer.description ?? undefined,
      licenseNumber: dealer.licenseNumber ?? undefined,
      businessHours: dealer.businessHours,
      bankAccountName: dealer.bankAccountName ?? undefined,
      bankName: dealer.bankName ?? undefined,
      bankIban: dealer.bankIban ?? undefined,
      bankDetailsVerifiedAt: dealer.bankDetailsVerifiedAt?.toISOString() ?? undefined,
    })
  })
)

dealerRouter.patch(
  '/settings',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const u = req.body
    const patch: Record<string, unknown> = {}
    for (const key of [
      'name',
      'contactEmail',
      'contactPhone',
      'website',
      'address',
      'description',
      'licenseNumber',
      'businessHours',
      'logoUrl',
    ] as const) {
      if (u[key] !== undefined) patch[key] = u[key]
    }
    // Compare values, not mere presence: the settings form posts every field on
    // each save, so keying off `!== undefined` cleared bank verification (and
    // therefore payouts) whenever a dealer edited an unrelated business detail.
    const trimmed = (v: unknown) => (typeof v === 'string' ? v.trim() || null : null)
    const bankChanged =
      (u.bankAccountName !== undefined &&
        trimmed(u.bankAccountName) !== (dealer.bankAccountName ?? null)) ||
      (u.bankName !== undefined && trimmed(u.bankName) !== (dealer.bankName ?? null)) ||
      (u.bankIban !== undefined && trimmed(u.bankIban) !== (dealer.bankIban ?? null))
    if (u.bankAccountName !== undefined) patch.bankAccountName = trimmed(u.bankAccountName)
    if (u.bankName !== undefined) patch.bankName = trimmed(u.bankName)
    if (u.bankIban !== undefined) patch.bankIban = trimmed(u.bankIban)
    if (bankChanged) patch.bankDetailsVerifiedAt = null
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: 'No fields to update' })
      return
    }
    const [row] = await db
      .update(dealers)
      .set(patch as any)
      .where(eq(dealers.id, dealer.id))
      .returning()
    res.json({
      ...mapDealer(row),
      website: row.website ?? undefined,
      description: row.description ?? undefined,
      licenseNumber: row.licenseNumber ?? undefined,
      businessHours: row.businessHours,
      bankAccountName: row.bankAccountName ?? undefined,
      bankName: row.bankName ?? undefined,
      bankIban: row.bankIban ?? undefined,
      bankDetailsVerifiedAt: row.bankDetailsVerifiedAt?.toISOString() ?? undefined,
    })
  })
)

dealerRouter.get(
  '/maintenance',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const where = eq(maintenanceRecords.dealerId, dealer.id)
    const [totalRow] = await db.select({ value: count() }).from(maintenanceRecords).where(where)
    const reporter = profiles
    const rows = await db
      .select({
        record: maintenanceRecords,
        reporterName: reporter.name,
      })
      .from(maintenanceRecords)
      .leftJoin(reporter, eq(maintenanceRecords.reportedBy, reporter.id))
      .where(where)
      .orderBy(desc(maintenanceRecords.createdAt))
      .limit(limit)
      .offset(offset)
    res.json(
      paginated(
        rows.map(({ record, reporterName }) =>
          mapMaintenanceRecord({ ...record, reporterName: reporterName ?? undefined })
        ),
        Number(totalRow.value),
        page,
        pageSize
      )
    )
  })
)

dealerRouter.post(
  '/maintenance',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const { vehicleId, title, description, rentalId } = req.body as {
      vehicleId?: string
      title?: string
      description?: string
      rentalId?: string
    }
    if (!vehicleId || !title?.trim()) {
      res.status(400).json({ error: 'vehicleId and title are required' })
      return
    }
    const [vehicle] = await db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.id, vehicleId), eq(vehicles.dealerId, dealer.id)))
      .limit(1)
    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found' })
      return
    }
    // An unchecked rentalId would attach this record to another dealer’s rental.
    let linkedRentalId: string | null = null
    if (rentalId) {
      const [rental] = await db
        .select({ id: rentals.id })
        .from(rentals)
        .where(
          and(
            eq(rentals.id, rentalId),
            eq(rentals.dealerId, dealer.id),
            eq(rentals.vehicleId, vehicleId)
          )
        )
        .limit(1)
      if (!rental) {
        res.status(404).json({ error: 'Rental not found for this vehicle' })
        return
      }
      linkedRentalId = rental.id
    }
    const [row] = await db
      .insert(maintenanceRecords)
      .values({
        vehicleId,
        dealerId: dealer.id,
        rentalId: linkedRentalId,
        title: title.trim(),
        description: description ?? null,
        reportedBy: req.user!.sub,
        status: 'open',
        source: 'dealer',
        photos: [],
      })
      .returning()
    // Never overwrite ‘rented’: the rental still holds this vehicle, and
    // completing it only frees a vehicle still marked rented — so flipping it to
    // maintenance here would strand the car once the customer returns it.
    await db
      .update(vehicles)
      .set({ status: 'maintenance' })
      .where(and(eq(vehicles.id, vehicleId), ne(vehicles.status, 'rented')))
    res.status(201).json(mapMaintenanceRecord(row))
  })
)

dealerRouter.patch(
  '/maintenance/:id/accept',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const result = await acceptDealerMaintenanceRequest(dealer.id, req.params.id)
    res.status(result.status).json(result.body)
  })
)

dealerRouter.patch(
  '/maintenance/:id/schedule',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const body = parseBody(dealerScheduleMaintenanceSchema, req, res)
    if (!body) return
    const scheduledAt = new Date(body.scheduledAt)
    if (Number.isNaN(scheduledAt.getTime())) {
      res.status(400).json({ error: 'Invalid scheduledAt' })
      return
    }
    const result = await scheduleDealerMaintenanceRequest(dealer.id, req.params.id, scheduledAt)
    res.status(result.status).json(result.body)
  })
)

dealerRouter.patch(
  '/maintenance/:id/complete',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const result = await completeDealerMaintenanceRecord(dealer.id, req.params.id)
    res.status(result.status).json(result.body)
  })
)

dealerRouter.get(
  '/messages',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const folder = (req.query.folder as string | undefined) ?? 'inbox'
    const result = await listUserMessages(req.user!.sub, { folder, offset, limit })
    res.json(paginated(result.items, result.total, page, pageSize))
  })
)

dealerRouter.get(
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

dealerRouter.get(
  '/messages/threads',
  asyncHandler(async (req: AuthedRequest, res) => {
    const threads = await listMessageThreads(req.user!.sub)
    res.json(threads)
  })
)

dealerRouter.get(
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

dealerRouter.post(
  '/messages',
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parseBody(portalCreateMessageSchema, req, res)
    if (!body) return

    const dealer = await getDealerOrThrow(req.user!.sub)
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

    const allowed = await dealerCanMessageCustomer(dealer.id, body.toUserId)
    if (!allowed) {
      res.status(403).json({ error: 'No active rental or booking relationship with this customer' })
      return
    }
    if (body.rentalId && !(await assertRentalContext(body.rentalId, dealer.id, body.toUserId))) {
      res.status(403).json({ error: 'Rental does not match this customer' })
      return
    }
    if (
      body.bookingRequestId &&
      !(await assertBookingContext(body.bookingRequestId, dealer.id, body.toUserId))
    ) {
      res.status(403).json({ error: 'Booking request does not match this customer' })
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

dealerRouter.patch(
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

dealerRouter.patch(
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
      .set({ folder: body.folder })
      .where(eq(messages.id, req.params.id))
      .returning()
    res.json(mapMessage(row))
  })
)

import { dealerFeaturesRouter } from './dealerFeatures.js'
dealerRouter.use(dealerFeaturesRouter)
