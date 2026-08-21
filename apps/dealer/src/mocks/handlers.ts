import type {
  BillingHistoryItem,
  BookingRequest,
  Invoice,
  KpiMetric,
  Lead,
  Notification,
  Payment,
  PaymentMethodType,
  Rental,
  RentalEvent,
  RentalStatus,
  Subscription,
  SwapRequest,
  TimeSeriesPoint,
  Vehicle,
  VehicleStatus,
} from '@carflow/shared'
import { createId, getDb, paginate, updateDb, withLatency } from '@carflow/shared'
import { http, HttpResponse } from 'msw'

const parseListParams = (request: Request) => {
  const url = new URL(request.url)
  const page = Number(url.searchParams.get('page') ?? '1')
  const pageSize = Number(url.searchParams.get('pageSize') ?? '10')
  return { page, pageSize }
}

const OPEN_RENTAL_STATUSES: RentalStatus[] = ['reserved', 'active', 'past_due']

function addMonthsISO(dateISO: string, months: number): string {
  const [y, m, d] = dateISO.split('-').map((part) => parseInt(part, 10))
  const targetMonth0 = m - 1 + months
  const targetYear = y + Math.floor(targetMonth0 / 12)
  const normalizedMonth0 = ((targetMonth0 % 12) + 12) % 12
  const daysInMonth = new Date(Date.UTC(targetYear, normalizedMonth0 + 1, 0)).getUTCDate()
  const day = Math.min(d, daysInMonth)
  return new Date(Date.UTC(targetYear, normalizedMonth0, day)).toISOString().slice(0, 10)
}

/**
 * Local fixtures for the subscription-lifecycle endpoints (rental events,
 * per-rental invoices, swap requests). The shared MockDb has no collections
 * for these, so they live at module scope — enough for unit tests and dev.
 */
const mockRentalEvents: RentalEvent[] = [
  {
    id: 'rev_1',
    rentalId: 'rental_1',
    type: 'pickup',
    mileage: 8000,
    fuelLevel: 'full',
    conditionNotes: 'No visible damage at handover.',
    photos: [],
    createdAt: '2026-01-10',
  },
]

const mockRentalInvoices: Invoice[] = [
  {
    id: 'rinv_1',
    ownerId: 'user_customer_1',
    ownerType: 'customer',
    rentalId: 'rental_1',
    amount: 745,
    status: 'paid',
    date: '2026-01-10',
    periodStart: '2026-01-10',
    periodEnd: '2026-02-09',
    description: 'Monthly subscription — Tesla Model 3',
  },
  {
    id: 'rinv_2',
    ownerId: 'user_customer_1',
    ownerType: 'customer',
    rentalId: 'rental_1',
    amount: 745,
    status: 'due',
    date: '2026-02-10',
    dueDate: '2026-02-14',
    periodStart: '2026-02-10',
    periodEnd: '2026-03-09',
    description: 'Monthly subscription — Tesla Model 3',
  },
]

const mockSwapRequests: SwapRequest[] = [
  {
    id: 'swap_1',
    rentalId: 'rental_1',
    customerId: 'user_customer_1',
    currentVehicleId: 'veh_1',
    requestedVehicleId: 'veh_2',
    status: 'pending',
    note: 'Need more trunk space for the next month.',
    createdAt: '2026-01-20',
  },
]

const customerSummary = (customerId: string) => {
  const user = getDb().users.find((u) => u.id === customerId)
  return user ? { id: user.id, name: user.name, email: user.email } : undefined
}

