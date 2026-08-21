import {
  MOCK_BOOKING_REQUESTS,
  MOCK_COMPLAINTS,
  MOCK_DEALERS,
  MOCK_FAVORITES,
  MOCK_INVOICES,
  MOCK_LEADS,
  MOCK_MESSAGES,
  MOCK_NOTIFICATIONS,
  MOCK_PAYMENTS,
  MOCK_PLANS,
  MOCK_RENTALS,
  MOCK_SUBSCRIPTIONS,
  MOCK_USERS,
  MOCK_VEHICLES,
} from './mocks'
import type {
  BookingRequest,
  Complaint,
  Dealer,
  Favorite,
  Invoice,
  Lead,
  Message,
  Notification,
  Paginated,
  Payment,
  PaymentMethod,
  Plan,
  Rental,
  Subscription,
  User,
  Vehicle,
} from './types'

const STORAGE_KEY = 'carflow:mockdb'
const DEFAULT_LATENCY_MS = 250

const DEFAULT_PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: 'pm_1',
    brand: 'Visa',
    last4: '4242',
    expiryMonth: 12,
    expiryYear: 2026,
    isDefault: true,
    methodType: 'card',
  },
  {
    id: 'pm_2',
    brand: 'Mastercard',
    last4: '8855',
    expiryMonth: 8,
    expiryYear: 2027,
    isDefault: false,
    methodType: 'card',
  },
]

export interface MockDb {
  users: User[]
  dealers: Dealer[]
  vehicles: Vehicle[]
  rentals: Rental[]
  payments: Payment[]
  plans: Plan[]
  subscriptions: Subscription[]
  invoices: Invoice[]
  bookingRequests: BookingRequest[]
  favorites: Favorite[]
  complaints: Complaint[]
  complaintReplies: Array<{
    id: string
    complaintId: string
    authorId: string
    body: string
    createdAt: string
    authorName?: string
    authorRole?: string
  }>
  messages: Message[]
  notifications: Notification[]
  leads: Lead[]
  paymentMethods: PaymentMethod[]
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function clone<T>(data: T): T {
  return JSON.parse(JSON.stringify(data)) as T
}

function getDefaultDb(): MockDb {
  return {
    users: clone(MOCK_USERS),
    dealers: clone(MOCK_DEALERS),
    vehicles: clone(MOCK_VEHICLES),
    rentals: clone(MOCK_RENTALS),
    payments: clone(MOCK_PAYMENTS),
    plans: clone(MOCK_PLANS),
    subscriptions: clone(MOCK_SUBSCRIPTIONS),
    invoices: clone(MOCK_INVOICES),
    bookingRequests: clone(MOCK_BOOKING_REQUESTS),
    favorites: clone(MOCK_FAVORITES),
    complaints: clone(MOCK_COMPLAINTS),
    complaintReplies: [],
    messages: clone(MOCK_MESSAGES),
    notifications: clone(MOCK_NOTIFICATIONS),
    leads: clone(MOCK_LEADS),
    paymentMethods: clone(DEFAULT_PAYMENT_METHODS),
  }
}

let cachedDb: MockDb | null = null

export function getDb(): MockDb {
  if (cachedDb) {
    return cachedDb
  }
  if (!canUseStorage()) {
    cachedDb = getDefaultDb()
    return cachedDb
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    cachedDb = getDefaultDb()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedDb))
    return cachedDb
  }

  try {
    cachedDb = JSON.parse(raw) as MockDb
    return cachedDb
  } catch {
    cachedDb = getDefaultDb()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedDb))
    return cachedDb
  }
}

export function setDb(next: MockDb) {
  cachedDb = next
  if (!canUseStorage()) return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

export function updateDb(updater: (current: MockDb) => MockDb): MockDb {
  const next = updater(getDb())
  setDb(next)
  return next
}

export function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

export async function withLatency<T>(data: T, latencyMs: number = DEFAULT_LATENCY_MS): Promise<T> {
  await new Promise(resolve => setTimeout(resolve, latencyMs))
  return data
}

export function paginate<T>(items: T[], page: number = 1, pageSize: number = 10): Paginated<T> {
  const start = (page - 1) * pageSize
  const pagedItems = items.slice(start, start + pageSize)

  return {
    items: pagedItems,
    total: items.length,
    page,
    pageSize,
  }
}
