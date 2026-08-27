import type {
  BillingCapabilities,
  BookingRequest,
  BookingRequestStatus,
  Invoice,
  Message,
  PaymentMethod,
  Rental,
  RentalEvent,
  RentalStatus,
  Subscription,
  SwapRequest,
  VehicleReview,
} from '@carflow/shared'
import { createId, getDb, paginate, updateDb, withLatency } from '@carflow/shared'
import { http, HttpResponse } from 'msw'
import type {
  CustomerDashboardData,
  CustomerMessage,
  MaintenanceRequest,
  MessageThreadSummary,
} from '../services/customerService'

const parseListParams = (request: Request) => {
  const url = new URL(request.url)
  const page = Number(url.searchParams.get('page') ?? '1')
  const pageSize = Number(url.searchParams.get('pageSize') ?? '10')
  return { page, pageSize }
}

const CANCEL_NOTICE_DAYS = 30
const SWAP_ELIGIBLE_DAYS = 30
/** Mirrors the MAX_PAUSE_DAYS business setting the real API validates against. */
const MAX_PAUSE_DAYS = 90
/** Mock deposit so the checkout deposit line renders; production defaults to 0. */
const SUBSCRIPTION_DEPOSIT_AMOUNT = 1000

const isoDate = (d: Date) => d.toISOString().slice(0, 10)