const withRentalRelations = (rental: Rental) => {
  const db = getDb()
  return {
    ...rental,
    vehicle: db.vehicles.find((v) => v.id === rental.vehicleId),
    customer: customerSummary(rental.customerId),
  }
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

  const bookingTrend: TimeSeriesPoint[] = db.rentals.slice(0, 4).map((_r, i) => ({
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
    if ('status' in updates) {
      return HttpResponse.json(
        { error: 'Status cannot be changed here. Use the status endpoint.' },
        { status: 400 }
      )
    }
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
    const openRental = getDb().rentals.find(
      (r) => r.vehicleId === id && OPEN_RENTAL_STATUSES.includes(r.status)
    )
    if (openRental) {
      return HttpResponse.json(
        { error: 'This vehicle has an open rental. Complete or return it first.' },
        { status: 409 }
      )
    }
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
      status: BookingRequest['status']
      declineReason?: string
    }
    const id = String(params.id)
    let updated: BookingRequest | null = null
    updateDb((db) => {
      const bookingRequests = db.bookingRequests.map((br) => {
        if (br.id !== id) return br
        updated = { ...br, status, declineReason }
        return updated
      })
      return { ...db, bookingRequests }
    })
    if (!updated) {
      return HttpResponse.json({ message: 'Request not found' }, { status: 404 })
    }
    return HttpResponse.json(await withLatency(updated))
  }),
  // Amount is server-derived from the oldest unpaid invoice; no longer activates the rental.
  http.post('/api/dealer/payments/offline', async ({ request }) => {
    const payload = (await request.json()) as { rentalId?: string; method?: PaymentMethodType }
    const rental = getDb().rentals.find((r) => r.id === payload.rentalId)
    if (!rental) {
      return HttpResponse.json({ error: 'Rental not found' }, { status: 404 })
    }
    if (rental.status === 'completed' || rental.status === 'cancelled') {
      return HttpResponse.json(
        { error: 'This rental is closed — no payments can be recorded.' },
        { status: 409 }
      )
    }
    const unpaid = mockRentalInvoices
      .filter((inv) => inv.rentalId === rental.id && (inv.status === 'due' || inv.status === 'overdue'))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0]
    const amount = unpaid?.amount ?? (rental.paymentStatus !== 'completed' ? rental.monthlyAmount : null)
    if (amount === null) {
      return HttpResponse.json({ error: 'Nothing is due for this rental.' }, { status: 409 })
    }
    if (unpaid) unpaid.status = 'paid'
    const payment: Payment = {
      id: createId('pay'),
      rentalId: rental.id,
      customerId: rental.customerId,
      dealerId: rental.dealerId,
      amount,
      status: 'completed',
      type: 'rental',
      method: payload.method ?? 'bank',
      provider: 'manual',
      invoiceId: unpaid?.id,
      createdAt: new Date().toISOString(),
    }
    updateDb((db) => ({
      ...db,
      payments: [payment, ...db.payments],
      rentals: db.rentals.map((r) =>
        r.id === rental.id ? { ...r, paymentStatus: 'completed' as const } : r
      ),
    }))
    return HttpResponse.json(await withLatency(payment), { status: 201 })
  }),

  http.get('/api/dealer/rentals', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    const url = new URL(request.url)
    const status = url.searchParams.get('status') as RentalStatus | null
    const items = getDb()
      .rentals.filter((r) => (status ? r.status === status : true))
      .map(withRentalRelations)
    return HttpResponse.json(await withLatency(paginate(items, page, pageSize)))
  }),
  http.get('/api/dealer/rentals/:id', async ({ params }) => {
    const id = String(params.id)
    const rental = getDb().rentals.find((r) => r.id === id)
    if (!rental) {
      return HttpResponse.json({ error: 'Rental not found' }, { status: 404 })
    }
    return HttpResponse.json(
      await withLatency({
        ...withRentalRelations(rental),
        events: mockRentalEvents.filter((event) => event.rentalId === id),
        invoices: mockRentalInvoices.filter((invoice) => invoice.rentalId === id),
      })
    )
  }),
  http.post('/api/dealer/rentals/:id/handover', async ({ params, request }) => {
    const id = String(params.id)
    const body = (await request.json()) as {
      mileage?: number
      fuelLevel?: string
      conditionNotes?: string
      photos?: string[]
    }
    const rental = getDb().rentals.find((r) => r.id === id)
    if (!rental) {
      return HttpResponse.json({ error: 'Rental not found' }, { status: 404 })
    }
    if (rental.status !== 'reserved') {
      return HttpResponse.json(
        { error: 'Only reserved rentals can be handed over.' },
        { status: 409 }
      )
    }
    if (rental.paymentStatus !== 'completed') {
      return HttpResponse.json(
        { error: 'Record the first payment before handing the vehicle over.' },
        { status: 409 }
      )
    }
    let updated: Rental | null = null
    updateDb((db) => ({
      ...db,
      rentals: db.rentals.map((r) => {
        if (r.id !== id) return r
        updated = { ...r, status: 'active' as const, activatedAt: new Date().toISOString() }
        return updated
      }),
      vehicles: db.vehicles.map((v) =>
        v.id === rental.vehicleId ? { ...v, status: 'rented' as const } : v
      ),
    }))
    mockRentalEvents.push({
      id: createId('rev'),
      rentalId: id,
      type: 'pickup',
      mileage: body.mileage,
      fuelLevel: body.fuelLevel,
      conditionNotes: body.conditionNotes,
      photos: body.photos ?? [],
      createdAt: new Date().toISOString(),
    })
    return HttpResponse.json(await withLatency(updated))
  }),
  http.post('/api/dealer/rentals/:id/return', async ({ params, request }) => {
    const id = String(params.id)
    const body = (await request.json()) as {
      mileage?: number
      fuelLevel?: string
      conditionNotes?: string
      photos?: string[]
      vehicleNextStatus?: 'available' | 'maintenance'
    }
    const rental = getDb().rentals.find((r) => r.id === id)
    if (!rental) {
      return HttpResponse.json({ error: 'Rental not found' }, { status: 404 })
    }
    if (rental.status !== 'active' && rental.status !== 'past_due') {
      return HttpResponse.json(
        { error: 'Only active or past-due rentals can be returned.' },
        { status: 409 }
      )
    }
    const vehicleNextStatus = body.vehicleNextStatus ?? 'available'
    let updated: Rental | null = null
    updateDb((db) => ({
      ...db,
      rentals: db.rentals.map((r) => {
        if (r.id !== id) return r
        updated = {
          ...r,
          status: 'completed' as const,
          completedAt: new Date().toISOString(),
          nextBillingDate: undefined,
        }
        return updated
      }),
      vehicles: db.vehicles.map((v) =>
        v.id === rental.vehicleId ? { ...v, status: vehicleNextStatus } : v
      ),
    }))
    mockRentalEvents.push({
      id: createId('rev'),
      rentalId: id,
      type: 'return',
      mileage: body.mileage,
      fuelLevel: body.fuelLevel,
      conditionNotes: body.conditionNotes,
      photos: body.photos ?? [],
      createdAt: new Date().toISOString(),
    })
    return HttpResponse.json(await withLatency(updated))
  }),
  http.post('/api/dealer/rentals/:id/extend', async ({ params, request }) => {
    const id = String(params.id)
    const body = (await request.json()) as { months?: number }
    const months = Math.floor(Number(body.months ?? 0))
    if (months < 1 || months > 12) {
      return HttpResponse.json({ error: 'Extension must be between 1 and 12 months' }, { status: 400 })
    }
    const rental = getDb().rentals.find((r) => r.id === id)
    if (!rental) {
      return HttpResponse.json({ error: 'Rental not found' }, { status: 404 })
    }
    if (!OPEN_RENTAL_STATUSES.includes(rental.status)) {
      return HttpResponse.json({ error: 'Only active subscriptions can be extended' }, { status: 409 })
    }
    if (rental.cancellationEffectiveDate) {
      return HttpResponse.json(
        { error: 'Cannot extend a subscription that is pending cancellation' },
        { status: 409 }
      )
    }
    const newEndDate = addMonthsISO(rental.endDate, months)
    const addedAmount = Number(rental.monthlyAmount) * months
    let updated: Rental | null = null
    updateDb((db) => ({
      ...db,
      rentals: db.rentals.map((r) => {
        if (r.id !== id) return r
        updated = {
          ...r,
          endDate: newEndDate,
          termMonths: r.termMonths + months,
          totalAmount: Number(r.totalAmount) + addedAmount,
          cancellationEffectiveDate: undefined,
          cancelRequestedAt: undefined,
          cancelReason: undefined,
        }
        return updated
      }),
    }))
    mockRentalEvents.push({
      id: createId('rev'),
      rentalId: id,
      type: 'note',
      conditionNotes: `Dealer extended by ${months} month(s). New end date: ${newEndDate}.`,
      createdAt: new Date().toISOString(),
    })
    return HttpResponse.json(await withLatency(updated))
  }),
  http.get('/api/dealer/swap-requests', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    const db = getDb()
    const items = mockSwapRequests.map((swap) => ({
      ...swap,
      currentVehicle: db.vehicles.find((v) => v.id === swap.currentVehicleId),
      requestedVehicle: db.vehicles.find((v) => v.id === swap.requestedVehicleId),
      customer: customerSummary(swap.customerId),
    }))
    return HttpResponse.json(await withLatency(paginate(items, page, pageSize)))
  }),
  http.patch('/api/dealer/swap-requests/:id/status', async ({ params, request }) => {
    const id = String(params.id)
    const body = (await request.json()) as {
      status: 'approved' | 'declined'
      declineReason?: string
      mileageOut?: number
      mileageIn?: number
    }
    const swap = mockSwapRequests.find((s) => s.id === id)
    if (!swap) {
      return HttpResponse.json({ error: 'Swap request not found' }, { status: 404 })
    }
    if (swap.status !== 'pending') {
      return HttpResponse.json(
        { error: 'This swap request has already been resolved.' },
        { status: 409 }
      )
    }
    swap.status = body.status
    swap.resolvedAt = new Date().toISOString()
    if (body.status === 'declined') {
      swap.declineReason = body.declineReason
    } else {
      // Approving atomically moves the subscription to the requested vehicle.
      updateDb((db) => ({
        ...db,
        rentals: db.rentals.map((r) =>
          r.id === swap.rentalId ? { ...r, vehicleId: swap.requestedVehicleId } : r
        ),
        vehicles: db.vehicles.map((v) =>
          v.id === swap.requestedVehicleId
            ? { ...v, status: 'rented' as const }
            : v.id === swap.currentVehicleId
              ? { ...v, status: 'available' as const }
              : v
        ),
      }))
      const now = new Date().toISOString()
      mockRentalEvents.push(
        {
          id: createId('rev'),
          rentalId: swap.rentalId,
          type: 'swap_out',
          mileage: body.mileageOut,
          photos: [],
          createdAt: now,
        },
        {
          id: createId('rev'),
          rentalId: swap.rentalId,
          type: 'swap_in',
          mileage: body.mileageIn,
          photos: [],
          createdAt: now,
        }
      )
    }
    return HttpResponse.json(await withLatency({ ...swap }))
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
        bankAccountName: dealer?.bankAccountName,
        bankName: dealer?.bankName,
        bankIban: dealer?.bankIban,
        bankDetailsVerifiedAt: dealer?.bankDetailsVerifiedAt,
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
  http.patch('/api/dealer/maintenance/:id/complete', async () =>
    HttpResponse.json(await withLatency({ ok: true }))
  ),
  http.get('/api/dealer/payouts', async () => HttpResponse.json(await withLatency([]))),
  http.get('/api/dealer/earnings', async () =>
    HttpResponse.json(await withLatency({ total: 0, pending: 0, paid: 0 }))
  ),
  http.get('/api/dealer/maintenance', async () => HttpResponse.json(await withLatency([]))),
  http.post('/api/dealer/maintenance', async () =>
    HttpResponse.json(await withLatency({ id: createId('maint') }), { status: 201 })
  ),
  http.get('/api/dealer/analytics/insights', async () =>
    HttpResponse.json(await withLatency({ insights: [] }))
  ),
  http.get('/api/dealer/plans', async () => HttpResponse.json(await withLatency(getDb().plans))),
  http.patch('/api/dealer/subscription/plan', async () =>
    HttpResponse.json(await withLatency({ ok: true }))
  ),
  http.post('/api/dealer/subscription/cancel', async () =>
    HttpResponse.json(await withLatency({ ok: true }))
  ),
]
