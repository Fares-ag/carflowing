import { http, HttpResponse } from 'msw'
import type {
  AdminDashboardData,
  AdminAnalyticsData,
} from '../services/adminService'
import type {
  ComplaintStatus,
  KpiMetric,
  RentalStatus,
  TimeSeriesPoint,
  User,
  UserStatus,
  VehicleStatus,
} from '@carflow/shared'
import { createId, getDb, paginate, updateDb, withLatency } from '@carflow/shared'

const parseListParams = (request: Request) => {
  const url = new URL(request.url)
  const page = Number(url.searchParams.get('page') ?? '1')
  const pageSize = Number(url.searchParams.get('pageSize') ?? '10')
  return { page, pageSize }
}

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
    const completed = db.payments.filter((p) => p.status === 'completed')
    const pending = db.payments.filter((p) => p.status === 'pending')
    const refunded = db.payments.filter((p) => p.status === 'refunded')
    return HttpResponse.json(
      await withLatency({
        totalRevenue: completed.reduce((sum, p) => sum + p.amount, 0),
        pendingCount: pending.length,
        completedCount: completed.length,
        refundedCount: refunded.length,
        refundTotal: refunded.reduce((sum, p) => sum + p.amount, 0),
        needsRefundCount: db.payments.filter((p) => p.needsRefund).length,
      })
    )
  }),
  http.post('/api/admin/payments/:id/refund', async ({ params }) => {
    const id = String(params.id)
    let updated: (typeof getDb)['payments'][number] | undefined
    updateDb((db) => ({
      ...db,
      payments: db.payments.map((p) => {
        if (p.id !== id) return p
        updated = { ...p, status: 'refunded', needsRefund: false }
        return updated
      }),
    }))
    if (!updated) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
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
    const payload = (await request.json()) as { id?: string }
    const plan = { ...payload, id: payload.id ?? createId('plan') }
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
    const { status } = (await request.json()) as { status: RentalStatus }
    const id = String(params.id)
    let updated: any = null
    updateDb(db => {
      const rentals = db.rentals.map(rental => {
        if (rental.id !== id) return rental
        updated = { ...rental, status }
        return updated
      })
      return { ...db, rentals }
    })
    if (!updated) {
      return HttpResponse.json({ message: 'Rental not found' }, { status: 404 })
    }
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
  http.get('/api/admin/settings', async () =>
    HttpResponse.json(
      await withLatency({
        id: 'settings_1',
        companyName: 'CarFlow',
        supportEmail: 'support@carflow.dev',
        defaultTaxRate: 0.05,
      })
    )
  ),
  http.patch('/api/admin/settings', async ({ request }) => {
    const updates = (await request.json()) as Record<string, unknown>
    return HttpResponse.json(await withLatency({ id: 'settings_1', ...updates }))
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
]
