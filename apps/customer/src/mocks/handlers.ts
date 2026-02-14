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

  http.get('/api/customer/dashboard', async () =>
    HttpResponse.json(await withLatency(buildCustomerDashboard()))
  ),
  http.get('/api/customer/catalog/vehicles', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    return HttpResponse.json(await withLatency(paginate(getDb().vehicles, page, pageSize)))
  }),
  http.get('/api/customer/rentals', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    return HttpResponse.json(await withLatency(paginate(getDb().rentals, page, pageSize)))
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
    return HttpResponse.json(await withLatency({ ok: true }))
  }),
  http.post('/api/customer/favorites/clear', async () => {
    updateDb(db => ({ ...db, favorites: [] }))
    return HttpResponse.json(await withLatency({ ok: true }))
  }),
  http.get('/api/customer/booking-requests', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    return HttpResponse.json(await withLatency(paginate(getDb().bookingRequests, page, pageSize)))
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
  http.put('/api/customer/booking-requests/:id/status', async ({ params, request }) => {
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
  http.put('/api/customer/rentals/:id/status', async ({ params, request }) => {
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
]
