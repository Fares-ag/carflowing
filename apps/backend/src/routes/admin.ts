import { Router } from 'express'
import { and, count, desc, eq, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  appSettings,
  bookingRequests,
  complaints,
  customerProfiles,
  dealers,
  messages,
  payments,
  plans,
  profiles,
  rentals,
  subscriptions,
  vehicles,
} from '../db/schema.js'
import { revokeAllRefreshSessions } from '../auth/sessions.js'
import { requestSkipCashRefund } from '../services/skipcash.js'
import {
  mapBookingRequest,
  mapComplaint,
  mapDealer,
  mapMessage,
  mapPayment,
  mapPlan,
  mapProfileToUser,
  mapRental,
  mapVehicle,
} from '../db/mappers.js'
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js'
import { asyncHandler, paginated, parsePagination } from '../utils/http.js'
import { transitionBookingRequest } from '../services/booking.js'
import { hashPassword } from '../auth/password.js'
import { sendDealerInviteEmail } from '../services/mail.js'
import crypto from 'crypto'

export const adminRouter = Router()
adminRouter.use(requireAuth, requireRole('admin'))

adminRouter.get(
  '/dashboard',
  asyncHandler(async (_req, res) => {
    const allPayments = await db.select().from(payments)
    const allRentals = await db.select().from(rentals)
    const [dealersCount] = await db.select({ value: count() }).from(dealers)
    const [usersCount] = await db
      .select({ value: count() })
      .from(profiles)
      .where(eq(profiles.role, 'customer'))
    const [vehiclesCount] = await db.select({ value: count() }).from(vehicles)
    const recent = await db
      .select({ rental: rentals, vehicle: vehicles, customer: profiles })
      .from(rentals)
      .leftJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
      .leftJoin(profiles, eq(rentals.customerId, profiles.id))
      .orderBy(desc(rentals.createdAt))
      .limit(5)

    const totalRevenue = allPayments.reduce((s, p) => s + Number(p.amount), 0)
    const now = new Date()
    const bucketsR: Record<string, number> = {}
    const bucketsP: Record<string, number> = {}
    for (let i = 3; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      bucketsR[key] = 0
      bucketsP[key] = 0
    }
    for (const r of allRentals) {
      const d = new Date(r.createdAt)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (key in bucketsR) bucketsR[key] += 1
    }
    for (const p of allPayments) {
      const d = new Date(p.createdAt)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (key in bucketsP) bucketsP[key] += Number(p.amount)
    }
    const today = now.toISOString().slice(0, 10)

    res.json({
      kpis: [
        { label: 'Total Revenue', value: totalRevenue },
        { label: 'Total Rentals', value: allRentals.length },
        { label: 'Total Vehicles', value: Number(vehiclesCount.value) },
        { label: 'Active Dealers', value: Number(dealersCount.value) },
        { label: 'Active Users', value: Number(usersCount.value) },
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
        active: allRentals.filter((r) => r.status === 'active').length,
        reserved: allRentals.filter((r) => r.status === 'reserved').length,
        completed: allRentals.filter((r) => r.status === 'completed').length,
        cancelled: allRentals.filter((r) => r.status === 'cancelled').length,
      },
      todayBookingsCount: allRentals.filter((r) => r.createdAt.toISOString().startsWith(today))
        .length,
    })
  })
)

adminRouter.get(
  '/customer-stats',
  asyncHandler(async (_req, res) => {
    const customers = await db.select().from(profiles).where(eq(profiles.role, 'customer'))
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    res.json({
      total: customers.length,
      active: customers.filter((c) => c.status === 'active').length,
      suspended: customers.filter((c) => c.status === 'suspended').length,
      newThisMonth: customers.filter((c) => c.createdAt >= startOfMonth).length,
    })
  })
)

