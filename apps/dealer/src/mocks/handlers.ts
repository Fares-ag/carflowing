import { http, HttpResponse } from 'msw'
import type {
  BillingHistoryItem,
  KpiMetric,
  Lead,
  Notification,
  Paginated,
  PaymentMethod,
  Subscription,
  TimeSeriesPoint,
  Vehicle,
  VehicleStatus,
} from '@carflow/shared'
import { createId, getDb, paginate, updateDb, withLatency } from '@carflow/shared'

const parseListParams = (request: Request) => {
  const url = new URL(request.url)
  const page = Number(url.searchParams.get('page') ?? '1')
  const pageSize = Number(url.searchParams.get('pageSize') ?? '10')
  return { page, pageSize }
}

const buildDealerDashboard = () => {
  const db = getDb()
  const totalRevenue = db.payments.reduce((sum, p) => sum + p.amount, 0)
  const kpis: KpiMetric[] = [
    { label: 'Total Revenue', value: totalRevenue },
    { label: 'Total Rentals', value: db.rentals.length },
    { label: 'Active Vehicles', value: db.vehicles.length },
    { label: 'Active Leads', value: db.leads.length },
  ]

  const revenueTrend: TimeSeriesPoint[] = db.payments.slice(0, 6).map((p, i) => ({
    date: `2025-${String(10 + i).padStart(2, '0')}`,
    value: p.amount,
  }))

  const bookingTrend: TimeSeriesPoint[] = db.rentals.slice(0, 4).map((r, i) => ({
    date: `2025-${String(10 + i).padStart(2, '0')}`,
    value: 1,
  }))

  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const revenueChartData = db.payments.slice(0, 6).map((p, i) => ({
    month: `${MONTH_NAMES[(9 + i) % 12]} 2025`,
    revenue: p.amount,
  }))

  const recentRentals = db.rentals.slice(0, 5).map((r) => {
    const vehicle = db.vehicles.find((v) => v.id === r.vehicleId)
    const customer = db.users.find((u) => u.id === r.customerId)
    return {
      id: r.id,
      customerName: customer?.name ?? 'Customer',
      vehicleName: vehicle?.name ?? 'Unknown',
      status: r.status,
      createdAt: r.createdAt,
    }
  })

  const vehiclesWithStatus = db.vehicles.map((v) => ({
    id: v.id,
    name: v.name,
    status: v.status ?? 'available',
  }))

  return { kpis, revenueTrend, bookingTrend, revenueChartData, recentRentals, vehiclesWithStatus }
}

const buildDealerAnalytics = () => {
  const db = getDb()
  const totalRevenue = db.payments.reduce((sum, p) => sum + p.amount, 0)
  const activeRentals = db.rentals.filter((r) => r.status === 'active' || r.status === 'reserved').length
  const uniqueCustomers = new Set(db.rentals.map((r) => r.customerId)).size
  const totalVehicles = db.vehicles.length
  const rentedCount = db.rentals.filter((r) => r.status === 'active').length
  const fleetUtilization = totalVehicles > 0 ? Math.round((rentedCount / totalVehicles) * 100) : 0
  const revenueTrend = db.payments.map((p, i) => ({
    month: `Month ${i + 1}`,
    revenue: p.amount,
    profit: Math.round(p.amount * 0.2),
    createdAt: p.createdAt,
  }))
  const utilization = db.vehicles.reduce((acc: Array<{ category: string; utilization: number }>, v) => {
    const existing = acc.find((x) => x.category === (v.category ?? 'other'))
    if (existing) existing.utilization += fleetUtilization
    else acc.push({ category: v.category ?? 'other', utilization: fleetUtilization })
    return acc
  }, [])
  return {
    totalRevenue,
    activeBookings: activeRentals,
    newCustomersThisMonth: uniqueCustomers,
    fleetUtilization,
    revenueTrend,
    customerDemographics: [] as Array<{ name: string; value: number }>,
    revenueBooking: db.rentals.slice(0, 6).map((r) => ({
      month: r.createdAt,
      revenue: 0,
      bookings: 1,
    })),
    bookingTime: [] as Array<{ time: string; bookings: number }>,
    utilization: utilization.length > 0 ? utilization : [],
  }
}

