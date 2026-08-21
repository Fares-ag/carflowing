export type UserRole = 'admin' | 'dealer' | 'customer' | 'finance' | 'ops' | 'support'

/** Roles that may access the admin portal (full admin + split ops roles). */
export const ADMIN_PORTAL_ROLES = ['admin', 'finance', 'ops', 'support'] as const
export type AdminPortalRole = (typeof ADMIN_PORTAL_ROLES)[number]

export function isAdminPortalRole(role: string): role is AdminPortalRole {
  return (ADMIN_PORTAL_ROLES as readonly string[]).includes(role)
}

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
  status?: UserStatus
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
  address?: string
  logoUrl?: string
  bankAccountName?: string
  bankName?: string
  bankIban?: string
  bankDetailsVerifiedAt?: string
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
  imageUrls?: string[]
  description?: string
  color?: string
  mileageCapKm?: number
  features?: string[]
  licensePlate?: string
  locationCity?: string
  locationArea?: string
  latitude?: number
  longitude?: number
  /** Average star rating from completed rental reviews (1–5). */
  averageRating?: number
  /** Number of customer reviews for this vehicle. */
  reviewCount?: number
}

/** A published customer review for a vehicle (browse/detail). */
export interface VehicleReview {
  id: string
  rentalId: string
  vehicleId: string
  dealerId: string
  rating: number
  comment?: string
  createdAt: string
  /** First name only on public surfaces. */
  customerName?: string
  dealerResponse?: string
  dealerRespondedAt?: string
}

export interface VehicleReviewList {
  averageRating: number
  reviewCount: number
  items: VehicleReview[]
  page: number
  pageSize: number
  total: number
}

/** Dealer-portal view of a customer review (includes full customer name). */
export interface DealerReview {
  id: string
  rentalId: string
  vehicleId: string
  vehicleName?: string
  customerId: string
  customerName?: string
  rating: number
  comment?: string
  createdAt: string
  dealerResponse?: string
  dealerRespondedAt?: string
}

export type RentalStatus = 'reserved' | 'active' | 'paused' | 'past_due' | 'completed' | 'cancelled'
export type PaymentStatus = 'pending' | 'completed' | 'refunded' | 'failed'

export interface Rental {
  id: string
  customerId: string
  dealerId: string
  vehicleId: string
  bookingRequestId?: string
  startDate: string
  endDate: string
  status: RentalStatus
  totalAmount: number
  paymentStatus: PaymentStatus
  pickupLocation?: string
  pickupDate?: string
  pickupTime?: string
  /** Dealer-marked delivery/handover progress for the initial pickup. */
  pickupFulfilmentStatus?: 'scheduled' | 'delivered'
  /** Customer-requested collection slot when cancelling. */
  returnLocation?: string
  returnDate?: string
  returnTime?: string
  createdAt: string
  /** Recurring monthly price (invygo/FINN-style subscription cycle). */
  monthlyAmount: number
  /** Minimum term in months; the subscription rolls monthly afterwards. */
  termMonths: number
  /** Start of the next unbilled period; absent once billing stops. */
  nextBillingDate?: string
  cancelRequestedAt?: string
  /** Billing-boundary date the subscription ends after a cancel request. */
  cancellationEffectiveDate?: string
  cancelReason?: string
  activatedAt?: string
  completedAt?: string
  /** Refundable deposit collected on the first invoice when configured. */
  depositAmount?: number
  depositRefundable?: boolean
  /** Amount released back to the customer at return. */
  depositResolvedAmount?: number
  /** Amount withheld from the deposit at return. */
  depositWithheldAmount?: number
  depositResolutionNote?: string
  depositResolvedAt?: string
  /** When the customer paused the subscription (travel hold). */
  pausedAt?: string
  /** Latest calendar date the pause may run. */
  pausedUntil?: string
  pauseReason?: string
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
  /** Payment gateway that processed this payment, e.g. `manual` (offline) or `skipcash`. */
  provider?: string
  /** Gateway-side transaction/payment id, when processed by an online provider. */
  externalTransactionId?: string
  /** Vehicle the payment intent was created for, before a booking request exists. */
  vehicleId?: string
  /** Booking request created once an online payment is confirmed. */
  bookingRequestId?: string
  /** Checkout cart JSON, carried over to the booking request created on payment success. */
  note?: string
  /** Ops flag when customer paid but booking creation failed. */
  needsRefund?: boolean
  /** Subscription invoice this payment settles, when applicable. */
  invoiceId?: string
  /** Total amount refunded against this payment so far. */
  refundedAmount?: number
  /** For type='refund' rows: the original payment being refunded. */
  refundOfPaymentId?: string
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

export interface ComplaintReply {
  id: string
  complaintId: string
  authorId: string
  body: string
  createdAt: string
  authorName?: string
  authorEmail?: string
  authorRole?: UserRole
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
export type LeadPriority = 'low' | 'medium' | 'high'

export interface Lead {
  id: string
  dealerId: string
  name: string
  email: string
  phone?: string
  source: string
  stage: LeadStage
  priority?: LeadPriority
  notes?: string
  createdAt: string
}

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'canceled'
export type SubscriptionOwnerType = 'dealer' | 'customer'

export interface SubscriptionPlanSummary {
  name: string
  priceMonthly: number
  priceYearly: number
  features: string[]
}

export interface Subscription {
  id: string
  ownerId: string
  ownerType: SubscriptionOwnerType
  planId: string
  status: SubscriptionStatus
  startDate: string
  endDate?: string
  /** Present when loaded with plan join (e.g. dealer billing). */
  plan?: SubscriptionPlanSummary
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

export type InvoiceStatus = 'paid' | 'due' | 'overdue' | 'refunded' | 'void'

export interface Invoice {
  id: string
  ownerId: string
  ownerType: SubscriptionOwnerType
  amount: number
  status: InvoiceStatus
  date: string
  description: string
  /** Subscription (rental) this invoice bills, for monthly-cycle invoices. */
  rentalId?: string
  dueDate?: string
  periodStart?: string
  periodEnd?: string
}

export type RentalEventType = 'pickup' | 'return' | 'swap_out' | 'swap_in' | 'inspection' | 'note'

/** Physical-world record: handover, return, swap, inspection. */
export interface RentalEvent {
  id: string
  rentalId: string
  type: RentalEventType
  mileage?: number
  fuelLevel?: string
  conditionNotes?: string
  photos: string[]
  recordedBy?: string
  createdAt: string
}

export type SwapRequestStatus = 'pending' | 'approved' | 'declined' | 'cancelled'

/** invygo-style car swap within the same dealer fleet. */
export interface SwapRequest {
  id: string
  rentalId: string
  customerId: string
  currentVehicleId: string
  requestedVehicleId: string
  status: SwapRequestStatus
  note?: string
  declineReason?: string
  createdAt: string
  resolvedAt?: string
}

export interface AuditLog {
  id: string
  actorId?: string
  actorRole?: string
  action: string
  entityType: string
  entityId?: string
  before?: unknown
  after?: unknown
  note?: string
  createdAt: string
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
  /** Set when status is `declined`; shown to the customer as the dealer's explanation. */
  declineReason?: string
  /** True while an online payment holds this vehicle (hidden from dealers until paid). */
  awaitingPayment?: boolean
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