const addDays = (base: Date | string, days: number) => {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

/** Mock-only swap request store (the real API persists these server-side). */
let mockSwapRequests: SwapRequest[] = []

/** Mock-only maintenance request store (the real API persists these server-side). */
let mockMaintenanceRequests: MaintenanceRequest[] = []

/** The signed-in customer, resolved the same way `/api/auth/me` does. */
const currentCustomerId = (): string => {
  const db = getDb()
  return (db.users.find((u) => u.role === 'customer') ?? db.users[0]).id
}

/**
 * Thread subjects carry a `[cf:rental:<id>]` tag so replies group by rental.
 * The API pins the id to a UUID; mock ids are `rental_1`-style, so this is the
 * same tag with a looser id pattern.
 */
const THREAD_TAG_RE = /^\[cf:(rental|booking):([\w-]+)\]/i

const displaySubject = (subject: string) => subject.replace(THREAD_TAG_RE, '').trim() || subject

/** Newest first, matching the API's `order by created_at desc`. */
const byNewestFirst = (a: { createdAt: string }, b: { createdAt: string }) =>
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()

/**
 * One entry per thread, newest message first — mirrors `listMessageThreads` in
 * apps/backend/src/services/messages.ts.
 */
const buildMessageThreads = (userId: string): MessageThreadSummary[] => {
  const db = getDb()
  const visible = db.messages
    .filter(
      (m) =>
        (m.fromUserId === userId && m.folder === 'sent') ||
        (m.toUserId === userId && m.folder === 'inbox')
    )
    .sort(byNewestFirst)

  const threads = new Map<string, MessageThreadSummary>()
  for (const message of visible) {
    if (threads.has(message.subject)) continue
    const counterpartId = message.fromUserId === userId ? message.toUserId : message.fromUserId
    const counterpart = db.users.find((u) => u.id === counterpartId)
    const sender = db.users.find((u) => u.id === message.fromUserId)
    threads.set(message.subject, {
      threadSubject: message.subject,
      displaySubject: displaySubject(message.subject),
      lastMessage: { ...message, fromName: sender?.name, fromEmail: sender?.email },
      unreadCount: db.messages.filter(
        (m) =>
          m.subject === message.subject &&
          m.toUserId === userId &&
          m.folder === 'inbox' &&
          !m.read
      ).length,
      participantName: counterpart?.name,
      participantEmail: counterpart?.email,
    })
  }
  return Array.from(threads.values())
}

/** Oldest first, the order the thread view renders. */
const buildThreadMessages = (userId: string, threadSubject: string): CustomerMessage[] => {
  const db = getDb()
  return db.messages
    .filter(
      (m) =>
        m.subject === threadSubject && (m.fromUserId === userId || m.toUserId === userId)
    )
    .sort((a, b) => byNewestFirst(b, a))
    .map((message) => {
      const sender = db.users.find((u) => u.id === message.fromUserId)
      return { ...message, fromName: sender?.name, fromEmail: sender?.email }
    })
}

/**
 * Seeded vehicle reviews. Shaped like `listVehicleReviews` in
 * apps/backend/src/services/reviews.ts: first name only on public surfaces,
 * optional dealer response.
 */
const mockVehicleReviews = (vehicleId: string): VehicleReview[] => {
  const vehicle = getDb().vehicles.find((v) => v.id === vehicleId)
  if (!vehicle) return []
  return [
    {
      id: `rev_${vehicleId}_1`,
      rentalId: 'rental_1',
      vehicleId,
      dealerId: vehicle.dealerId,
      rating: 5,
      comment: 'Delivered to my building in West Bay, spotless and on time.',
      createdAt: '2026-01-18T09:30:00.000Z',
      customerName: 'Chris',
      dealerResponse: 'Thank you — see you at the next service.',
      dealerRespondedAt: '2026-01-19T07:00:00.000Z',
    },
    {
      id: `rev_${vehicleId}_2`,
      rentalId: 'rental_2',
      vehicleId,
      dealerId: vehicle.dealerId,
      rating: 4,
      comment: 'Great car; the service booking took a couple of days.',
      createdAt: '2026-01-04T16:45:00.000Z',
      customerName: 'Noor',
    },
  ]
}

/** Same one-decimal rounding as `roundRating` in the reviews service. */
const roundRating = (value: number) => Math.round(value * 10) / 10

/**
 * Mock settlement for an online invoice payment: the invoice flips to paid and
 * a past_due subscription recovers (the real API does this from the SkipCash
 * webhook, which mock mode has no gateway to deliver).
 */
const settleInvoiceInMock = (
  invoiceId: string
): { status: number; body: { paymentId: string; payUrl: string } | { error: string } } => {
  const db = getDb()
  const invoice = db.invoices.find((inv) => inv.id === invoiceId && inv.ownerType === 'customer')
  if (!invoice) return { status: 404, body: { error: 'Invoice not found' } }
  if (invoice.status !== 'due' && invoice.status !== 'overdue') {
    return { status: 409, body: { error: `Invoice is ${invoice.status}; nothing to pay` } }
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
  return {
    status: 200,
    body: { paymentId, payUrl: `/payment-status?paymentId=${paymentId}&mock=1` },
  }
}

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
  http.get('/api/customer/pricing-settings', async () =>
    HttpResponse.json(
      await withLatency({ subscriptionDepositAmount: SUBSCRIPTION_DEPOSIT_AMOUNT })
    )
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
  http.get('/api/customer/vehicles/:vehicleId/reviews', async ({ params, request }) => {
    const { page, pageSize } = parseListParams(request)
    const reviews = mockVehicleReviews(String(params.vehicleId))
    const paged = paginate(reviews, page, pageSize)
    const averageRating = reviews.length
      ? roundRating(reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length)
      : 0
    return HttpResponse.json(
      await withLatency({
        averageRating,
        reviewCount: reviews.length,
        items: paged.items,
        page: paged.page,
        pageSize: paged.pageSize,
        total: paged.total,
      })
    )
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
  /**
   * Travel hold. Mirrors `pauseRental` in the lifecycle service: only an active
   * subscription with no overdue invoice and no scheduled cancellation can be
   * paused, for at most MAX_PAUSE_DAYS.
   */
  http.post('/api/customer/rentals/:rentalId/pause', async ({ params, request }) => {
    const id = String(params.rentalId)
    const payload = (await request.json().catch(() => ({}))) as
      | { days?: number; reason?: string }
      | null
    const rental = getDb().rentals.find((r) => r.id === id)
    if (!rental) return HttpResponse.json({ error: 'Rental not found' }, { status: 404 })
    if (rental.status === 'past_due') {
      return HttpResponse.json(
        {
          error:
            'Cannot pause a subscription with overdue payments. Pay outstanding invoices first.',
        },
        { status: 409 }
      )
    }
    if (rental.status !== 'active') {
      return HttpResponse.json(
        { error: `Cannot pause a rental in status "${rental.status}"` },
        { status: 409 }
      )
    }
    if (rental.cancellationEffectiveDate) {
      return HttpResponse.json(
        { error: 'Cannot pause a subscription that is pending cancellation' },
        { status: 409 }
      )
    }
    const days = payload?.days ?? MAX_PAUSE_DAYS
    if (!Number.isFinite(days) || days < 1 || days > MAX_PAUSE_DAYS) {
      return HttpResponse.json(
        { error: `Pause duration must be between 1 and ${MAX_PAUSE_DAYS} days` },
        { status: 400 }
      )
    }
    const now = new Date()
    const updated: Rental = {
      ...rental,
      status: 'paused',
      pausedAt: now.toISOString(),
      pausedUntil: isoDate(addDays(now, days)),
      pauseReason: payload?.reason?.trim() || undefined,
    }
    updateDb((current) => ({
      ...current,
      rentals: current.rentals.map((r) => (r.id === id ? updated : r)),
    }))
    return HttpResponse.json(await withLatency(updated))
  }),
  /** Unpause and push the billing/return dates out by the days spent on hold. */
  http.post('/api/customer/rentals/:rentalId/resume', async ({ params }) => {
    const id = String(params.rentalId)
    const rental = getDb().rentals.find((r) => r.id === id)
    if (!rental) return HttpResponse.json({ error: 'Rental not found' }, { status: 404 })
    if (rental.status !== 'paused') {
      return HttpResponse.json(
        { error: `Cannot resume a rental in status "${rental.status}"` },
        { status: 409 }
      )
    }
    if (!rental.pausedAt) {
      return HttpResponse.json({ error: 'This rental is not paused' }, { status: 409 })
    }
    const pausedDays = Math.max(
      0,
      Math.floor((Date.now() - new Date(rental.pausedAt).getTime()) / 86_400_000)
    )
    const updated: Rental = {
      ...rental,
      status: 'active',
      pausedAt: undefined,
      pausedUntil: undefined,
      pauseReason: undefined,
      nextBillingDate:
        rental.nextBillingDate && pausedDays > 0
          ? isoDate(addDays(rental.nextBillingDate, pausedDays))
          : rental.nextBillingDate,
      endDate: pausedDays > 0 ? isoDate(addDays(rental.endDate, pausedDays)) : rental.endDate,
    }
    updateDb((current) => ({
      ...current,
      rentals: current.rentals.map((r) => (r.id === id ? updated : r)),
    }))
    return HttpResponse.json(await withLatency(updated))
  }),
  http.get('/api/customer/rentals/:rentalId/maintenance-requests', async ({ params }) => {
    const id = String(params.rentalId)
    const rental = getDb().rentals.find((r) => r.id === id)
    if (!rental) return HttpResponse.json({ error: 'Rental not found' }, { status: 404 })
    return HttpResponse.json(
      await withLatency({
        items: mockMaintenanceRequests.filter((m) => m.rentalId === id).sort(byNewestFirst),
      })
    )
  }),
  http.post('/api/customer/rentals/:rentalId/maintenance-requests', async ({ params, request }) => {
    const id = String(params.rentalId)
    const payload = (await request.json()) as {
      description?: string
      title?: string
      photos?: string[]
    }
    const rental = getDb().rentals.find((r) => r.id === id)
    if (!rental) return HttpResponse.json({ error: 'Rental not found' }, { status: 404 })
    // Same statuses the API accepts (services/maintenance.ts ACTIVE_RENTAL_STATUSES).
    if (!['reserved', 'active', 'past_due'].includes(rental.status)) {
      return HttpResponse.json(
        { error: 'Maintenance requests are only allowed for active subscriptions' },
        { status: 409 }
      )
    }
    if (!payload.description?.trim()) {
      return HttpResponse.json({ error: 'description is required' }, { status: 400 })
    }
    const created: MaintenanceRequest = {
      id: createId('mnt'),
      vehicleId: rental.vehicleId,
      dealerId: rental.dealerId,
      rentalId: rental.id,
      status: 'requested',
      title: payload.title?.trim() || 'Service request',
      description: payload.description.trim(),
      reportedBy: rental.customerId,
      photos: payload.photos ?? [],
      scheduledAt: null,
      source: 'customer',
      completedAt: null,
      createdAt: new Date().toISOString(),
    }
    mockMaintenanceRequests = [created, ...mockMaintenanceRequests]
    return HttpResponse.json(await withLatency(created), { status: 201 })
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
    const result = settleInvoiceInMock(invoiceId)
    return HttpResponse.json(await withLatency(result.body), { status: result.status })
  }),

  /**
   * Saved-card invoice payment. The real API only charges a stored SkipCash
   * token once the charge stub is wired; until then it reports the attempt and
   * falls back to hosted checkout, which is what this mirrors (and what
   * `/customer/billing-capabilities` advertises below).
   */
  http.post('/api/payments/skipcash/invoice-intent-saved-card', async ({ request }) => {
    const { invoiceId, paymentMethodId } = (await request.json()) as {
      invoiceId?: string
      paymentMethodId?: string
    }
    if (!invoiceId || !paymentMethodId) {
      return HttpResponse.json({ error: 'invoiceId and paymentMethodId required' }, { status: 400 })
    }
    if (!getDb().paymentMethods.some((pm) => pm.id === paymentMethodId)) {
      return HttpResponse.json({ error: 'Payment method not found' }, { status: 404 })
    }
    const result = settleInvoiceInMock(invoiceId)
    if (result.status >= 400) {
      return HttpResponse.json(await withLatency(result.body), { status: result.status })
    }
    return HttpResponse.json(
      await withLatency({
        ...result.body,
        savedCardAttempted: true,
        savedCardUsed: false,
        message:
          'Saved-card charge is not wired yet — redirecting to SkipCash hosted checkout (standard flow).',
      }),
      { status: 201 }
    )
  }),

  /**
   * Retry a failed or timed-out attempt. Mirrors the API: completed/refunded
   * payments cannot be retried, a stale `pending` row is abandoned, and the
   * caller gets a fresh intent.
   */
  http.post('/api/payments/skipcash/retry/:paymentId', async ({ params }) => {
    const paymentId = String(params.paymentId)
    const original = getDb().payments.find((p) => p.id === paymentId)
    if (!original) return HttpResponse.json({ error: 'Payment not found' }, { status: 404 })
    if (original.status === 'completed') {
      return HttpResponse.json({ error: 'This payment has already completed' }, { status: 409 })
    }
    if (original.status === 'refunded') {
      return HttpResponse.json({ error: 'This payment was refunded' }, { status: 409 })
    }
    if (original.type === 'subscription' && original.invoiceId) {
      const result = settleInvoiceInMock(original.invoiceId)
      return HttpResponse.json(await withLatency(result.body), {
        status: result.status >= 400 ? result.status : 201,
      })
    }
    const retryId = createId('pay')
    updateDb((current) => ({
      ...current,
      payments: [
        {
          ...original,
          id: retryId,
          status: 'completed' as const,
          createdAt: new Date().toISOString(),
        },
        ...current.payments.map((p) =>
          p.id === paymentId && p.status === 'pending' ? { ...p, status: 'failed' as const } : p
        ),
      ],
    }))
    return HttpResponse.json(
      await withLatency({ paymentId: retryId, payUrl: `/payment-status?paymentId=${retryId}&mock=1` }),
      { status: 201 }
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
  http.get('/api/customer/messages', async ({ request }) => {
    const { page, pageSize } = parseListParams(request)
    const url = new URL(request.url)
    const folder = url.searchParams.get('folder') ?? 'inbox'
    const db = getDb()
    const userId = currentCustomerId()
    const items: CustomerMessage[] = db.messages
      .filter(
        (m) =>
          m.folder === folder && (folder === 'sent' ? m.fromUserId === userId : m.toUserId === userId)
      )
      .sort(byNewestFirst)
      .map((message) => {
        const sender = db.users.find((u) => u.id === message.fromUserId)
        return { ...message, fromName: sender?.name, fromEmail: sender?.email }
      })
    return HttpResponse.json(await withLatency(paginate(items, page, pageSize)))
  }),
  http.get('/api/customer/messages/unread-count', async () => {
    const userId = currentCustomerId()
    const count = getDb().messages.filter(
      (m) => m.toUserId === userId && m.folder === 'inbox' && !m.read
    ).length
    return HttpResponse.json(await withLatency({ count }))
  }),
  http.get('/api/customer/messages/threads', async () =>
    HttpResponse.json(await withLatency(buildMessageThreads(currentCustomerId())))
  ),
  http.get('/api/customer/messages/thread', async ({ request }) => {
    const subject = new URL(request.url).searchParams.get('subject')?.trim()
    if (!subject) {
      return HttpResponse.json(
        { error: 'subject query parameter is required' },
        { status: 400 }
      )
    }
    return HttpResponse.json(
      await withLatency(buildThreadMessages(currentCustomerId(), subject))
    )
  }),
  /**
   * Compose/reply. Like the API, the thread subject is derived server-side (a
   * reply keeps the original subject, a rental-scoped message gets the
   * `[cf:rental:<id>]` tag) and both a `sent` and an `inbox` copy are stored.
   */
  http.post('/api/customer/messages', async ({ request }) => {
    const payload = (await request.json()) as {
      toUserId?: string
      body?: string
      subject?: string
      rentalId?: string
      bookingRequestId?: string
      replyToMessageId?: string
    }
    const db = getDb()
    if (!payload.toUserId || !payload.body?.trim()) {
      return HttpResponse.json({ error: 'toUserId and body are required' }, { status: 400 })
    }
    if (!db.users.some((u) => u.id === payload.toUserId)) {
      return HttpResponse.json({ error: 'Dealer not found' }, { status: 404 })
    }
    const original = payload.replyToMessageId
      ? db.messages.find((m) => m.id === payload.replyToMessageId)
      : undefined
    const subject = original
      ? original.subject
      : payload.rentalId
        ? `[cf:rental:${payload.rentalId}] ${payload.subject?.trim() || 'Rental conversation'}`
        : payload.bookingRequestId
          ? `[cf:booking:${payload.bookingRequestId}] ${payload.subject?.trim() || 'Booking conversation'}`
          : payload.subject?.trim()
    if (!subject) {
      return HttpResponse.json({ error: 'Could not resolve thread subject' }, { status: 400 })
    }
    const userId = currentCustomerId()
    const createdAt = new Date().toISOString()
    const sent: Message = {
      id: createId('msg'),
      fromUserId: userId,
      toUserId: payload.toUserId,
      subject,
      body: payload.body.trim(),
      read: true,
      folder: 'sent',
      createdAt,
    }
    const delivered: Message = { ...sent, id: createId('msg'), read: false, folder: 'inbox' }
    updateDb((current) => ({ ...current, messages: [sent, delivered, ...current.messages] }))
    return HttpResponse.json(await withLatency(sent), { status: 201 })
  }),
  /**
   * Append-only consent log. The API records IP and user agent server-side and
   * answers with no body of its own, so the client only sees the status.
   */
  http.post('/api/customer/consents', async ({ request }) => {
    const { consents } = (await request.json()) as {
      consents?: Array<{ documentKind?: string; documentVersion?: string }>
    }
    if (!Array.isArray(consents) || consents.length === 0) {
      return HttpResponse.json({ error: 'consents is required' }, { status: 400 })
    }
    if (consents.some((c) => !c.documentKind || !c.documentVersion)) {
      return HttpResponse.json(
        { error: 'documentKind and documentVersion are required' },
        { status: 400 }
      )
    }
    return HttpResponse.json(await withLatency({ recorded: consents.length }), { status: 201 })
  }),
  http.get('/api/customer/billing-capabilities', async () =>
    HttpResponse.json(
      await withLatency<BillingCapabilities>({
        skipcashSavedCardsEnabled: true,
        skipcashSavedCardsChargeReady: false,
        capabilityRequired:
          'SkipCash Tokenization: capture TokenId from the payment webhook, then charge renewals via POST /api/v1/payments with TokenId in the body.',
      })
    )
  ),
  http.get('/api/customer/referrals', async () =>
    HttpResponse.json(
      await withLatency({
        code: 'AB12CD34',
        shareUrl: 'http://localhost:5173/signup?ref=AB12CD34',
        creditBalance: 0,
        pendingReferrals: 0,
        creditedReferrals: 0,
        referrals: [],
      })
    )
  ),
  http.get('/api/customer/preferences', async () =>
    HttpResponse.json(
      await withLatency({
        emailNotifications: true,
        smsNotifications: false,
        whatsappNotifications: false,
      })
    )
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
