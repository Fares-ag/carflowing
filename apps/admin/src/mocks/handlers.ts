import type {
  ComplaintStatus,
  KpiMetric,
  Payment,
  Plan,
  Rental,
  RentalEvent,
  RentalStatus,
  TimeSeriesPoint,
  User,
  UserStatus,
  VehicleStatus,
} from '@carflow/shared'
import { createId, getDb, paginate, updateDb, withLatency } from '@carflow/shared'
import { http, HttpResponse } from 'msw'
import type {
  AdminDashboardData,
  AdminAnalyticsData,
  AuditLogEntry,
} from '../services/adminService'

const parseListParams = (request: Request) => {
  const url = new URL(request.url)
  const page = Number(url.searchParams.get('page') ?? '1')
  const pageSize = Number(url.searchParams.get('pageSize') ?? '10')
  return { page, pageSize }
}

/** Legal rental transitions — mirrors the backend lifecycle service. */
const RENTAL_TRANSITIONS: Record<RentalStatus, RentalStatus[]> = {
  reserved: ['active', 'cancelled'],
  active: ['past_due', 'paused', 'completed', 'cancelled'],
  paused: ['active', 'completed', 'cancelled'],
  past_due: ['active', 'completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

/** In-memory audit trail for mock mode (not persisted across reloads). */
let auditSeq = 2
const mockPromoCodes: {
  id: string
  code: string
  discountType: 'percent' | 'fixed'
  discountValue: number
  minTermMonths: number
  maxUses: number | null
  usedCount: number
  remainingUses: number | null
  perCustomerLimit: number
  firstInvoiceOnly: boolean
  validFrom: string | null
  validUntil: string | null
  active: boolean
  createdAt: string
}[] = []
const auditLogs: AuditLogEntry[] = [
  {
    id: 'audit_2',
    actorId: 'user_admin_1',
    actorRole: 'admin',
    actorName: 'Admin',
    action: 'rental.status_change',
    entityType: 'rental',
    entityId: 'rental_1',
    before: { status: 'reserved' },
    after: { status: 'active' },
    note: 'Vehicle handed over at pickup',
    createdAt: '2026-01-10T09:00:00.000Z',
  },
  {
    id: 'audit_1',
    actorId: 'user_admin_1',
    actorRole: 'admin',
    actorName: 'Admin',
    action: 'vehicle.create',
    entityType: 'vehicle',
    entityId: 'veh_1',
    after: { name: 'Tesla Model 3' },
    createdAt: '2026-01-02T12:00:00.000Z',
  },
]

const pushAudit = (entry: {
  action: string
  entityType: string
  entityId?: string
  before?: unknown
  after?: unknown
  note?: string
}) => {
  const admin = getDb().users.find((u) => u.role === 'admin')
  auditLogs.unshift({
    id: `audit_${++auditSeq}`,
    actorId: admin?.id,
    actorRole: 'admin',
    actorName: admin?.name ?? 'Admin',
    actorEmail: admin?.email,
    createdAt: new Date().toISOString(),
    ...entry,
  })
}

const mockRentalEvents: RentalEvent[] = [
  {
    id: 'evt_1',
    rentalId: 'rental_1',
    type: 'pickup',
    mileage: 8000,
    fuelLevel: 'full',
    conditionNotes: 'No damage at handover',
    photos: [],
    recordedBy: 'user_admin_1',
    createdAt: '2026-01-10T09:00:00.000Z',
  },
]

const buildAdminDashboard = (): AdminDashboardData => {
  const db = getDb()
  const totalRevenue = db.payments.reduce((sum, payment) => sum + payment.amount, 0)
  const kpis: KpiMetric[] = [
    { label: 'Total Revenue', value: totalRevenue },
    { label: 'Total Rentals', value: db.rentals.length },
    { label: 'Total Vehicles', value: db.vehicles.length },
    { label: 'Active Dealers', value: db.dealers.length },
    { label: 'Active Users', value: db.users.length },
  ]

  const rentalsTrend: TimeSeriesPoint[] = [
    { date: '2025-10', value: 24 },
    { date: '2025-11', value: 32 },
    { date: '2025-12', value: 41 },
    { date: '2026-01', value: 28 },
  ]

  const revenueTrend: TimeSeriesPoint[] = [
    { date: '2025-10', value: 6400 },
    { date: '2025-11', value: 8600 },
    { date: '2025-12', value: 12300 },
    { date: '2026-01', value: 7100 },
  ]

  const recentRentals = db.rentals.slice(0, 5).map((rental) => {
    const vehicle = db.vehicles.find((v) => v.id === rental.vehicleId)
    const customer = db.users.find((u) => u.id === rental.customerId)
    return {
      ...rental,
      customerName: customer?.name ?? null,
      customerEmail: customer?.email ?? null,
      vehicleName: vehicle?.name ?? null,
      vehicleYear: vehicle?.year ?? null,
    }
  })
  const bookingStatusCounts = {
    active: db.rentals.filter((r) => r.status === 'active').length,
    reserved: db.rentals.filter((r) => r.status === 'reserved').length,
    completed: db.rentals.filter((r) => r.status === 'completed').length,
    cancelled: db.rentals.filter((r) => r.status === 'cancelled').length,
  }
  const today = new Date().toISOString().slice(0, 10)
  const todayBookingsCount = db.rentals.filter((r) => {
    const created = (r as { createdAt?: string; created_at?: string }).createdAt ?? (r as { createdAt?: string; created_at?: string }).created_at ?? ''
    return String(created).startsWith(today)
  }).length
  return {
    kpis,
    rentalsTrend,
    revenueTrend,
    recentRentals,
    bookingStatusCounts,
    todayBookingsCount,
  }
}

const buildAdminAnalytics = (): AdminAnalyticsData => {
  const db = getDb()
  const completed = db.payments.filter((p) => p.status === 'completed')
  const revenue = completed.reduce((sum, p) => sum + p.amount, 0)
  return {
    kpis: [
      { label: 'Total Revenue', value: revenue },
      { label: 'Total Rentals', value: db.rentals.length },
      { label: 'Active Rentals', value: db.rentals.filter((r) => r.status === 'active').length },
      { label: 'Vehicles', value: db.vehicles.length },
    ],
  revenueTrend: [
    { date: 'Sep', value: 42000 },
    { date: 'Oct', value: 51000 },
    { date: 'Nov', value: 63000 },
    { date: 'Dec', value: 72000 },
    { date: 'Jan', value: 65000 },
  ],
  rentalsTrend: [
    { date: 'Sep', value: 180 },
    { date: 'Oct', value: 210 },
    { date: 'Nov', value: 260 },
    { date: 'Dec', value: 310 },
    { date: 'Jan', value: 280 },
  ],
  categoryDistribution: [
    { category: 'SUV', value: 38 },
    { category: 'Sedan', value: 27 },
    { category: 'Luxury', value: 22 },
    { category: 'EV', value: 13 },
  ],
  topVehicles: [
    { name: 'Tesla Model 3', value: 420 },
    { name: 'BMW X5', value: 360 },
    { name: 'Mercedes GLC', value: 310 },
  ],
  }
}

export const handlers = [
  http.get('/api/auth/me', async () => {
    const user = getDb().users.find((u) => u.role === 'admin') ?? getDb().users[0]
    return HttpResponse.json(
      await withLatency({
        userId: user.id,
        role: user.role,
        name: user.name,
        email: user.email,
        email_confirmed_at: new Date().toISOString(),
        user,
      })
    )
  }),
  http.post('/api/auth/login', async ({ request }) => {
    const payload = (await request.json()) as {
      email?: string
      password?: string
      expectedRole?: string
      role?: string
    }
    const db = getDb()
    const role = payload.expectedRole ?? payload.role ?? 'admin'
    if (role !== 'admin') {
      return HttpResponse.json({ message: 'Not authorized for admin access' }, { status: 403 })
    }
    const user =
      db.users.find((candidate) => candidate.email === payload.email && candidate.role === 'admin') ??
      db.users.find((candidate) => candidate.role === 'admin')
    if (!user || payload.password !== 'password123') {
      return HttpResponse.json({ message: 'Invalid credentials' }, { status: 401 })
    }
    return HttpResponse.json(
      await withLatency({
        userId: user.id,
        role: user.role,
        name: user.name,
        email: user.email,
      })
    )
  }),
  http.post('/api/auth/logout', async () => HttpResponse.json(await withLatency({ ok: true }))),

  // Role-agnostic account security router (backend: src/auth/securityRouter.ts).
  http.get('/api/auth/security', async () =>
    HttpResponse.json(
      await withLatency({
        totpEnabled: false,
        totpRequired: false,
        smsVerified: false,
        smsPhone: null,
        smsVerificationAvailable: false,
        smsProviderConfigured: false,
        smsDevFallback: true,
      })
    )
  ),
  http.post('/api/auth/security/2fa/setup', async () =>
    HttpResponse.json(
      await withLatency({
        secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
        uri: 'otpauth://totp/CarFlow%3Aadmin%40carflow.dev?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=CarFlow&digits=6&period=30',
      })
    )
  ),
  http.post('/api/auth/security/2fa/enable', async () =>
    HttpResponse.json(await withLatency({ ok: true }))
  ),
  http.post('/api/auth/security/2fa/disable', async () =>
    HttpResponse.json(await withLatency({ ok: true }))
  ),

  http.get('/api/admin/dashboard', async () =>
    HttpResponse.json(await withLatency(buildAdminDashboard()))
  ),
  http.get('/api/admin/customer-stats', async () => {
    const customers = getDb().users.filter((u) => u.role === 'customer')
    return HttpResponse.json(
      await withLatency({
        total: customers.length,
        active: customers.filter((u) => u.status !== 'suspended').length,
        suspended: customers.filter((u) => u.status === 'suspended').length,
        newThisMonth: 2,
      })
    )
  }),
  http.get('/api/admin/analytics', async () =>
    HttpResponse.json(await withLatency(buildAdminAnalytics()))
  ),
  http.get('/api/admin/vehicles', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    const data = paginate(getDb().vehicles, page, pageSize)
    return HttpResponse.json(await withLatency(data))
  }),
  http.get('/api/admin/vehicles/:id', async ({ params }) => {
    const vehicle = getDb().vehicles.find((v) => v.id === String(params.id))
    if (!vehicle) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    return HttpResponse.json(await withLatency(vehicle))
  }),
  http.post('/api/admin/vehicles', async ({ request }) => {
    const payload = (await request.json()) as Record<string, unknown>
    const vehicle = { ...payload, id: createId('veh') }
    updateDb((db) => ({ ...db, vehicles: [vehicle as any, ...db.vehicles] }))
    return HttpResponse.json(await withLatency(vehicle), { status: 201 })
  }),
  http.delete('/api/admin/vehicles/:id', async ({ params }) => {
    const id = String(params.id)
    if (getDb().rentals.some((r) => r.vehicleId === id)) {
      return HttpResponse.json(
        {
          error:
            'This vehicle has rental history and cannot be deleted. Set its status to "inactive" to retire it.',
        },
        { status: 409 }
      )
    }
    updateDb((db) => ({ ...db, vehicles: db.vehicles.filter((v) => v.id !== id) }))
    return new HttpResponse(null, { status: 204 })
  }),
  http.get('/api/admin/customers', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    const customers = getDb().users.filter(user => user.role === 'customer')
    return HttpResponse.json(await withLatency(paginate(customers, page, pageSize)))
  }),
  http.get('/api/admin/customers/with-stats', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    const customers = getDb()
      .users.filter((u) => u.role === 'customer')
      .map((u) => ({
        ...u,
        rentalsCount: getDb().rentals.filter((r) => r.customerId === u.id).length,
        totalSpent: 0,
        verification: 'verified' as const,
        customerStatus: 'verified',
        accountStatus: u.status ?? 'active',
      }))
    return HttpResponse.json(await withLatency(paginate(customers, page, pageSize)))
  }),
  http.get('/api/admin/customers/:userId', async ({ params }) => {
    const user = getDb().users.find((u) => u.id === String(params.userId))
    if (!user) return HttpResponse.json(await withLatency(null))
    return HttpResponse.json(await withLatency(user))
  }),
  http.patch('/api/admin/customers/:userId/status', async ({ params, request }) => {
    const { status } = (await request.json()) as { status: UserStatus }
    const id = String(params.userId)
    let updated: User | null = null
    updateDb((db) => {
      const users = db.users.map((u) => {
        if (u.id !== id) return u
        updated = { ...u, status }
        return updated
      })
      return { ...db, users }
    })
    if (!updated) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    return HttpResponse.json(await withLatency(updated))
  }),
  http.patch('/api/admin/customers/:userId/profile', async ({ params, request }) => {
    const updates = (await request.json()) as Partial<User>
    const id = String(params.userId)
    let updated: User | null = null
    updateDb((db) => {
      const users = db.users.map((u) => {
        if (u.id !== id) return u
        updated = { ...u, ...updates }
        return updated
      })
      return { ...db, users }
    })
    if (!updated) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    return HttpResponse.json(await withLatency(updated))
  }),
  http.patch('/api/admin/customers/:userId/verification', async ({ params, request }) => {
    const body = await request.json()
    return HttpResponse.json(await withLatency({ userId: String(params.userId), ...body as object }))
  }),
  http.get('/api/admin/rentals', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    return HttpResponse.json(await withLatency(paginate(getDb().rentals, page, pageSize)))
  }),
  http.get('/api/admin/rentals/details', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    const db = getDb()
    const items = db.rentals.map((rental) => ({
      ...rental,
      vehicle: db.vehicles.find((v) => v.id === rental.vehicleId),
      customer: db.users.find((u) => u.id === rental.customerId),
      dealer: db.dealers.find((d) => d.id === rental.dealerId),
    }))
    return HttpResponse.json(await withLatency(paginate(items, page, pageSize)))
  }),
  http.get('/api/admin/rentals/:id/full', async ({ params }) => {
    const id = String(params.id)
    const db = getDb()
    const rental = db.rentals.find((r) => r.id === id)
    if (!rental) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    const dealer = db.dealers.find((d) => d.id === rental.dealerId)
    return HttpResponse.json(
      await withLatency({
        ...rental,
        vehicle: db.vehicles.find((v) => v.id === rental.vehicleId),
        customer: db.users.find((u) => u.id === rental.customerId),
        dealer: dealer ? { id: dealer.id, name: dealer.name } : undefined,
        events: mockRentalEvents.filter((e) => e.rentalId === id),
        invoices: db.invoices.filter((i) => i.rentalId === id),
        payments: db.payments.filter((p) => p.rentalId === id),
        auditTrail: auditLogs.filter((a) => a.entityType === 'rental' && a.entityId === id),
      })
    )
  }),
  http.post('/api/admin/rentals/:id/cancel', async ({ params, request }) => {
    const id = String(params.id)
    const body = ((await request.json().catch(() => ({}))) ?? {}) as { reason?: string }
    const existing = getDb().rentals.find((r) => r.id === id)
    if (!existing) return HttpResponse.json({ error: 'Rental not found' }, { status: 404 })
    if (existing.status === 'completed' || existing.status === 'cancelled') {
      return HttpResponse.json(
        { error: `Rental is already ${existing.status}` },
        { status: 409 }
      )
    }
    const now = new Date()
    let updated: Rental | null = null
    updateDb((db) => ({
      ...db,
      rentals: db.rentals.map((rental) => {
        if (rental.id !== id) return rental
        updated = {
          ...rental,
          status: 'cancelled',
          cancelRequestedAt: now.toISOString(),
          cancellationEffectiveDate: now.toISOString().slice(0, 10),
          cancelReason: body.reason,
          nextBillingDate: undefined,
        }
        return updated
      }),
      // Cancelling frees the vehicle and voids open invoices.
      vehicles: db.vehicles.map((v) =>
        v.id === existing.vehicleId ? { ...v, status: 'available' as VehicleStatus } : v
      ),
      invoices: db.invoices.map((i) =>
        i.rentalId === id && (i.status === 'due' || i.status === 'overdue')
          ? { ...i, status: 'void' as const }
          : i
      ),
    }))
    pushAudit({
      action: 'rental.cancel',
      entityType: 'rental',
      entityId: id,
      before: { status: existing.status },
      after: { status: 'cancelled' },
      note: body.reason,
    })
    return HttpResponse.json(await withLatency(updated))
  }),
  http.get('/api/admin/dealers', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    return HttpResponse.json(await withLatency(paginate(getDb().dealers, page, pageSize)))
  }),
  http.post('/api/admin/dealers', async ({ request }) => {
    const payload = (await request.json()) as Record<string, unknown>
    const dealer = { ...payload, id: createId('dealer'), createdAt: new Date().toISOString() }
    updateDb((db) => ({ ...db, dealers: [dealer as any, ...db.dealers] }))
    return HttpResponse.json(await withLatency(dealer), { status: 201 })
  }),
  http.delete('/api/admin/dealers/:id', async ({ params }) => {
    const id = String(params.id)
    if (getDb().rentals.some((r) => r.dealerId === id)) {
      return HttpResponse.json(
        {
          error:
            'This dealer has rental history and cannot be deleted. Suspend the dealer instead to take them off the platform.',
        },
        { status: 409 }
      )
    }
    updateDb((db) => ({ ...db, dealers: db.dealers.filter((d) => d.id !== id) }))
    return new HttpResponse(null, { status: 204 })
  }),
  http.get('/api/admin/payments', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    return HttpResponse.json(await withLatency(paginate(getDb().payments, page, pageSize)))
  }),
  http.get('/api/admin/payments/details', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    const db = getDb()
    const items = db.payments.map((payment) => ({
      ...payment,
      customer: db.users.find((u) => u.id === payment.customerId),
    }))
    return HttpResponse.json(await withLatency(paginate(items, page, pageSize)))
  }),
  http.get('/api/admin/payments/summary', async () => {
    const db = getDb()
    const charges = db.payments.filter((p) => p.type !== 'refund')
    const completed = charges.filter((p) => p.status === 'completed' || p.status === 'refunded')
    const pending = charges.filter((p) => p.status === 'pending')
    const refunded = charges.filter((p) => p.status === 'refunded')
    const refundTotal = charges.reduce((sum, p) => sum + (p.refundedAmount ?? 0), 0)
    const grossRevenue = completed.reduce((sum, p) => sum + p.amount, 0)
    const stuckCutoff = Date.now() - 30 * 60 * 1000
    return HttpResponse.json(
      await withLatency({
        totalRevenue: grossRevenue - refundTotal,
        grossRevenue,
        pendingCount: pending.length,
        completedCount: completed.length,
        refundedCount: refunded.length,
        refundTotal,
        needsRefundCount: charges.filter((p) => p.needsRefund).length,
        stuckPendingCount: pending.filter(
          (p) => new Date(p.createdAt).getTime() < stuckCutoff
        ).length,
        overdueInvoicesCount: db.invoices.filter((i) => i.status === 'overdue').length,
      })
    )
  }),
  http.post('/api/admin/payments/:id/refund', async ({ params, request }) => {
    const id = String(params.id)
    const body = ((await request.json().catch(() => ({}))) ?? {}) as {
      amount?: number
      manualConfirmed?: boolean
    }
    const payment = getDb().payments.find((p) => p.id === id)
    if (!payment) return HttpResponse.json({ error: 'Payment not found' }, { status: 404 })
    if (payment.status === 'refunded') {
      return HttpResponse.json({ error: 'Payment already refunded' }, { status: 409 })
    }
    const eligible =
      payment.needsRefund ||
      payment.status === 'completed' ||
      (payment.status === 'failed' && payment.provider === 'skipcash')
    if (!eligible) {
      return HttpResponse.json({ error: 'Payment is not eligible for refund' }, { status: 400 })
    }
    const alreadyRefunded = payment.refundedAmount ?? 0
    const remaining = Math.max(0, payment.amount - alreadyRefunded)
    const requested = body.amount === undefined ? remaining : Number(body.amount)
    if (!Number.isFinite(requested) || requested <= 0 || requested > remaining + 0.001) {
      return HttpResponse.json(
        { error: `Refund amount must be between 0 and the remaining ${remaining.toFixed(2)}` },
        { status: 400 }
      )
    }
    // Provider refunds only work for SkipCash payments with a gateway
    // transaction id; everything else needs an explicit manual confirmation.
    const providerRefundPossible =
      payment.provider === 'skipcash' && Boolean(payment.externalTransactionId)
    if (!providerRefundPossible && body.manualConfirmed !== true) {
      return HttpResponse.json(
        {
          error:
            'Automatic refund is not available. Process it manually (SkipCash dashboard or cash), then retry with manualConfirmed: true.',
          requiresManualConfirmation: true,
        },
        { status: 409 }
      )
    }
    const newRefunded = alreadyRefunded + requested
    const fullyRefunded = newRefunded >= payment.amount - 0.001
    const refundRow: Payment = {
      id: createId('pay'),
      rentalId: payment.rentalId,
      customerId: payment.customerId,
      dealerId: payment.dealerId,
      amount: requested,
      status: 'completed',
      type: 'refund',
      method: payment.method,
      provider: providerRefundPossible ? 'skipcash' : 'manual',
      refundOfPaymentId: payment.id,
      note: providerRefundPossible ? 'Refunded via SkipCash' : 'Manual refund confirmed by admin',
      createdAt: new Date().toISOString(),
    }
    let updated: Payment | null = null
    updateDb((db) => ({
      ...db,
      payments: [
        refundRow,
        ...db.payments.map((p) => {
          if (p.id !== id) return p
          updated = {
            ...p,
            refundedAmount: newRefunded,
            status: fullyRefunded ? 'refunded' : p.status,
            needsRefund: false,
          }
          return updated
        }),
      ],
    }))
    pushAudit({
      action: 'payment.refund',
      entityType: 'payment',
      entityId: id,
      before: { refundedAmount: alreadyRefunded, status: payment.status },
      after: {
        refundedAmount: newRefunded,
        status: fullyRefunded ? 'refunded' : payment.status,
        via: providerRefundPossible ? 'provider' : 'manual',
      },
    })
    return HttpResponse.json(await withLatency(updated))
  }),
  http.get('/api/admin/plans', async () => HttpResponse.json(await withLatency(getDb().plans))),
  http.get('/api/admin/plan-stats', async () =>
    HttpResponse.json(
      await withLatency({
        totalPlans: getDb().plans.length,
        activePlans: getDb().plans.filter((p) => p.status === 'active').length,
        activeSubscriptions: getDb().subscriptions.length,
      })
    )
  ),
  http.post('/api/admin/plans', async ({ request }) => {
    const payload = (await request.json()) as Omit<Plan, 'id'> & { id?: string }
    const plan: Plan = { ...payload, id: payload.id ?? createId('plan') }
    updateDb(db => ({ ...db, plans: [plan, ...db.plans] }))
    return HttpResponse.json(await withLatency(plan), { status: 201 })
  }),
  http.delete('/api/admin/plans/:id', async ({ params }) => {
    const id = String(params.id)
    updateDb((db) => ({ ...db, plans: db.plans.filter((p) => p.id !== id) }))
    return new HttpResponse(null, { status: 204 })
  }),
  http.patch('/api/admin/plans/:id', async ({ params, request }) => {
    const updates = (await request.json()) as Record<string, unknown>
    const id = String(params.id)
    let updatedPlan: Record<string, unknown> | null = null
    updateDb(db => {
      const plans = db.plans.map(plan => {
        if (plan.id !== id) return plan
        updatedPlan = { ...plan, ...updates }
        return updatedPlan as any
      })
      return { ...db, plans }
    })
    if (!updatedPlan) {
      return HttpResponse.json({ message: 'Plan not found' }, { status: 404 })
    }
    return HttpResponse.json(await withLatency(updatedPlan))
  }),
  http.get('/api/admin/complaints', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    const db = getDb()
    const items = db.complaints.map((complaint) => {
      const customer = db.users.find((u) => u.id === complaint.customerId)
      return {
        ...complaint,
        customerName: customer?.name,
        customerEmail: customer?.email,
      }
    })
    return HttpResponse.json(await withLatency(paginate(items, page, pageSize)))
  }),
  http.patch('/api/admin/complaints/:id/status', async ({ params, request }) => {
    const { status } = (await request.json()) as { status: ComplaintStatus }
    const id = String(params.id)
    let updated: any = null
    updateDb(db => {
      const complaints = db.complaints.map(complaint => {
        if (complaint.id !== id) return complaint
        updated = { ...complaint, status }
        return updated
      })
      return { ...db, complaints }
    })
    if (!updated) {
      return HttpResponse.json({ message: 'Complaint not found' }, { status: 404 })
    }
    return HttpResponse.json(await withLatency(updated))
  }),
  http.get('/api/admin/messages', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    return HttpResponse.json(await withLatency(paginate(getDb().messages, page, pageSize)))
  }),
  http.get('/api/admin/messages/folder-counts', async () =>
    HttpResponse.json(
      await withLatency({ inbox: 3, sent: 1, starred: 0, archived: 0, unread: 2 })
    )
  ),
  http.get('/api/admin/messages/activity', async () =>
    HttpResponse.json(await withLatency([]))
  ),
  http.post('/api/admin/messages', async ({ request }) => {
    const payload = (await request.json()) as Record<string, unknown>
    const message = { ...payload, id: createId('msg'), createdAt: new Date().toISOString(), read: false }
    updateDb((db) => ({ ...db, messages: [message as any, ...db.messages] }))
    return HttpResponse.json(await withLatency(message), { status: 201 })
  }),
  http.patch('/api/admin/messages/:id/read', async ({ params, request }) => {
    const { read } = (await request.json()) as { read: boolean }
    const id = String(params.id)
    let updated: any = null
    updateDb(db => {
      const messages = db.messages.map(message => {
        if (message.id !== id) return message
        updated = { ...message, read }
        return updated
      })
      return { ...db, messages }
    })
    if (!updated) {
      return HttpResponse.json({ message: 'Message not found' }, { status: 404 })
    }
    return HttpResponse.json(await withLatency(updated))
  }),
  http.patch('/api/admin/messages/:id/folder', async ({ params, request }) => {
    const { folder } = (await request.json()) as { folder: string }
    const id = String(params.id)
    let updated: any = null
    updateDb((db) => {
      const messages = db.messages.map((message) => {
        if (message.id !== id) return message
        updated = { ...message, folder }
        return updated
      })
      return { ...db, messages }
    })
    if (!updated) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    return HttpResponse.json(await withLatency(updated))
  }),
  http.patch('/api/admin/rentals/:id/status', async ({ params, request }) => {
    const { status, note } = (await request.json()) as { status: RentalStatus; note?: string }
    const id = String(params.id)
    const existing = getDb().rentals.find((r) => r.id === id)
    if (!existing) {
      return HttpResponse.json({ error: 'Rental not found' }, { status: 404 })
    }
    if (!(RENTAL_TRANSITIONS[existing.status] ?? []).includes(status)) {
      return HttpResponse.json(
        { error: `Illegal transition ${existing.status} → ${status}` },
        { status: 409 }
      )
    }
    const now = new Date().toISOString()
    let updated: Rental | null = null
    updateDb(db => {
      const rentals = db.rentals.map(rental => {
        if (rental.id !== id) return rental
        updated = {
          ...rental,
          status,
          ...(status === 'active' ? { activatedAt: now } : {}),
          ...(status === 'completed' ? { completedAt: now, nextBillingDate: undefined } : {}),
        }
        return updated
      })
      const vehicles =
        status === 'completed' || status === 'cancelled'
          ? db.vehicles.map((v) =>
              v.id === existing.vehicleId ? { ...v, status: 'available' as VehicleStatus } : v
            )
          : status === 'active'
            ? db.vehicles.map((v) =>
                v.id === existing.vehicleId ? { ...v, status: 'rented' as VehicleStatus } : v
              )
            : db.vehicles
      return { ...db, rentals, vehicles }
    })
    pushAudit({
      action: 'rental.status_change',
      entityType: 'rental',
      entityId: id,
      before: { status: existing.status },
      after: { status },
      note,
    })
    return HttpResponse.json(await withLatency(updated))
  }),
  http.patch('/api/admin/dealers/:id/status', async ({ params, request }) => {
    const { status } = (await request.json()) as { status: UserStatus }
    const id = String(params.id)
    let updated: any = null
    updateDb(db => {
      const dealers = db.dealers.map(dealer => {
        if (dealer.id !== id) return dealer
        updated = { ...dealer, status }
        return updated
      })
      return { ...db, dealers }
    })
    if (!updated) {
      return HttpResponse.json({ message: 'Dealer not found' }, { status: 404 })
    }
    return HttpResponse.json(await withLatency(updated))
  }),
  http.patch('/api/admin/dealers/:id/bank-details', async ({ params, request }) => {
    const body = (await request.json()) as {
      verified?: boolean
      bankAccountName?: string
      bankName?: string
      bankIban?: string
    }
    const id = String(params.id)
    let updated: any = null
    updateDb((db) => {
      const dealers = db.dealers.map((dealer) => {
        if (dealer.id !== id) return dealer
        updated = {
          ...dealer,
          ...(body.bankAccountName !== undefined ? { bankAccountName: body.bankAccountName } : {}),
          ...(body.bankName !== undefined ? { bankName: body.bankName } : {}),
          ...(body.bankIban !== undefined ? { bankIban: body.bankIban } : {}),
          bankDetailsVerifiedAt:
            body.verified === true
              ? new Date().toISOString()
              : body.verified === false
                ? undefined
                : dealer.bankDetailsVerifiedAt,
        }
        return updated
      })
      return { ...db, dealers }
    })
    if (!updated) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    return HttpResponse.json(await withLatency(updated))
  }),
  http.get('/api/admin/payouts', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    const items = [
      {
        id: 'payout_mock_1',
        dealerId: getDb().dealers[0]?.id ?? 'dealer_1',
        dealerName: getDb().dealers[0]?.name ?? 'Dealer',
        amount: 180,
        status: 'pending',
        periodStart: '2026-07-01',
        periodEnd: '2026-07-31',
        paidAt: null,
        createdAt: '2026-08-01T00:00:00.000Z',
      },
    ]
    return HttpResponse.json(await withLatency(paginate(items, page, pageSize)))
  }),
  http.post('/api/admin/payouts/generate', async () =>
    HttpResponse.json(await withLatency({ created: 0 }))
  ),
  http.post('/api/admin/payouts/:id/mark-paid', async () =>
    HttpResponse.json(await withLatency({ ok: true }))
  ),
  http.patch('/api/admin/vehicles/:id/status', async ({ params, request }) => {
    const { status } = (await request.json()) as { status: VehicleStatus }
    const id = String(params.id)
    let updated: any = null
    updateDb(db => {
      const vehicles = db.vehicles.map(vehicle => {
        if (vehicle.id !== id) return vehicle
        updated = { ...vehicle, status }
        return updated
      })
      return { ...db, vehicles }
    })
    if (!updated) {
      return HttpResponse.json({ message: 'Vehicle not found' }, { status: 404 })
    }
    return HttpResponse.json(await withLatency(updated))
  }),
  http.get('/api/admin/complaints/:id/replies', async ({ params }) => {
    const id = String(params.id)
    const db = getDb()
    return HttpResponse.json(
      await withLatency(db.complaintReplies.filter((r) => r.complaintId === id))
    )
  }),
  http.post('/api/admin/complaints/:id/replies', async ({ params, request }) => {
    const { body } = (await request.json()) as { body?: string }
    const complaintId = String(params.id)
    const reply = {
      id: createId('reply'),
      complaintId,
      authorId: 'user_admin_1',
      body: body?.trim() ?? '',
      createdAt: new Date().toISOString(),
      authorName: 'Admin',
      authorRole: 'admin' as const,
    }
    updateDb((db) => ({
      ...db,
      complaintReplies: [...db.complaintReplies, reply],
    }))
    return HttpResponse.json(await withLatency(reply), { status: 201 })
  }),
  http.get('/api/admin/audit-logs', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    const url = new URL(request.url)
    const entityType = url.searchParams.get('entityType')?.trim()
    const entityId = url.searchParams.get('entityId')?.trim()
    let items = auditLogs
    if (entityType) items = items.filter((a) => a.entityType === entityType)
    if (entityId) items = items.filter((a) => a.entityId === entityId)
    return HttpResponse.json(await withLatency(paginate(items, page, pageSize)))
  }),
  http.get('/api/admin/settings', async () =>
    HttpResponse.json(
      await withLatency({
        id: 'settings_1',
        companyName: 'CarFlow',
        supportEmail: 'support@carflow.dev',
        platformCommissionRate: 0.1,
        billingGraceDays: 3,
        paymentHoldTtlMinutes: 45,
        cancelNoticeDays: 30,
        swapEligibleDays: 30,
        subscriptionDepositAmount: 0,
        signupsEnabled: true,
        onlinePaymentsEnabled: true,
        newBookingsEnabled: true,
      })
    )
  ),
  http.patch('/api/admin/settings', async ({ request }) => {
    const updates = (await request.json()) as Record<string, unknown>
    return HttpResponse.json(await withLatency({ id: 'settings_1', ...updates }))
  }),
  http.get('/api/admin/settings/business', async () =>
    HttpResponse.json(
      await withLatency({
        platformCommissionRate: 0.1,
        billingGraceDays: 3,
        paymentHoldTtlMinutes: 45,
        cancelNoticeDays: 30,
        swapEligibleDays: 30,
        subscriptionDepositAmount: 0,
        updatedAt: new Date().toISOString(),
      })
    )
  ),
  http.patch('/api/admin/settings/business', async ({ request }) => {
    const updates = (await request.json()) as Record<string, unknown>
    return HttpResponse.json(
      await withLatency({
        platformCommissionRate: 0.1,
        billingGraceDays: 3,
        paymentHoldTtlMinutes: 45,
        cancelNoticeDays: 30,
        swapEligibleDays: 30,
        subscriptionDepositAmount: 0,
        updatedAt: new Date().toISOString(),
        ...updates,
      })
    )
  }),
  http.get('/api/admin/settings/flags', async () =>
    HttpResponse.json(
      await withLatency({
        checkoutEnabled: true,
        onlinePaymentsEnabled: true,
        signupsEnabled: true,
        dealerSignupsEnabled: true,
        updatedAt: new Date().toISOString(),
      })
    )
  ),
  http.patch('/api/admin/settings/flags', async ({ request }) => {
    const updates = (await request.json()) as Record<string, unknown>
    return HttpResponse.json(
      await withLatency({
        checkoutEnabled: true,
        onlinePaymentsEnabled: true,
        signupsEnabled: true,
        dealerSignupsEnabled: true,
        updatedAt: new Date().toISOString(),
        ...updates,
      })
    )
  }),
  http.get('/api/admin/booking-requests', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    return HttpResponse.json(await withLatency(paginate(getDb().bookingRequests, page, pageSize)))
  }),
  http.get('/api/admin/booking-requests/:id', async ({ params }) => {
    const br = getDb().bookingRequests.find((b) => b.id === String(params.id))
    if (!br) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    return HttpResponse.json(await withLatency(br))
  }),
  http.patch('/api/admin/booking-requests/:id/status', async ({ params, request }) => {
    const { status } = (await request.json()) as { status: string }
    const id = String(params.id)
    let updated: any = null
    updateDb((db) => {
      const bookingRequests = db.bookingRequests.map((br) => {
        if (br.id !== id) return br
        updated = { ...br, status }
        return updated
      })
      return { ...db, bookingRequests }
    })
    if (!updated) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    return HttpResponse.json(await withLatency(updated))
  }),
  http.delete('/api/admin/booking-requests/:id', async ({ params }) => {
    const id = String(params.id)
    updateDb((db) => ({ ...db, bookingRequests: db.bookingRequests.filter((b) => b.id !== id) }))
    return new HttpResponse(null, { status: 204 })
  }),
  http.patch('/api/admin/disputes/:id', async () =>
    HttpResponse.json(await withLatency({ ok: true }))
  ),
  http.patch('/api/admin/maintenance/:id/complete', async () =>
    HttpResponse.json(await withLatency({ ok: true }))
  ),
  http.get('/api/admin/jobs/runs', async () => HttpResponse.json(await withLatency([]))),
  http.post('/api/admin/jobs/run-once', async () =>
    HttpResponse.json(await withLatency({ ok: true }))
  ),
  http.get('/api/admin/analytics/rollups', async () =>
    HttpResponse.json(
      await withLatency({
        revenue: [],
        rentals: [],
        metrics: {
          activationRate: 72.5,
          approvalSlaHours: 4.2,
          paymentSuccessRate: 91,
          churnRate: 8.5,
          counts: {
            signups: 8,
            emailVerified: 6,
            bookingsApproved: 5,
            paymentsCompleted: 10,
            paymentsFailed: 1,
            rentalsActivated: 4,
            cancelRequested: 1,
          },
        },
        metricTrends: {
          activation_rate: [],
          approval_sla_hours: [],
          payment_success_rate: [],
          churn_rate: [],
        },
      })
    )
  ),
  http.post('/api/admin/analytics/rollups/refresh', async () =>
    HttpResponse.json(await withLatency({ ok: true }))
  ),
  http.get('/api/admin/broadcasts/preview', async ({ request }) => {
    const segment = new URL(request.url).searchParams.get('segment') ?? 'all_dealers'
    const counts: Record<string, number> = {
      all_dealers: 2,
      all_customers: 5,
      overdue_customers: 1,
      active_subscribers: 3,
      pending_dealers: 0,
    }
    return HttpResponse.json(await withLatency({ segment, recipientCount: counts[segment] ?? 0 }))
  }),
  http.get('/api/admin/broadcasts', async () => HttpResponse.json(await withLatency({ items: [] }))),
  http.post('/api/admin/broadcasts', async ({ request }) => {
    const body = (await request.json()) as {
      segment: string
      subject: string
      body: string
      channels: { inApp: boolean; email: boolean }
    }
    return HttpResponse.json(
      await withLatency({
        id: createId('broadcast'),
        segment: body.segment,
        subject: body.subject,
        body: body.body,
        channels: body.channels,
        sentCount: 2,
        createdBy: 'user_admin_1',
        createdAt: new Date().toISOString(),
      }),
      { status: 201 }
    )
  }),
  http.get('/api/admin/staff', async () =>
    HttpResponse.json(
      await withLatency({
        items: [
          {
            id: 'user_admin_1',
            email: 'admin@carflow.dev',
            name: 'Admin',
            role: 'admin',
            status: 'active',
            createdAt: new Date().toISOString(),
          },
        ],
      })
    )
  ),
  http.get('/api/admin/staff/invites', async () => HttpResponse.json(await withLatency({ items: [] }))),
  http.post('/api/admin/staff/invites', async () =>
    HttpResponse.json(
      await withLatency({
        id: createId('invite'),
        email: 'ops@example.com',
        name: 'Ops User',
        role: 'ops',
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        acceptedAt: null,
        createdAt: new Date().toISOString(),
      }),
      { status: 201 }
    )
  ),
  http.post('/api/admin/staff/invites/:id/resend', async ({ params }) =>
    HttpResponse.json(
      await withLatency({
        id: String(params.id),
        email: 'ops@example.com',
        name: 'Ops User',
        role: 'ops',
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        acceptedAt: null,
        createdAt: new Date().toISOString(),
      })
    )
  ),
  http.delete('/api/admin/staff/invites/:id', async () => new HttpResponse(null, { status: 204 })),
  http.patch('/api/admin/staff/:id/deactivate', async ({ params }) =>
    HttpResponse.json(
      await withLatency({
        id: String(params.id),
        email: 'ops@example.com',
        name: 'Ops User',
        role: 'ops',
        status: 'suspended',
      })
    )
  ),
  http.get('/api/admin/disputes', async () => HttpResponse.json(await withLatency([]))),
  http.post('/api/admin/disputes', async () =>
    HttpResponse.json(await withLatency({ id: createId('dispute') }), { status: 201 })
  ),
  http.get('/api/admin/vehicles/search', async () => HttpResponse.json(await withLatency([]))),
  http.get('/api/admin/maintenance', async () => HttpResponse.json(await withLatency([]))),
  http.get('/api/admin/promo-codes', async () =>
    HttpResponse.json(await withLatency({ items: mockPromoCodes }))
  ),
  http.post('/api/admin/promo-codes', async ({ request }) => {
    const body = (await request.json()) as {
      code: string
      discountType: 'percent' | 'fixed'
      discountValue: number
      minTermMonths?: number
      maxUses?: number | null
      perCustomerLimit?: number
      firstInvoiceOnly?: boolean
      validFrom?: string | null
      validUntil?: string | null
    }
    const maxUses = body.maxUses ?? null
    const promo = {
      id: createId('promo'),
      code: body.code.toUpperCase(),
      discountType: body.discountType,
      discountValue: body.discountValue,
      minTermMonths: body.minTermMonths ?? 1,
      maxUses,
      usedCount: 0,
      remainingUses: maxUses,
      perCustomerLimit: body.perCustomerLimit ?? 1,
      firstInvoiceOnly: body.firstInvoiceOnly ?? true,
      validFrom: body.validFrom ?? null,
      validUntil: body.validUntil ?? null,
      active: true,
      createdAt: new Date().toISOString(),
    }
    mockPromoCodes.push(promo)
    return HttpResponse.json(await withLatency(promo), { status: 201 })
  }),
  http.patch('/api/admin/promo-codes/:id', async ({ params, request }) => {
    const idx = mockPromoCodes.findIndex((p) => p.id === params.id)
    if (idx < 0) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    const updates = (await request.json()) as Record<string, unknown>
    mockPromoCodes[idx] = { ...mockPromoCodes[idx], ...updates }
    return HttpResponse.json(await withLatency(mockPromoCodes[idx]))
  }),
  http.delete('/api/admin/promo-codes/:id', async ({ params }) => {
    const idx = mockPromoCodes.findIndex((p) => p.id === params.id)
    if (idx < 0) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    mockPromoCodes[idx] = { ...mockPromoCodes[idx], active: false }
    return HttpResponse.json(await withLatency(mockPromoCodes[idx]))
  }),
  http.post('/api/auth/staff-invite/accept', async () =>
    HttpResponse.json(await withLatency({ ok: true }))
  ),

  // Account security lives on the role-agnostic /api/auth/security router.
  // `totpRequired` is true for admin-portal roles when the deployment enforces
  // staff 2FA, which is the case worth exercising in the admin app.
  http.get('/api/auth/security', async () =>
    HttpResponse.json(
      await withLatency({
        totpEnabled: false,
        totpRequired: true,
        smsVerified: false,
        smsPhone: null,
        smsVerificationAvailable: true,
        smsProviderConfigured: false,
        smsDevFallback: true,
      })
    )
  ),
  http.post('/api/auth/security/2fa/setup', async () =>
    HttpResponse.json(
      await withLatency({
        secret: 'MOCK2FA',
        uri: 'otpauth://totp/CarFlow:admin@carflow.com?secret=MOCK2FA&issuer=CarFlow',
      })
    )
  ),
  http.post('/api/auth/security/2fa/enable', async () =>
    HttpResponse.json(await withLatency({ ok: true }))
  ),
  http.post('/api/auth/security/2fa/disable', async () =>
    HttpResponse.json(await withLatency({ ok: true }))
  ),
]
