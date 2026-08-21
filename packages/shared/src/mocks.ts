import type {
  Complaint,
  Dealer,
  Favorite,
  Invoice,
  BookingRequest,
  Lead,
  Message,
  Notification,
  Payment,
  Plan,
  Rental,
  Subscription,
  User,
  Vehicle,
} from './types'

export const MOCK_USERS: User[] = [
  {
    id: 'user_admin_1',
    email: 'admin@carflow.com',
    name: 'Alex Admin',
    role: 'admin',
    createdAt: '2025-10-01',
  },
  {
    id: 'user_dealer_1',
    email: 'dealer@carflow.com',
    name: 'Dana Dealer',
    role: 'dealer',
    createdAt: '2025-10-10',
  },
  {
    id: 'user_customer_1',
    email: 'customer@carflow.com',
    name: 'Chris Customer',
    role: 'customer',
    createdAt: '2025-10-15',
  },
]

export const MOCK_DEALERS: Dealer[] = [
  {
    id: 'dealer_1',
    name: 'Cityline Autos',
    ownerUserId: 'user_dealer_1',
    status: 'active',
    planId: 'plan_pro',
    rating: 4.7,
    totalRevenue: 128450,
    activeRentals: 12,
    vehiclesCount: 54,
    contactEmail: 'dealer@carflow.com',
    createdAt: '2025-10-10',
  },
]

export const MOCK_VEHICLES: Vehicle[] = [
  {
    id: 'veh_1',
    dealerId: 'dealer_1',
    name: 'Tesla Model 3',
    make: 'Tesla',
    model: 'Model 3',
    year: 2024,
    category: 'ev',
    status: 'available',
    pricePerDay: 149,
    mileage: 8000,
    transmission: 'automatic',
    fuelType: 'electric',
    seats: 5,
  },
  {
    id: 'veh_2',
    dealerId: 'dealer_1',
    name: 'BMW X5',
    make: 'BMW',
    model: 'X5',
    year: 2023,
    category: 'luxury',
    status: 'rented',
    pricePerDay: 189,
    mileage: 12000,
    transmission: 'automatic',
    fuelType: 'gas',
    seats: 5,
  },
]

export const MOCK_RENTALS: Rental[] = [
  {
    id: 'rental_1',
    customerId: 'user_customer_1',
    dealerId: 'dealer_1',
    vehicleId: 'veh_1',
    startDate: '2026-01-10',
    endDate: '2026-01-15',
    status: 'active',
    totalAmount: 745,
    paymentStatus: 'completed',
    createdAt: '2026-01-05',
    monthlyAmount: 745,
    termMonths: 1,
    nextBillingDate: '2026-02-10',
  },
]

export const MOCK_PAYMENTS: Payment[] = [
  {
    id: 'pay_1',
    rentalId: 'rental_1',
    customerId: 'user_customer_1',
    dealerId: 'dealer_1',
    amount: 745,
    status: 'completed',
    type: 'rental',
    method: 'card',
    createdAt: '2026-01-05',
  },
]

export const MOCK_PLANS: Plan[] = [
  {
    id: 'plan_starter',
    name: 'Starter',
    tier: 'starter',
    status: 'active',
    priceMonthly: 49,
    priceYearly: 499,
    features: ['10 vehicles', 'Basic analytics', 'Email support'],
  },
  {
    id: 'plan_pro',
    name: 'Professional',
    tier: 'professional',
    status: 'active',
    priceMonthly: 99,
    priceYearly: 999,
    features: ['50 vehicles', 'Advanced analytics', 'Priority support'],
  },
  {
    id: 'plan_enterprise',
    name: 'Enterprise',
    tier: 'enterprise',
    status: 'active',
    priceMonthly: 199,
    priceYearly: 1999,
    features: ['Unlimited vehicles', 'Custom analytics', 'Dedicated support'],
  },
]

export const MOCK_SUBSCRIPTIONS: Subscription[] = [
  {
    id: 'sub_1',
    ownerId: 'dealer_1',
    ownerType: 'dealer',
    planId: 'plan_pro',
    status: 'active',
    startDate: '2025-11-01',
    usage: {
      rentals: 24,
      listings: 42,
      messages: 120,
    },
  },
]

export const MOCK_INVOICES: Invoice[] = [
  {
    id: 'inv_1',
    ownerId: 'dealer_1',
    ownerType: 'dealer',
    amount: 99,
    status: 'paid',
    date: '2025-12-01',
    description: 'Professional plan monthly',
  },
]

export const MOCK_BOOKING_REQUESTS: BookingRequest[] = [
  {
    id: 'req_1',
    customerId: 'user_customer_1',
    vehicleId: 'veh_2',
    status: 'pending',
    createdAt: '2026-01-09',
    note: 'Need delivery to downtown.',
  },
]

export const MOCK_FAVORITES: Favorite[] = [
  {
    id: 'fav_1',
    customerId: 'user_customer_1',
    vehicleId: 'veh_1',
    createdAt: '2026-01-04',
  },
]

export const MOCK_COMPLAINTS: Complaint[] = [
  {
    id: 'cmp_1',
    customerId: 'user_customer_1',
    category: 'Payment',
    priority: 'high',
    status: 'open',
    subject: 'Refund pending',
    description: 'Waiting for refund on cancelled rental.',
    createdAt: '2026-01-08',
  },
]

export const MOCK_MESSAGES: Message[] = [
  {
    id: 'msg_1',
    fromUserId: 'user_customer_1',
    toUserId: 'user_dealer_1',
    subject: 'Rental extension',
    body: 'Can I extend my booking by two days?',
    read: false,
    folder: 'inbox',
    createdAt: '2026-01-09',
  },
]

export const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: 'notif_1',
    userId: 'user_dealer_1',
    type: 'info',
    title: 'New rental',
    message: 'Tesla Model 3 booked for Jan 10-15.',
    read: false,
    createdAt: '2026-01-06',
  },
]

export const MOCK_LEADS: Lead[] = [
  {
    id: 'lead_1',
    dealerId: 'dealer_1',
    name: 'Morgan Lee',
    email: 'morgan@example.com',
    phone: '+1 555-0192',
    source: 'Website',
    stage: 'new',
    createdAt: '2026-01-07',
  },
]
