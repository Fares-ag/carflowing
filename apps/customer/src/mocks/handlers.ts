import type {
  BookingRequest,
  BookingRequestStatus,
  Invoice,
  PaymentMethod,
  Rental,
  RentalEvent,
  RentalStatus,
  Subscription,
  SwapRequest,
} from '@carflow/shared'
import { createId, getDb, paginate, updateDb, withLatency } from '@carflow/shared'
import { http, HttpResponse } from 'msw'
import type { CustomerDashboardData } from '../services/customerService'

const parseListParams = (request: Request) => {
  const url = new URL(request.url)
  const page = Number(url.searchParams.get('page') ?? '1')
  const pageSize = Number(url.searchParams.get('pageSize') ?? '10')
  return { page, pageSize }
}

const CANCEL_NOTICE_DAYS = 30
const SWAP_ELIGIBLE_DAYS = 30

const isoDate = (d: Date) => d.toISOString().slice(0, 10)

const addDays = (base: Date | string, days: number) => {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

/** Mock-only swap request store (the real API persists these server-side). */
let mockSwapRequests: SwapRequest[] = []

const mockSwapEligibleFrom = (rental: Rental): string | null => {
  const anchor = rental.activatedAt ?? (rental.status !== 'reserved' ? rental.startDate : null)
  if (!anchor) return null
  return addDays(anchor, SWAP_ELIGIBLE_DAYS).toISOString()
}

/** Seeds a paid + a due monthly invoice for a started rental, once. */
const ensureRentalInvoices = (rentalId: string): Invoice[] => {
  const db = getDb()
  const rental = db.rentals.find((r) => r.id === rentalId)
  if (!rental) return []
  const existing = db.invoices.filter((inv) => inv.rentalId === rentalId)
  if (existing.length > 0 || rental.status === 'reserved') return existing
  const periodStart = rental.startDate
  const periodEnd = isoDate(addDays(periodStart, 30))
  const seeded: Invoice[] = [
    {
      id: `inv_${rentalId}_1`,
      ownerId: rental.customerId,
      ownerType: 'customer',
      rentalId,
      amount: rental.monthlyAmount,
      status: 'paid',
      date: periodStart,
      periodStart,
      periodEnd,
      description: 'Monthly subscription',
    },
    {
      id: `inv_${rentalId}_2`,
      ownerId: rental.customerId,
      ownerType: 'customer',
      rentalId,
      amount: rental.monthlyAmount,
      status: 'due',
      date: periodEnd,
      dueDate: isoDate(addDays(periodEnd, 7)),
      periodStart: periodEnd,
      periodEnd: isoDate(addDays(periodEnd, 30)),
      description: 'Monthly subscription',
    },
  ]
  updateDb((current) => ({ ...current, invoices: [...current.invoices, ...seeded] }))
  return seeded
}

/**
 * Mirrors the real cancel semantics: reserved cancels immediately (vehicle
 * released), active/past_due gets a scheduled `cancellationEffectiveDate`
 * (30-day notice) and stays active.
 */
const cancelRentalInMock = (
  id: string,
  reason?: string
): { status: number; body: Rental | { error: string } } => {
  const db = getDb()
  const rental = db.rentals.find((r) => r.id === id)
  if (!rental) return { status: 404, body: { error: 'Rental not found' } }
  if (rental.status === 'completed' || rental.status === 'cancelled') {
    return { status: 409, body: { error: `Cannot cancel a rental in status "${rental.status}"` } }
  }
  const now = new Date()
  let updated: Rental
  if (rental.status === 'reserved') {
    updated = {
      ...rental,
      status: 'cancelled',
      cancelRequestedAt: now.toISOString(),
      cancellationEffectiveDate: isoDate(now),
      cancelReason: reason,
      nextBillingDate: undefined,
    }
  } else {
    if (rental.cancellationEffectiveDate) {
      return { status: 409, body: { error: 'Cancellation is already scheduled' } }
    }
    updated = {
      ...rental,
      cancelRequestedAt: now.toISOString(),
      cancellationEffectiveDate: isoDate(addDays(now, CANCEL_NOTICE_DAYS)),
      cancelReason: reason,
    }
  }
  updateDb((current) => ({
    ...current,
    rentals: current.rentals.map((r) => (r.id === id ? updated : r)),
    vehicles:
      updated.status === 'cancelled'
        ? current.vehicles.map((v) =>
            v.id === rental.vehicleId && v.status === 'rented'
              ? { ...v, status: 'available' as const }
              : v
          )
        : current.vehicles,
  }))
  if (updated.status === 'cancelled') {
    mockSwapRequests = mockSwapRequests.map((s) =>
      s.rentalId === id && s.status === 'pending'
        ? { ...s, status: 'cancelled' as const, resolvedAt: now.toISOString() }
        : s
    )
  }
  return { status: 200, body: updated }
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
  http.post('/api/auth/logout-all', async () => HttpResponse.json(await withLatency({ ok: true }))),
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
  http.get('/api/customer/complaints', async () => {
    const db = getDb()
    const items = db.complaints
      .filter((c) => c.customerId === 'user_customer_1')
      .map((c) => ({
        ...c,
        replies: db.complaintReplies
          .filter((r) => r.complaintId === c.id)
          .map((r) => ({
            id: r.id,
            body: r.body,
            createdAt: r.createdAt,
            authorName: r.authorName ?? 'Support',
            fromSupport: r.authorId !== 'user_customer_1',
          })),
      }))
    return HttpResponse.json(await withLatency({ items }))
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
  // Matches the real backend (audit BUG-17): customers may only cancel —
  // any other status transition is refused with 403.
  http.patch('/api/customer/rentals/:id/status', async ({ params, request }) => {
    const { status, reason } = (await request.json()) as { status?: RentalStatus; reason?: string }
    if (status !== 'cancelled') {
      return HttpResponse.json(
        { error: 'Customers can only cancel their subscription' },
        { status: 403 }
      )
    }
    const result = cancelRentalInMock(String(params.id), reason)
    return HttpResponse.json(await withLatency(result.body), { status: result.status })
  }),
  http.post('/api/customer/rentals/:id/cancel', async ({ params, request }) => {
    const payload = (await request.json().catch(() => ({}))) as { reason?: string } | null
    const result = cancelRentalInMock(String(params.id), payload?.reason)
    return HttpResponse.json(await withLatency(result.body), { status: result.status })
  }),
  http.get('/api/customer/rentals/:id/subscription', async ({ params }) => {
    const id = String(params.id)
    const db = getDb()
    const rental = db.rentals.find((r) => r.id === id)
    if (!rental) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    const vehicle = db.vehicles.find((v) => v.id === rental.vehicleId) ?? null
    const invoices = ensureRentalInvoices(id)
    const events: RentalEvent[] =
      rental.status === 'reserved'
        ? []
        : [
            {
              id: `evt_${id}_pickup`,
              rentalId: id,
              type: 'pickup',
              mileage: vehicle?.mileage,
              photos: [],
              createdAt: rental.activatedAt ?? rental.startDate,
            },
          ]
    return HttpResponse.json(
      await withLatency({
        rental,
        vehicle,
        invoices,
        events,
        swapRequests: mockSwapRequests.filter((s) => s.rentalId === id),
        swapEligibleFrom: mockSwapEligibleFrom(rental),
      })
    )
  }),
  http.post('/api/customer/rentals/:id/swap-requests', async ({ params, request }) => {
    const id = String(params.id)
    const { vehicleId, note } = (await request.json()) as { vehicleId?: string; note?: string }
    if (!vehicleId) return HttpResponse.json({ error: 'vehicleId required' }, { status: 400 })
    const db = getDb()
    const rental = db.rentals.find((r) => r.id === id)
    if (!rental) return HttpResponse.json({ error: 'Rental not found' }, { status: 404 })
    if (rental.status !== 'active') {
      return HttpResponse.json(
        { error: 'Swaps are only available on an active subscription' },
        { status: 409 }
      )
    }
    const eligibleFrom = mockSwapEligibleFrom(rental)
    if (!eligibleFrom || new Date(eligibleFrom) > new Date()) {
      return HttpResponse.json(
        {
          error: eligibleFrom
            ? `Swaps unlock on ${eligibleFrom.slice(0, 10)}`
            : 'Swaps unlock after handover',
        },
        { status: 409 }
      )
    }
    if (vehicleId === rental.vehicleId) {
      return HttpResponse.json({ error: 'That is already your current vehicle' }, { status: 400 })
    }
    const target = db.vehicles.find((v) => v.id === vehicleId)
    if (!target || target.dealerId !== rental.dealerId) {
      return HttpResponse.json(
        { error: 'Vehicle not found in your dealer’s fleet' },
        { status: 404 }
      )
    }
    if (target.status !== 'available') {
      return HttpResponse.json({ error: 'That vehicle is not currently available' }, { status: 409 })
    }
    if (mockSwapRequests.some((s) => s.rentalId === id && s.status === 'pending')) {
      return HttpResponse.json({ error: 'You already have a pending swap request' }, { status: 409 })
    }
    const swap: SwapRequest = {
      id: createId('swap'),
      rentalId: id,
      customerId: rental.customerId,
      currentVehicleId: rental.vehicleId,
      requestedVehicleId: vehicleId,
      status: 'pending',
      note,
      createdAt: new Date().toISOString(),
    }
    mockSwapRequests = [swap, ...mockSwapRequests]
    return HttpResponse.json(await withLatency(swap), { status: 201 })
  }),
  http.patch('/api/customer/swap-requests/:id/cancel', async ({ params }) => {
    const id = String(params.id)
    const swap = mockSwapRequests.find((s) => s.id === id && s.status === 'pending')
    if (!swap) return HttpResponse.json({ error: 'Not found or already resolved' }, { status: 404 })
    const updated: SwapRequest = { ...swap, status: 'cancelled', resolvedAt: new Date().toISOString() }
    mockSwapRequests = mockSwapRequests.map((s) => (s.id === id ? updated : s))
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

  // Mock mode has no real gateway, so the invoice "payment" settles right
  // away: the invoice flips to paid and a past_due subscription recovers (the
  // real API does this from the SkipCash webhook).
  http.post('/api/payments/skipcash/invoice-intent', async ({ request }) => {
    const { invoiceId } = (await request.json()) as { invoiceId?: string }
    if (!invoiceId) return HttpResponse.json({ error: 'invoiceId required' }, { status: 400 })
    const db = getDb()
    const invoice = db.invoices.find(
      (inv) => inv.id === invoiceId && inv.ownerType === 'customer'
    )
    if (!invoice) return HttpResponse.json({ error: 'Invoice not found' }, { status: 404 })
    if (invoice.status !== 'due' && invoice.status !== 'overdue') {
      return HttpResponse.json(
        { error: `Invoice is ${invoice.status}; nothing to pay` },
        { status: 409 }
      )
    }
    const paymentId = createId('pay')
    updateDb((current) => ({
      ...current,
      invoices: current.invoices.map((inv) =>
        inv.id === invoiceId ? { ...inv, status: 'paid' as const } : inv
      ),
      rentals: current.rentals.map((r) =>
        r.id === invoice.rentalId && r.status === 'past_due'
          ? { ...r, status: 'active' as const }
          : r
      ),
      payments: [
        {
          id: paymentId,
          customerId: invoice.ownerId,
          rentalId: invoice.rentalId,
          invoiceId,
          amount: invoice.amount,
          status: 'completed' as const,
          type: 'subscription' as const,
          method: 'card' as const,
          provider: 'skipcash',
          createdAt: new Date().toISOString(),
        },
        ...current.payments,
      ],
    }))
    return HttpResponse.json(
      await withLatency({ paymentId, payUrl: `/payment-status?paymentId=${paymentId}&mock=1` })
    )
  }),

  http.post('/api/auth/resend-verification', async () =>
    HttpResponse.json(await withLatency({ ok: true }))
  ),

  http.post('/api/auth/2fa/verify-login', async () =>
    HttpResponse.json(await withLatency({ ok: true }))
  ),
  http.post('/api/customer/rentals/:rentalId/extend', async () =>
    HttpResponse.json(await withLatency({ ok: true }))
  ),
  http.post('/api/customer/rentals/:rentalId/reviews', async () =>
    HttpResponse.json(await withLatency({ ok: true }), { status: 201 })
  ),
  http.get('/api/customer/rentals/:rentalId/reviews', async () =>
    HttpResponse.json(await withLatency([]))
  ),
  http.patch('/api/customer/messages/:id/read', async () =>
    HttpResponse.json(await withLatency({ ok: true }))
  ),
  http.patch('/api/customer/messages/:id/folder', async () =>
    HttpResponse.json(await withLatency({ ok: true }))
  ),
  http.post('/api/customer/promo-codes/validate', async () =>
    HttpResponse.json(await withLatency({ valid: false }))
  ),
  http.post('/api/customer/payment-methods', async () =>
    HttpResponse.json(
      await withLatency({
        id: createId('pm'),
        brand: 'Visa',
        last4: '4242',
        expiryMonth: 12,
        expiryYear: 2028,
        isDefault: false,
        methodType: 'card',
      }),
      { status: 201 }
    )
  ),
  http.get('/api/customer/messages', async () => HttpResponse.json(await withLatency([]))),
  http.get('/api/customer/messages/unread-count', async () =>
    HttpResponse.json(await withLatency({ count: 0 }))
  ),
  http.get('/api/customer/preferences', async () =>
    HttpResponse.json(await withLatency({ emailNotifications: true, smsNotifications: false }))
  ),
  http.patch('/api/customer/preferences', async ({ request }) =>
    HttpResponse.json(await withLatency(await request.json()))
  ),
  http.get('/api/customer/profile/billing-address', async () =>
    HttpResponse.json(await withLatency(null))
  ),
  http.patch('/api/customer/profile/billing-address', async ({ request }) =>
    HttpResponse.json(await withLatency(await request.json()))
  ),
  http.get('/api/customer/security', async () =>
    HttpResponse.json(
      await withLatency({
        totpEnabled: false,
        smsVerified: false,
        smsPhone: null,
        smsVerificationAvailable: true,
        smsProviderConfigured: false,
        smsDevFallback: true,
      })
    )
  ),
  http.post('/api/customer/security/2fa/setup', async () =>
    HttpResponse.json(await withLatency({ secret: 'MOCK2FA', qrCodeUrl: '' }))
  ),
  http.post('/api/customer/security/2fa/enable', async () =>
    HttpResponse.json(await withLatency({ ok: true }))
  ),
  http.post('/api/customer/security/2fa/disable', async () =>
    HttpResponse.json(await withLatency({ ok: true }))
  ),
  http.post('/api/customer/security/sms/send', async () =>
    HttpResponse.json(await withLatency({ ok: true }))
  ),
  http.post('/api/customer/security/sms/verify', async () =>
    HttpResponse.json(await withLatency({ ok: true }))
  ),
]
