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

const buildAdminAnalytics = (): AdminAnalyticsData => ({
  kpis: [
    { label: 'Total Revenue', value: 248000, changePct: 9.4 },
    { label: 'Total Rentals', value: 1240, changePct: 6.1 },
    { label: 'Avg Duration', value: 4.6, changePct: -1.2 },
    { label: 'Customer Growth', value: 18.2, changePct: 3.4 },
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
})

export const handlers = [
  http.post('/api/auth/login', async ({ request }) => {
    const payload = (await request.json()) as { email?: string; role?: string }
    const db = getDb()
    const role = payload.role ?? 'admin'
    const fallback = db.users.find(user => user.role === role)
    const user = db.users.find(candidate => candidate.email === payload.email && candidate.role === role) ?? fallback
    if (!user) {
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
  http.get('/api/admin/analytics', async () =>
    HttpResponse.json(await withLatency(buildAdminAnalytics()))
  ),
  http.get('/api/admin/vehicles', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    const data = paginate(getDb().vehicles, page, pageSize)
    return HttpResponse.json(await withLatency(data))
  }),
  http.get('/api/admin/customers', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    const customers = getDb().users.filter(user => user.role === 'customer')
    return HttpResponse.json(await withLatency(paginate(customers, page, pageSize)))
  }),
  http.get('/api/admin/rentals', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    return HttpResponse.json(await withLatency(paginate(getDb().rentals, page, pageSize)))
  }),
  http.get('/api/admin/dealers', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    return HttpResponse.json(await withLatency(paginate(getDb().dealers, page, pageSize)))
  }),
  http.get('/api/admin/payments', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    return HttpResponse.json(await withLatency(paginate(getDb().payments, page, pageSize)))
  }),
  http.get('/api/admin/plans', async () => HttpResponse.json(await withLatency(getDb().plans))),
  http.post('/api/admin/plans', async ({ request }) => {
    const payload = (await request.json()) as { id?: string }
    const plan = { ...payload, id: payload.id ?? createId('plan') }
    updateDb(db => ({ ...db, plans: [plan, ...db.plans] }))
    return HttpResponse.json(await withLatency(plan), { status: 201 })
  }),
  http.put('/api/admin/plans/:id', async ({ params, request }) => {
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
    return HttpResponse.json(await withLatency(paginate(getDb().complaints, page, pageSize)))
  }),
  http.put('/api/admin/complaints/:id/status', async ({ params, request }) => {
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
  http.put('/api/admin/messages/:id/read', async ({ params, request }) => {
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
  http.put('/api/admin/rentals/:id/status', async ({ params, request }) => {
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
  http.put('/api/admin/dealers/:id/status', async ({ params, request }) => {
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
  http.put('/api/admin/vehicles/:id/status', async ({ params, request }) => {
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
]
