export type UserRole = 'admin' | 'dealer' | 'customer'

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  phone?: string
  avatarUrl?: string
  createdAt: string
}

export type UserStatus = 'active' | 'suspended' | 'pending'

export interface Dealer {
  id: string
  name: string
  ownerUserId: string
  status: UserStatus
  planId: string
  rating: number
  totalRevenue: number
  activeRentals: number
  vehiclesCount: number
  contactEmail: string
  contactPhone?: string
  createdAt: string
}

export type CustomerStatus = 'active' | 'suspended' | 'verified' | 'unverified'

export interface CustomerProfile {
  id: string
  userId: string
  status: CustomerStatus
  joinDate: string
  rentalsCount: number
  totalSpent: number
}

export type VehicleStatus = 'available' | 'rented' | 'maintenance' | 'inactive'
export type VehicleCategory = 'sedan' | 'suv' | 'truck' | 'luxury' | 'ev' | 'other'

export interface Vehicle {
  id: string
  dealerId: string
  name: string
  make: string
  model: string
  year: number
  category: VehicleCategory
  status: VehicleStatus
  pricePerDay: number
  mileage: number
  transmission: 'automatic' | 'manual'
  fuelType: 'gas' | 'diesel' | 'electric' | 'hybrid'
  seats: number
  imageUrl?: string
}

export type RentalStatus = 'reserved' | 'active' | 'completed' | 'cancelled'
export type PaymentStatus = 'pending' | 'completed' | 'refunded' | 'failed'

export interface Rental {
  id: string
  customerId: string
  dealerId: string
  vehicleId: string
  startDate: string
  endDate: string
  status: RentalStatus
  totalAmount: number
  paymentStatus: PaymentStatus
  createdAt: string
}

export type PaymentType = 'rental' | 'subscription' | 'refund'
export type PaymentMethodType = 'card' | 'bank' | 'wallet'

export interface Payment {
  id: string
  rentalId?: string
  customerId?: string
  dealerId?: string
  amount: number
  status: PaymentStatus
  type: PaymentType
  method: PaymentMethodType
  createdAt: string
}

export type PlanStatus = 'draft' | 'active' | 'archived'
export type PlanTier = 'starter' | 'professional' | 'enterprise'

export interface Plan {
  id: string
  name: string
  tier: PlanTier
  status: PlanStatus
  priceMonthly: number
  priceYearly: number
  features: string[]
}

export type ComplaintPriority = 'low' | 'medium' | 'high' | 'urgent'
export type ComplaintStatus = 'open' | 'in_progress' | 'resolved'

export interface Complaint {
  id: string
  customerId: string
  category: string
  priority: ComplaintPriority
  status: ComplaintStatus
  subject: string
  description: string
  createdAt: string
  assignedTo?: string
}

export type MessageFolder = 'inbox' | 'sent' | 'starred' | 'archived'

export interface Message {
  id: string
  fromUserId: string
  toUserId: string
  subject: string
  body: string
  read: boolean
  folder: MessageFolder
  createdAt: string
}

export type NotificationType = 'info' | 'warning' | 'success' | 'error'

export interface Notification {
  id: string
  userId: string
  type: NotificationType
  title: string
  message: string
  read: boolean
  createdAt: string
}

export type LeadStage = 'new' | 'contacted' | 'qualified' | 'converted' | 'closed'

export interface Lead {
  id: string
  dealerId: string
  name: string
  email: string
  phone?: string
  source: string
  stage: LeadStage
  createdAt: string
}

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'canceled'
export type SubscriptionOwnerType = 'dealer' | 'customer'

export interface Subscription {
  id: string
  ownerId: string
  ownerType: SubscriptionOwnerType
  planId: string
  status: SubscriptionStatus
  startDate: string
  endDate?: string
  usage: {
    rentals: number
    listings: number
    messages: number
  }
}

export interface PaymentMethod {
  id: string
  brand: string
  last4: string
  expiryMonth: number
  expiryYear: number
  isDefault: boolean
  methodType: PaymentMethodType
}

export type InvoiceStatus = 'paid' | 'due' | 'overdue' | 'refunded'

export interface Invoice {
  id: string
  ownerId: string
  ownerType: SubscriptionOwnerType
  amount: number
  status: InvoiceStatus
  date: string
  description: string
}

export type BillingStatus = 'paid' | 'due' | 'overdue' | 'refunded'

export interface BillingHistoryItem {
  id: string
  date: string
  amount: number
  status: BillingStatus
  description: string
}

export type BookingRequestStatus = 'pending' | 'approved' | 'declined'

export interface BookingRequest {
  id: string
  customerId: string
  vehicleId: string
  status: BookingRequestStatus
  createdAt: string
  note?: string
}

export interface Favorite {
  id: string
  customerId: string
  vehicleId: string
  createdAt: string
}

export interface TimeSeriesPoint {
  date: string
  value: number
}

export interface KpiMetric {
  label: string
  value: number
  changePct?: number
}
