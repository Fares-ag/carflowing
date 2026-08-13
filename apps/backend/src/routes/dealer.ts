import { Router } from 'express'
import { and, count, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  bookingRequests,
  customerProfiles,
  dealers,
  invoices,
  leads,
  notifications,
  paymentMethods,
  payments,
  profiles,
  rentals,
  subscriptions,
  vehicles,
} from '../db/schema.js'
import {
  mapBookingRequest,
  mapDealer,
  mapInvoice,
  mapLead,
  mapNotification,
  mapPayment,
  mapPaymentMethod,
  mapSubscription,
  mapVehicle,
} from '../db/mappers.js'
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js'
import { asyncHandler, paginated, parsePagination } from '../utils/http.js'
import { transitionBookingRequest } from '../services/booking.js'
import { dealerCanAccessCustomerDocuments } from '../services/documentAccess.js'

export const dealerRouter = Router()
dealerRouter.use(requireAuth, requireRole('dealer'))

async function getDealerOrThrow(userId: string) {
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
    const inventory = await db.select().from(vehicles).where(eq(vehicles.dealerId, dealer.id))
    const allRentals = await db.select().from(rentals).where(eq(rentals.dealerId, dealer.id))
    const allPayments = await db.select().from(payments).where(eq(payments.dealerId, dealer.id))
    const [leadsCount] = await db
      .select({ value: count() })
      .from(leads)
      .where(eq(leads.dealerId, dealer.id))
    const recent = await db
      .select({
        rental: rentals,
        vehicle: vehicles,
      })
      .from(rentals)
      .leftJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
      .where(eq(rentals.dealerId, dealer.id))
      .orderBy(desc(rentals.createdAt))
      .limit(5)

    const totalRevenue = allPayments.reduce((s, p) => s + Number(p.amount), 0)
    const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const now = new Date()
    const buckets: Record<string, number> = {}
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      buckets[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`] = 0
    }
    for (const p of allPayments) {
      const d = new Date(p.createdAt)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (key in buckets) buckets[key] += Number(p.amount)
    }

    res.json({
      kpis: [
        { label: 'Total Revenue', value: totalRevenue },
        { label: 'Total Rentals', value: allRentals.length },
        { label: 'Active Vehicles', value: inventory.length },
        { label: 'Active Leads', value: Number(leadsCount.value) },
      ],
      revenueTrend: allPayments.map((p) => ({
        date: p.createdAt.toISOString(),
        value: Number(p.amount),
      })),
      bookingTrend: allRentals.map((r) => ({
        date: r.createdAt.toISOString(),
        value: 1,
      })),
      revenueChartData: Object.entries(buckets).map(([key, revenue]) => {
        const [, m] = key.split('-')
        return { month: `${MONTH[parseInt(m, 10) - 1]} ${key.slice(0, 4)}`, revenue }
      }),
      recentRentals: recent.map((r) => ({
        id: r.rental.id,
        customerName: 'Customer',
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
    const allRentals = await db.select().from(rentals).where(eq(rentals.dealerId, dealer.id))
    const inventory = await db.select().from(vehicles).where(eq(vehicles.dealerId, dealer.id))
    const allPayments = await db.select().from(payments).where(eq(payments.dealerId, dealer.id))
    const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const totalRevenue = allPayments.reduce((s, p) => s + Number(p.amount), 0)
    const activeBookings = allRentals.filter((r) => r.status === 'active' || r.status === 'reserved').length
    const now = new Date()
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const uniqueCustomersThisMonth = new Set(
      allRentals
        .filter((r) => r.createdAt.toISOString().startsWith(thisMonth))
        .map((r) => r.customerId)
    ).size
    const rentedCount = allRentals.filter((r) => r.status === 'active').length
    const fleetUtilization =
      inventory.length > 0 ? Math.round((rentedCount / inventory.length) * 100) : 0

    res.json({
      totalRevenue,
      activeBookings,
      newCustomersThisMonth: uniqueCustomersThisMonth,
      fleetUtilization,
      revenueTrend: allPayments.map((p) => {
        const d = new Date(p.createdAt)
        const amount = Number(p.amount)
        return {
          month: `${MONTH[d.getMonth()]} ${d.getFullYear()}`,
          revenue: amount,
          profit: Math.round(amount * 0.2),
          createdAt: p.createdAt.toISOString(),
        }
      }),
      customerDemographics: [],
      revenueBooking: allRentals.map((r) => ({
        month: r.createdAt.toISOString(),
        revenue: 0,
        bookings: 1,
      })),
      bookingTime: [],
      utilization: inventory.map((v) => ({
        category: v.category,
        utilization: fleetUtilization,
      })),
    })
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
    const body = req.body
    const [row] = await db
      .insert(vehicles)
      .values({
        dealerId: dealer.id,
        name: body.name,
        make: body.make,
        model: body.model,
        year: body.year,
        category: body.category,
        status: body.status || 'available',
        pricePerDay: String(body.pricePerDay ?? body.price_per_day ?? 0),
        mileage: body.mileage ?? 0,
        transmission: body.transmission,
        fuelType: body.fuelType ?? body.fuel_type,
        seats: body.seats ?? 4,
        imageUrl: body.imageUrl ?? body.image_url ?? null,
        color: body.color ?? null,
        licensePlate: body.licensePlate ?? body.license_plate ?? null,
      })
      .returning()
    await db
      .update(dealers)
      .set({ vehiclesCount: dealer.vehiclesCount + 1 })
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
    if (u.status !== undefined) patch.status = u.status
    if (u.pricePerDay !== undefined) patch.pricePerDay = String(u.pricePerDay)
    if (u.mileage !== undefined) patch.mileage = u.mileage
    if (u.transmission !== undefined) patch.transmission = u.transmission
    if (u.fuelType !== undefined) patch.fuelType = u.fuelType
    if (u.seats !== undefined) patch.seats = u.seats
    if (u.imageUrl !== undefined) patch.imageUrl = u.imageUrl
    if (u.color !== undefined) patch.color = u.color
    if (u.licensePlate !== undefined) patch.licensePlate = u.licensePlate
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

dealerRouter.patch(
  '/vehicles/:id/status',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const { status } = req.body
    const [row] = await db
      .update(vehicles)
      .set({ status })
      .where(and(eq(vehicles.id, req.params.id), eq(vehicles.dealerId, dealer.id)))
      .returning()
    if (!row) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json(mapVehicle(row))
  })
)

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
          inArray(rentals.status, ['reserved', 'active'])
        )
      )
      .limit(1)
    if (activeRental) {
      res.status(409).json({ error: 'Cannot delete a vehicle with an active or reserved rental' })
      return
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
      .set({ vehiclesCount: Math.max(0, dealer.vehiclesCount - 1) })
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
    const where = inArray(bookingRequests.vehicleId, ids)
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
    })
    res.status(result.status).json(result.body)
  })
)

dealerRouter.post(
  '/payments/offline',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const { rentalId, customerId, amount, method } = req.body
    const methodType =
      method === 'bank' || method === 'wallet' || method === 'card' ? method : 'card'

    const result = await db.transaction(async (tx) => {
      if (rentalId) {
        const [rental] = await tx
          .select()
          .from(rentals)
          .where(and(eq(rentals.id, rentalId), eq(rentals.dealerId, dealer.id)))
          .for('update')
          .limit(1)
        if (!rental) {
          return { status: 404 as const, body: { error: 'Rental not found' } }
        }
        if (rental.paymentStatus === 'completed') {
          const [existing] = await tx
            .select()
            .from(payments)
            .where(and(eq(payments.rentalId, rentalId), eq(payments.status, 'completed')))
            .orderBy(desc(payments.createdAt))
            .limit(1)
          if (existing) {
            return { status: 200 as const, body: mapPayment(existing) }
          }
        }
        const [row] = await tx
          .insert(payments)
          .values({
            rentalId,
            customerId: customerId || null,
            dealerId: dealer.id,
            amount: String(amount ?? 0),
            status: 'completed',
            type: 'rental',
            method: methodType,
          })
          .returning()
        await tx
          .update(rentals)
          .set({ paymentStatus: 'completed', status: 'active' })
          .where(eq(rentals.id, rentalId))
        return { status: 201 as const, body: mapPayment(row) }
      }

      const [row] = await tx
        .insert(payments)
        .values({
          rentalId: null,
          customerId: customerId || null,
          dealerId: dealer.id,
          amount: String(amount ?? 0),
          status: 'completed',
          type: 'rental',
          method: methodType,
        })
        .returning()
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
      taxId: dealer.taxId ?? undefined,
      businessHours: dealer.businessHours,
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
      'taxId',
      'businessHours',
      'logoUrl',
    ] as const) {
      if (u[key] !== undefined) patch[key] = u[key]
    }
    const [row] = await db
      .update(dealers)
      .set(patch as any)
      .where(eq(dealers.id, dealer.id))
      .returning()
    res.json(mapDealer(row))
  })
)
