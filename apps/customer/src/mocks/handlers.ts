import { http, HttpResponse } from 'msw'
import type {
  BookingRequest,
  BookingRequestStatus,
  Invoice,
  Paginated,
  PaymentMethod,
  Rental,
  RentalStatus,
  Subscription,
  Vehicle,
} from '@carflow/shared'
import type { CustomerDashboardData } from '../services/customerService'
import { createId, getDb, paginate, updateDb, withLatency } from '@carflow/shared'

const parseListParams = (request: Request) => {
  const url = new URL(request.url)
  const page = Number(url.searchParams.get('page') ?? '1')
  const pageSize = Number(url.searchParams.get('pageSize') ?? '10')
  return { page, pageSize }
}

const buildCustomerDashboard = (): CustomerDashboardData => {
  const db = getDb()
  const upcomingRentals = db.rentals.filter(rental => rental.status === 'active')
  const recentRentals = db.rentals.slice(0, 3)
  return {
    upcomingRentals,
    recentRentals,
    favoritesCount: db.favorites.length,
  }
}

export const handlers = [
  http.get('/api/auth/me', async () => {
    const user = getDb().users.find((u) => u.role === 'customer') ?? getDb().users[0]
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
  http.post('/api/auth/signup', async ({ request }) => {
    const payload = (await request.json()) as { email?: string; name?: string }
    return HttpResponse.json(
      await withLatency({
        userId: createId('user'),
        role: 'customer',
        name: payload.name ?? 'Customer',
        email: payload.email ?? 'new@carflow.dev',
      }),
      { status: 201 }
    )
  }),
  http.post('/api/auth/change-password', async () =>
    HttpResponse.json(await withLatency({ ok: true }))
  ),
  http.post('/api/auth/login', async ({ request }) => {
    const payload = (await request.json()) as { email?: string; role?: string }
    const db = getDb()
    const role = payload.role ?? 'customer'
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
  http.post('/api/auth/forgot-password', async () => HttpResponse.json(await withLatency({ ok: true }))),
  http.post('/api/auth/reset-password', async ({ request }) => {
    const { token } = (await request.json()) as { token?: string; password?: string }
    if (!token) {
      return HttpResponse.json({ error: 'Invalid or expired token' }, { status: 400 })
    }
    return HttpResponse.json(await withLatency({ ok: true }))
  }),

  http.patch('/api/customer/profile/avatar', async () =>
    HttpResponse.json(await withLatency({ ok: true }))
  ),

  http.get('/api/customer/dashboard', async () =>
    HttpResponse.json(await withLatency(buildCustomerDashboard()))
  ),
  http.get('/api/customer/vehicles', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    const db = getDb()
    const pendingVehicleIds = new Set(
      db.bookingRequests.filter((b) => b.status === 'pending').map((b) => b.vehicleId)
    )
    const available = db.vehicles.filter(
      (v) => v.status === 'available' && !pendingVehicleIds.has(v.id)
    )
    return HttpResponse.json(await withLatency(paginate(available, page, pageSize)))
  }),
  http.get('/api/customer/vehicles/:id', async ({ params }) => {
    const db = getDb()
    const vehicle = db.vehicles.find((v) => v.id === String(params.id))
    if (!vehicle) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    const pending = db.bookingRequests.some(
      (b) => b.vehicleId === vehicle.id && b.status === 'pending'
    )
    if (pending) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    return HttpResponse.json(await withLatency(vehicle))
  }),
  http.get('/api/customer/rentals', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    return HttpResponse.json(await withLatency(paginate(getDb().rentals, page, pageSize)))
  }),
  http.get('/api/customer/rentals/details', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    const db = getDb()
    const items = db.rentals.map((rental) => ({
      ...rental,
      vehicle: db.vehicles.find((v) => v.id === rental.vehicleId),
    }))
    return HttpResponse.json(await withLatency(paginate(items, page, pageSize)))
  }),
  http.get('/api/customer/favorites', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    return HttpResponse.json(await withLatency(paginate(getDb().favorites, page, pageSize)))
  }),
  http.post('/api/customer/favorites', async ({ request }) => {
    const payload = (await request.json()) as { vehicleId: string; customerId?: string }
    const favorite = {
      id: createId('fav'),
      customerId: payload.customerId ?? 'user_customer_1',
      vehicleId: payload.vehicleId,
      createdAt: new Date().toISOString(),
    }
    updateDb(db => ({ ...db, favorites: [favorite, ...db.favorites] }))
    return HttpResponse.json(await withLatency(favorite), { status: 201 })
  }),
  http.delete('/api/customer/favorites/:id', async ({ params }) => {
    const id = String(params.id)
    updateDb(db => ({ ...db, favorites: db.favorites.filter(fav => fav.id !== id) }))
    return new HttpResponse(null, { status: 204 })
  }),
  http.delete('/api/customer/favorites', async () => {
    updateDb(db => ({ ...db, favorites: [] }))
    return new HttpResponse(null, { status: 204 })
  }),
  http.get('/api/customer/favorites/vehicles', async () => {
    const db = getDb()
    const items = db.favorites.map((favorite) => {
      const vehicle = db.vehicles.find((v) => v.id === favorite.vehicleId) ?? null
      const pending = db.bookingRequests.some(
        (br) => br.vehicleId === favorite.vehicleId && br.status === 'pending'
      )
      let unavailableReason: 'removed' | 'pending_booking' | 'unavailable' | null = null
      if (!vehicle) unavailableReason = 'removed'
      else if (pending) unavailableReason = 'pending_booking'
      else if (vehicle.status !== 'available') unavailableReason = 'unavailable'
      return { favorite, vehicle, unavailableReason }
    })
    return HttpResponse.json(await withLatency({ items }))
  }),
  http.post('/api/customer/complaints', async ({ request }) => {
    const payload = (await request.json()) as {
      category?: string
      priority?: string
      subject?: string
      description?: string
    }
    const complaint = {
      id: createId('complaint'),
      customerId: 'user_customer_1',
      category: payload.category ?? 'general',
      priority: (payload.priority ?? 'medium') as 'low' | 'medium' | 'high' | 'urgent',
      status: 'open' as const,
      subject: payload.subject ?? 'Support request',
      description: payload.description ?? '',
      createdAt: new Date().toISOString(),
    }
    updateDb((db) => ({ ...db, complaints: [complaint, ...db.complaints] }))
    return HttpResponse.json(await withLatency(complaint), { status: 201 })
  }),
  http.get('/api/customer/booking-requests', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    return HttpResponse.json(await withLatency(paginate(getDb().bookingRequests, page, pageSize)))
  }),
  http.get('/api/customer/booking-requests/details', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    const db = getDb()
    const items = db.bookingRequests.map((br) => ({
      ...br,
      vehicle: db.vehicles.find((v) => v.id === br.vehicleId),
    }))
    return HttpResponse.json(await withLatency(paginate(items, page, pageSize)))
  }),
  http.post('/api/customer/booking-requests', async ({ request }) => {
    const payload = (await request.json()) as { vehicleId: string; note?: string }
    const booking: BookingRequest = {
      id: createId('req'),
      customerId: 'user_customer_1',
      vehicleId: payload.vehicleId,
      status: 'pending',
      createdAt: new Date().toISOString(),
      note: payload.note,
    }
    updateDb(db => ({ ...db, bookingRequests: [booking, ...db.bookingRequests] }))
    return HttpResponse.json(await withLatency(booking), { status: 201 })
  }),
  http.patch('/api/customer/booking-requests/:id/status', async ({ params, request }) => {
    const { status } = (await request.json()) as { status: BookingRequestStatus }
    const id = String(params.id)
    let updated: BookingRequest | null = null
    updateDb(db => {
      const bookingRequests = db.bookingRequests.map(requestItem => {
        if (requestItem.id !== id) return requestItem
        updated = { ...requestItem, status }
        return updated
      })
      return { ...db, bookingRequests }
    })
    if (!updated) {
      return HttpResponse.json({ message: 'Request not found' }, { status: 404 })
    }
    return HttpResponse.json(await withLatency(updated))
  }),
  http.patch('/api/customer/booking-requests/:id/note', async ({ params, request }) => {
    const { note } = (await request.json()) as { note?: string }
    const id = String(params.id)
    let updated: BookingRequest | null = null
    updateDb((db) => {
      const bookingRequests = db.bookingRequests.map((requestItem) => {
        if (requestItem.id !== id) return requestItem
        updated = { ...requestItem, note }
        return updated
      })
      return { ...db, bookingRequests }
    })
    if (!updated) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    return HttpResponse.json(await withLatency(updated))
  }),
  http.patch('/api/customer/rentals/:id/status', async ({ params, request }) => {
    const { status } = (await request.json()) as { status: RentalStatus }
    const id = String(params.id)
    let updated: Rental | null = null
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
  http.get('/api/customer/profile', async () =>
    HttpResponse.json(
      await withLatency({ qidDocumentPath: null, driversLicensePath: null })
    )
  ),
  http.patch('/api/customer/profile/documents', async ({ request }) => {
    const body = (await request.json()) as { qidDocumentPath?: string; driversLicensePath?: string }
    return HttpResponse.json(await withLatency(body))
  }),
  http.get('/api/customer/notifications', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    return HttpResponse.json(await withLatency(paginate(getDb().notifications, page, pageSize)))
  }),
  http.get('/api/customer/notifications/unread-count', async () => {
    const count = getDb().notifications.filter((n) => !n.read).length
    return HttpResponse.json(await withLatency({ count }))
  }),
  http.post('/api/customer/notifications/:id/read', async () =>
    HttpResponse.json(await withLatency({ ok: true }))
  ),
  http.post('/api/customer/notifications/read-all', async () =>
    HttpResponse.json(await withLatency({ ok: true }))
  ),
  http.delete('/api/customer/payment-methods/:id', async () => new HttpResponse(null, { status: 204 })),
  http.post('/api/customer/payment-methods/:id/default', async () =>
    HttpResponse.json(await withLatency({ ok: true }))
  ),
  http.get('/api/customer/subscription', async () => {
    const subscription = getDb().subscriptions.find(sub => sub.ownerType === 'customer')
    return HttpResponse.json(await withLatency(subscription as Subscription))
  }),
  http.get('/api/customer/invoices', async () => {
    const invoices: Invoice[] = getDb().invoices.filter(inv => inv.ownerType === 'customer')
    return HttpResponse.json(await withLatency(invoices))
  }),
  http.get('/api/customer/payment-methods', async () => {
    const methods: PaymentMethod[] = getDb().paymentMethods
    return HttpResponse.json(await withLatency(methods))
  }),

  // Mock mode has no real SkipCash gateway to redirect to, so the "payment"
  // succeeds immediately: create the booking request right away (in the real
  // API this only happens once the SkipCash webhook confirms payment).
  http.post('/api/payments/skipcash/create-intent', async ({ request }) => {
    const payload = (await request.json()) as { vehicleId: string; note?: string }
    const booking: BookingRequest = {
      id: createId('req'),
      customerId: 'user_customer_1',
      vehicleId: payload.vehicleId,
      status: 'pending',
      createdAt: new Date().toISOString(),
      note: payload.note,
    }
    const paymentId = createId('pay')
    updateDb(db => ({
      ...db,
      bookingRequests: [booking, ...db.bookingRequests],
      payments: [
        {
          id: paymentId,
          customerId: booking.customerId,
          amount: 0,
          status: 'completed',
          type: 'rental',
          method: 'card',
          provider: 'skipcash',
          bookingRequestId: booking.id,
          createdAt: new Date().toISOString(),
        },
        ...db.payments,
      ],
    }))
    return HttpResponse.json(
      await withLatency({ paymentId, payUrl: `/payment-status?paymentId=${paymentId}&mock=1` }),
      { status: 201 }
    )
  }),
  http.get('/api/payments/skipcash/status/:id', async ({ params }) => {
    const payment = getDb().payments.find(p => p.id === String(params.id))
    if (!payment) {
      return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return HttpResponse.json(await withLatency(payment))
  }),
]