export const handlers = [
  http.get('/api/auth/me', async () => {
    const user = getDb().users.find((u) => u.role === 'dealer') ?? getDb().users[0]
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
    const payload = (await request.json()) as { email?: string; role?: string }
    const db = getDb()
    const role = payload.role ?? 'dealer'
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

  http.get('/api/dealer/dashboard', async () =>
    HttpResponse.json(await withLatency(buildDealerDashboard()))
  ),
  http.get('/api/dealer/analytics', async () =>
    HttpResponse.json(await withLatency(buildDealerAnalytics()))
  ),
  http.get('/api/dealer/inventory', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    return HttpResponse.json(await withLatency(paginate(getDb().vehicles, page, pageSize)))
  }),
  http.post('/api/dealer/vehicles', async ({ request }) => {
    const payload = (await request.json()) as Omit<Vehicle, 'id'> & { id?: string }
    const vehicle = { ...payload, id: payload.id ?? createId('veh') }
    updateDb(db => ({ ...db, vehicles: [vehicle, ...db.vehicles] }))
    return HttpResponse.json(await withLatency(vehicle), { status: 201 })
  }),
  http.patch('/api/dealer/vehicles/:id', async ({ params, request }) => {
    const updates = (await request.json()) as Partial<Vehicle>
    const id = String(params.id)
    let updated: Vehicle | null = null
    updateDb(db => {
      const vehicles = db.vehicles.map(vehicle => {
        if (vehicle.id !== id) return vehicle
        updated = { ...vehicle, ...updates }
        return updated
      })
      return { ...db, vehicles }
    })
    if (!updated) {
      return HttpResponse.json({ message: 'Vehicle not found' }, { status: 404 })
    }
    return HttpResponse.json(await withLatency(updated))
  }),
  http.patch('/api/dealer/vehicles/:id/status', async ({ params, request }) => {
    const { status } = (await request.json()) as { status: VehicleStatus }
    const id = String(params.id)
    let updated: Vehicle | null = null
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
  http.delete('/api/dealer/vehicles/:id', async ({ params }) => {
    const id = String(params.id)
    updateDb(db => ({ ...db, vehicles: db.vehicles.filter(vehicle => vehicle.id !== id) }))
    return HttpResponse.json(await withLatency({ ok: true }))
  }),
  http.get('/api/dealer/booking-requests', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    const db = getDb()
    const items = db.bookingRequests.map((br) => ({
      ...br,
      vehicle: db.vehicles.find((v) => v.id === br.vehicleId),
      customer: db.users.find((u) => u.id === br.customerId),
    }))
    return HttpResponse.json(await withLatency(paginate(items, page, pageSize)))
  }),
  http.patch('/api/dealer/booking-requests/:id/status', async ({ params, request }) => {
    const { status, declineReason } = (await request.json()) as {
      status: string
      declineReason?: string
    }
    const id = String(params.id)
    let updated: Record<string, unknown> | null = null
    updateDb((db) => {
      const bookingRequests = db.bookingRequests.map((br) => {
        if (br.id !== id) return br
        updated = { ...br, status, declineReason }
        return updated as typeof br
      })
      return { ...db, bookingRequests }
    })
    if (!updated) {
      return HttpResponse.json({ message: 'Request not found' }, { status: 404 })
    }
    return HttpResponse.json(await withLatency(updated))
  }),
  http.post('/api/dealer/payments/offline', async ({ request }) => {
    const payload = (await request.json()) as { rentalId?: string; amount?: number; method?: string }
    updateDb((db) => ({
      ...db,
      payments: [
        {
          id: createId('pay'),
          rentalId: payload.rentalId,
          amount: payload.amount ?? 0,
          status: 'completed',
          type: 'rental',
          method: (payload.method as 'card' | 'bank' | 'wallet') ?? 'bank',
          provider: 'manual',
          createdAt: new Date().toISOString(),
        },
        ...db.payments,
      ],
      rentals: db.rentals.map((r) =>
        r.id === payload.rentalId ? { ...r, paymentStatus: 'completed' as const, status: 'active' as const } : r
      ),
    }))
    return HttpResponse.json(await withLatency({ ok: true }), { status: 201 })
  }),
  http.get('/api/dealer/customer-documents/:customerId', async () =>
    HttpResponse.json(
      await withLatency({ qidDocumentPath: null, driversLicensePath: null })
    )
  ),
  http.get('/api/dealer/settings', async () => {
    const dealer = getDb().dealers[0]
    return HttpResponse.json(
      await withLatency({
        id: dealer?.id ?? 'dealer_1',
        name: dealer?.name ?? 'Dealer',
        contactEmail: dealer?.contactEmail ?? 'dealer@carflow.dev',
        businessHours: [],
      })
    )
  }),
  http.patch('/api/dealer/settings', async ({ request }) => {
    const updates = (await request.json()) as Record<string, unknown>
    return HttpResponse.json(await withLatency({ ...updates, id: 'dealer_1' }))
  }),

  http.get('/api/dealer/leads', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    return HttpResponse.json(await withLatency(paginate(getDb().leads, page, pageSize)))
  }),
  http.post('/api/dealer/leads', async ({ request }) => {
    const payload = (await request.json()) as Omit<Lead, 'id'>
    const lead = { ...payload, id: createId('lead') }
    updateDb(db => ({ ...db, leads: [lead, ...db.leads] }))
    return HttpResponse.json(await withLatency(lead), { status: 201 })
  }),
  http.patch('/api/dealer/leads/:id', async ({ params, request }) => {
    const updates = (await request.json()) as Partial<Lead>
    const id = String(params.id)
    let updated: Lead | null = null
    updateDb(db => {
      const leads = db.leads.map(lead => {
        if (lead.id !== id) return lead
        updated = { ...lead, ...updates }
        return updated
      })
      return { ...db, leads }
    })
    if (!updated) {
      return HttpResponse.json({ message: 'Lead not found' }, { status: 404 })
    }
    return HttpResponse.json(await withLatency(updated))
  }),
  http.delete('/api/dealer/leads/:id', async ({ params }) => {
    const id = String(params.id)
    updateDb(db => ({ ...db, leads: db.leads.filter(lead => lead.id !== id) }))
    return HttpResponse.json(await withLatency({ ok: true }))
  }),
  http.get('/api/dealer/notifications', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    return HttpResponse.json(await withLatency(paginate(getDb().notifications, page, pageSize)))
  }),
  http.post('/api/dealer/notifications/:id/read', async ({ params }) => {
    const id = String(params.id)
    let updated: Notification | null = null
    updateDb(db => {
      const notifications = db.notifications.map(notification => {
        if (notification.id !== id) return notification
        updated = { ...notification, read: true }
        return updated
      })
      return { ...db, notifications }
    })
    if (!updated) {
      return HttpResponse.json({ message: 'Notification not found' }, { status: 404 })
    }
    return HttpResponse.json(await withLatency(updated))
  }),
  http.post('/api/dealer/notifications/read-all', async () => {
    let updated: Notification[] = []
    updateDb(db => {
      updated = db.notifications.map(notification => ({ ...notification, read: true }))
      return { ...db, notifications: updated }
    })
    return HttpResponse.json(await withLatency(updated))
  }),
  http.get('/api/dealer/vehicle-count', async () =>
    HttpResponse.json(await withLatency({ count: getDb().vehicles.length }))
  ),
  http.get('/api/dealer/subscription', async () => {
    const subscription = getDb().subscriptions.find(sub => sub.ownerType === 'dealer')
    return HttpResponse.json(await withLatency(subscription as Subscription))
  }),
  http.get('/api/dealer/payment-methods', async () =>
    HttpResponse.json(await withLatency(getDb().paymentMethods))
  ),
  http.delete('/api/dealer/payment-methods/:id', async ({ params }) => {
    const id = String(params.id)
    updateDb((db) => ({
      ...db,
      paymentMethods: db.paymentMethods.filter((pm) => pm.id !== id),
    }))
    return new HttpResponse(null, { status: 204 })
  }),
  http.get('/api/dealer/billing-history', async () => {
    const history: BillingHistoryItem[] = getDb().invoices
      .filter(invoice => invoice.ownerType === 'dealer')
      .map(invoice => ({
        id: invoice.id,
        date: invoice.date,
        amount: invoice.amount,
        status:
          invoice.status === 'paid'
            ? 'paid'
            : invoice.status === 'overdue'
            ? 'overdue'
            : invoice.status === 'refunded'
            ? 'refunded'
            : 'due',
        description: invoice.description,
      }))
    return HttpResponse.json(await withLatency(history))
  }),
]