adminRouter.get(
  '/analytics',
  asyncHandler(async (_req, res) => {
    const allRentals = await db.select().from(rentals)
    const allPayments = await db.select().from(payments)
    const allVehicles = await db.select().from(vehicles)
    const revenue = allPayments
      .filter((p) => p.status === 'completed')
      .reduce((s, p) => s + Number(p.amount), 0)
    const now = new Date()
    const bucketsR: Record<string, number> = {}
    const bucketsP: Record<string, number> = {}
    for (let i = 3; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      bucketsR[key] = 0
      bucketsP[key] = 0
    }
    for (const r of allRentals) {
      const d = new Date(r.createdAt)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (key in bucketsR) bucketsR[key] += 1
    }
    for (const p of allPayments) {
      const d = new Date(p.createdAt)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (key in bucketsP) bucketsP[key] += Number(p.amount)
    }
    const catMap: Record<string, number> = {}
    for (const v of allVehicles) catMap[v.category] = (catMap[v.category] || 0) + 1

    res.json({
      kpis: [
        { label: 'Total Revenue', value: revenue },
        { label: 'Total Rentals', value: allRentals.length },
        { label: 'Active Rentals', value: allRentals.filter((r) => r.status === 'active').length },
        { label: 'Vehicles', value: allVehicles.length },
      ],
      revenueTrend: Object.entries(bucketsP).map(([date, value]) => ({ date, value })),
      rentalsTrend: Object.entries(bucketsR).map(([date, value]) => ({ date, value })),
      categoryDistribution: Object.entries(catMap).map(([category, value]) => ({
        category,
        value,
      })),
      topVehicles: allVehicles.slice(0, 5).map((v) => ({ name: v.name, value: Number(v.pricePerDay) })),
    })
  })
)

adminRouter.get(
  '/vehicles',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const [totalRow] = await db.select({ value: count() }).from(vehicles)
    const rows = await db.select().from(vehicles).limit(limit).offset(offset)
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
  asyncHandler(async (req, res) => {
    const b = req.body
    const [row] = await db
      .insert(vehicles)
      .values({
        dealerId: b.dealerId,
        name: b.name,
        make: b.make,
        model: b.model,
        year: b.year,
        category: b.category,
        status: b.status || 'available',
        pricePerDay: String(b.pricePerDay ?? 0),
        mileage: b.mileage ?? 0,
        transmission: b.transmission,
        fuelType: b.fuelType,
        seats: b.seats ?? 4,
        imageUrl: b.imageUrl ?? null,
      })
      .returning()
    res.status(201).json(mapVehicle(row))
  })
)

adminRouter.delete(
  '/vehicles/:id',
  asyncHandler(async (req, res) => {
    await db.delete(vehicles).where(eq(vehicles.id, req.params.id))
    res.status(204).end()
  })
)

adminRouter.patch(
  '/vehicles/:id/status',
  asyncHandler(async (req, res) => {
    const [row] = await db
      .update(vehicles)
      .set({ status: req.body.status })
      .where(eq(vehicles.id, req.params.id))
      .returning()
    if (!row) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json(mapVehicle(row))
  })
)

adminRouter.get(
  '/customers',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const where = eq(profiles.role, 'customer')
    const [totalRow] = await db.select({ value: count() }).from(profiles).where(where)
    const rows = await db.select().from(profiles).where(where).limit(limit).offset(offset)
    res.json(paginated(rows.map(mapProfileToUser), Number(totalRow.value), page, pageSize))
  })
)

