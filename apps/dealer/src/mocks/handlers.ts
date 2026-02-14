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
  const kpis: KpiMetric[] = [
    { label: 'Revenue', value: 128450, changePct: 8.4 },
    { label: 'Active Rentals', value: 12, changePct: 4.2 },
    { label: 'Available Vehicles', value: 42, changePct: -2.1 },
    { label: 'Leads', value: 18, changePct: 6.3 },
  ]

  const revenueTrend: TimeSeriesPoint[] = [
    { date: '2025-10', value: 18200 },
    { date: '2025-11', value: 20800 },
    { date: '2025-12', value: 24200 },
    { date: '2026-01', value: 17600 },
  ]

  const bookingTrend: TimeSeriesPoint[] = [
    { date: '2025-10', value: 32 },
    { date: '2025-11', value: 38 },
    { date: '2025-12', value: 41 },
    { date: '2026-01', value: 29 },
  ]

  return { kpis, revenueTrend, bookingTrend }
}

const buildDealerAnalytics = () => ({
  revenueTrend: [
    { month: 'Jan', revenue: 45000, profit: 32000 },
    { month: 'Feb', revenue: 52000, profit: 38000 },
    { month: 'Mar', revenue: 48000, profit: 35000 },
    { month: 'Apr', revenue: 65000, profit: 48000 },
    { month: 'May', revenue: 70000, profit: 52000 },
    { month: 'Jun', revenue: 85000, profit: 63000 },
  ],
  customerDemographics: [
    { name: '25-34', value: 35 },
    { name: '35-44', value: 28 },
    { name: '45-54', value: 20 },
    { name: '18-24', value: 12 },
    { name: '55+', value: 5 },
  ],
  revenueBooking: [
    { month: 'Jan', revenue: 32000, bookings: 45 },
    { month: 'Feb', revenue: 35000, bookings: 50 },
    { month: 'Mar', revenue: 34000, bookings: 48 },
    { month: 'Apr', revenue: 39000, bookings: 55 },
    { month: 'May', revenue: 41000, bookings: 58 },
    { month: 'Jun', revenue: 42000, bookings: 60 },
  ],
  bookingTime: [
    { time: '6AM', bookings: 7 },
    { time: '8AM', bookings: 12 },
    { time: '10AM', bookings: 18 },
    { time: '12PM', bookings: 24 },
    { time: '2PM', bookings: 21 },
    { time: '4PM', bookings: 28 },
    { time: '6PM', bookings: 15 },
    { time: '8PM', bookings: 9 },
    { time: '10PM', bookings: 5 },
  ],
  utilization: [
    { category: 'SUV', utilization: 85 },
    { category: 'Sedan', utilization: 70 },
    { category: 'Hatchback', utilization: 55 },
    { category: 'Coupe', utilization: 45 },
  ],
})

export const handlers = [
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
  http.put('/api/dealer/vehicles/:id', async ({ params, request }) => {
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
  http.put('/api/dealer/vehicles/:id/status', async ({ params, request }) => {
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
  http.put('/api/dealer/leads/:id', async ({ params, request }) => {
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
  http.put('/api/dealer/notifications/:id/read', async ({ params }) => {
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
  http.put('/api/dealer/notifications/read-all', async () => {
    let updated: Notification[] = []
    updateDb(db => {
      updated = db.notifications.map(notification => ({ ...notification, read: true }))
      return { ...db, notifications: updated }
    })
    return HttpResponse.json(await withLatency(updated))
  }),
  http.get('/api/dealer/subscription', async () => {
    const subscription = getDb().subscriptions.find(sub => sub.ownerType === 'dealer')
    return HttpResponse.json(await withLatency(subscription as Subscription))
  }),
  http.get('/api/dealer/payment-methods', async () =>
    HttpResponse.json(await withLatency(getDb().paymentMethods))
  ),
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