adminRouter.get(
  '/customers/with-stats',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const where = eq(profiles.role, 'customer')
    const [totalRow] = await db.select({ value: count() }).from(profiles).where(where)
    const rows = await db.select().from(profiles).where(where).limit(limit).offset(offset)
    const cps = await db.select().from(customerProfiles)
    const cpByUser = new Map(cps.map((c) => [c.userId, c]))
    const items = rows.map((u) => {
      const cp = cpByUser.get(u.id)
      return {
        ...mapProfileToUser(u),
        customerStatus: cp?.status ?? 'unverified',
        rentalsCount: cp?.rentalsCount ?? 0,
        totalSpent: Number(cp?.totalSpent ?? 0),
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
      res.json(null)
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
  asyncHandler(async (req, res) => {
    await db
      .update(profiles)
      .set({ status: req.body.status })
      .where(eq(profiles.id, req.params.userId))
    if (req.body.status === 'suspended') {
      await revokeAllRefreshSessions(req.params.userId)
    }
    res.json({ ok: true })
  })
)

adminRouter.patch(
  '/customers/:userId/profile',
  asyncHandler(async (req, res) => {
    const u = req.body
    const patch: Record<string, unknown> = {}
    if (u.name !== undefined) patch.name = u.name
    if (u.phone !== undefined) patch.phone = u.phone
    if (u.email !== undefined) patch.email = u.email
    await db.update(profiles).set(patch as any).where(eq(profiles.id, req.params.userId))
    res.json({ ok: true })
  })
)

adminRouter.patch(
  '/customers/:userId/verification',
  asyncHandler(async (req, res) => {
    const { status } = req.body
    const [existing] = await db
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, req.params.userId))
      .limit(1)
    if (existing) {
      await db
        .update(customerProfiles)
        .set({ status })
        .where(eq(customerProfiles.id, existing.id))
    } else {
      await db.insert(customerProfiles).values({ userId: req.params.userId, status })
    }
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

adminRouter.patch(
  '/rentals/:id/status',
  asyncHandler(async (req, res) => {
    const { status } = req.body as { status?: string }
    const [row] = await db
      .update(rentals)
      .set({ status: status as any })
      .where(eq(rentals.id, req.params.id))
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

adminRouter.get(
  '/dealers',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const [totalRow] = await db.select({ value: count() }).from(dealers)
    const rows = await db.select().from(dealers).limit(limit).offset(offset)
    res.json(paginated(rows.map(mapDealer), Number(totalRow.value), page, pageSize))
  })
)

adminRouter.post(
  '/dealers',
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
      if (profile.role === 'admin') {
        res.status(400).json({ error: 'Cannot convert an admin account into a dealer' })
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

    const [row] = await db
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

adminRouter.delete(
  '/dealers/:id',
  asyncHandler(async (req, res) => {
    const [dealer] = await db.select().from(dealers).where(eq(dealers.id, req.params.id)).limit(1)
    if (!dealer) {
      res.status(404).json({ error: 'Not found' })
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
    res.status(204).end()
  })
)

adminRouter.patch(
  '/dealers/:id/status',
  asyncHandler(async (req, res) => {
    const [row] = await db
      .update(dealers)
      .set({ status: req.body.status })
      .where(eq(dealers.id, req.params.id))
      .returning()
    if (!row) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    if (req.body.status === 'suspended') {
      await revokeAllRefreshSessions(row.ownerUserId)
    }
    res.json(mapDealer(row))
  })
)

adminRouter.get(
  '/payments/summary',
  asyncHandler(async (_req, res) => {
    const all = await db.select().from(payments)
    const completed = all.filter((p) => p.status === 'completed')
    const pending = all.filter((p) => p.status === 'pending')
    const refunded = all.filter((p) => p.status === 'refunded')
    const needsRefund = all.filter((p) => p.needsRefund)
    res.json({
      totalRevenue: completed.reduce((sum, p) => sum + Number(p.amount), 0),
      pendingCount: pending.length,
      completedCount: completed.length,
      refundedCount: refunded.length,
      refundTotal: refunded.reduce((sum, p) => sum + Number(p.amount), 0),
      needsRefundCount: needsRefund.length,
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

adminRouter.post(
  '/payments/:id/refund',
  asyncHandler(async (req, res) => {
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
      (payment.status === 'failed' && payment.provider === 'skipcash')
    if (!eligible) {
      res.status(400).json({ error: 'Payment is not eligible for refund' })
      return
    }

    let manualNote: string | undefined
    if (payment.provider === 'skipcash' && payment.externalTransactionId) {
      const result = await requestSkipCashRefund({
        externalPaymentId: payment.externalTransactionId,
        amount: Number(payment.amount),
      })
      if (!result.refunded) {
        manualNote = result.message
      }
    }

    const [updated] = await db
      .update(payments)
      .set({
        status: 'refunded',
        needsRefund: false,
        note: manualNote
          ? [payment.note, manualNote].filter(Boolean).join('\n')
          : payment.note,
      })
      .where(eq(payments.id, payment.id))
      .returning()
    res.json(mapPayment(updated))
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
  asyncHandler(async (req, res) => {
    const b = req.body
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
    res.status(201).json(mapPlan(row))
  })
)

adminRouter.patch(
  '/plans/:id',
  asyncHandler(async (req, res) => {
    const u = req.body
    const patch: Record<string, unknown> = {}
    if (u.name !== undefined) patch.name = u.name
    if (u.tier !== undefined) patch.tier = u.tier
    if (u.status !== undefined) patch.status = u.status
    if (u.priceMonthly !== undefined) patch.priceMonthly = String(u.priceMonthly)
    if (u.priceYearly !== undefined) patch.priceYearly = String(u.priceYearly)
    if (u.features !== undefined) patch.features = u.features
    const [row] = await db
      .update(plans)
      .set(patch as any)
      .where(eq(plans.id, req.params.id))
      .returning()
    if (!row) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json(mapPlan(row))
  })
)

adminRouter.delete(
  '/plans/:id',
  asyncHandler(async (req, res) => {
    await db.delete(plans).where(eq(plans.id, req.params.id))
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
  asyncHandler(async (req, res) => {
    const [row] = await db
      .update(complaints)
      .set({ status: req.body.status })
      .where(eq(complaints.id, req.params.id))
      .returning()
    if (!row) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json(mapComplaint(row))
  })
)

adminRouter.get(
  '/messages',
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

adminRouter.post(
  '/messages',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { toUserId, subject, body } = req.body
    const [row] = await db
      .insert(messages)
      .values({
        fromUserId: req.user!.sub,
        toUserId,
        subject,
        body,
        folder: 'sent',
      })
      .returning()
    // also inbox copy for recipient
    await db.insert(messages).values({
      fromUserId: req.user!.sub,
      toUserId,
      subject,
      body,
      folder: 'inbox',
    })
    const [fromUser] = await db.select().from(profiles).where(eq(profiles.id, req.user!.sub)).limit(1)
    res.status(201).json({
      ...mapMessage(row),
      fromName: fromUser?.name,
      fromEmail: fromUser?.email,
    })
  })
)

adminRouter.patch(
  '/messages/:id/read',
  asyncHandler(async (req, res) => {
    const [row] = await db
      .update(messages)
      .set({ read: !!req.body.read })
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
  asyncHandler(async (req, res) => {
    const [row] = await db
      .update(messages)
      .set({ folder: req.body.folder })
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
  asyncHandler(async (req, res) => {
    const { status, declineReason } = req.body as { status?: string; declineReason?: string }
    if (status !== 'approved' && status !== 'declined') {
      res.status(400).json({ error: 'status must be approved or declined' })
      return
    }
    const result = await transitionBookingRequest({ bookingRequestId: req.params.id, status, declineReason })
    res.status(result.status).json(result.body)
  })
)

adminRouter.delete(
  '/booking-requests/:id',
  asyncHandler(async (req, res) => {
    await db.delete(bookingRequests).where(eq(bookingRequests.id, req.params.id))
    res.status(204).end()
  })
)

adminRouter.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    let [row] = await db.select().from(appSettings).limit(1)
    if (!row) {
      ;[row] = await db.insert(appSettings).values({}).returning()
    }
    res.json({
      id: row.id,
      companyName: row.companyName,
      supportEmail: row.supportEmail,
      supportPhone: row.supportPhone ?? undefined,
      defaultTaxRate: Number(row.defaultTaxRate),
      updatedAt: row.updatedAt.toISOString(),
    })
  })
)

adminRouter.patch(
  '/settings',
  asyncHandler(async (req, res) => {
    let [existing] = await db.select().from(appSettings).limit(1)
    if (!existing) {
      ;[existing] = await db.insert(appSettings).values({}).returning()
    }
    const u = req.body
    if (u.defaultTaxRate !== undefined) {
      const rate = Number(u.defaultTaxRate)
      if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
        res.status(400).json({ error: 'defaultTaxRate must be a number between 0 and 1' })
        return
      }
    }
    const [row] = await db
      .update(appSettings)
      .set({
        ...(u.companyName !== undefined ? { companyName: u.companyName } : {}),
        ...(u.supportEmail !== undefined ? { supportEmail: u.supportEmail } : {}),
        ...(u.supportPhone !== undefined ? { supportPhone: u.supportPhone } : {}),
        ...(u.defaultTaxRate !== undefined ? { defaultTaxRate: String(u.defaultTaxRate) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(appSettings.id, existing.id))
      .returning()
    res.json({
      id: row.id,
      companyName: row.companyName,
      supportEmail: row.supportEmail,
      supportPhone: row.supportPhone ?? undefined,
      defaultTaxRate: Number(row.defaultTaxRate),
      updatedAt: row.updatedAt.toISOString(),
    })
  })
)

void sql
