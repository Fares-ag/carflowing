import type {
  BookingRequest,
  Invoice,
  Lead,
  LeadStage,
  Message,
  MessageFolder,
  Notification,
  Paginated,
  Payment,
  PaymentMethod,
  PaymentMethodType,
  Rental,
  RentalEvent,
  RentalStatus,
  SwapRequest,
  Vehicle,
  VehicleStatus,
  DealerReview,
} from '@carflow/shared'
import { apiRequest } from '@carflow/shared'

export interface ListParams {
  page?: number
  pageSize?: number
}

export interface DealerDashboardRecentRental {
  id: string
  customerName: string
  vehicleName: string
  status: string
  createdAt: string
  paymentStatus: string
  totalAmount: number
}

export interface DealerDashboardData {
  kpis: Array<{ label: string; value: number }>
  revenueTrend: Array<{ date: string; value: number }>
  bookingTrend: Array<{ date: string; value: number }>
  revenueChartData: Array<{ month: string; revenue: number }>
  recentRentals: DealerDashboardRecentRental[]
  vehiclesWithStatus: Array<{ id: string; name: string; status: string }>
}

export interface DealerAnalyticsData {
  totalRevenue: number
  activeBookings: number
  newCustomersThisMonth: number
  fleetUtilization: number
  revenueTrend: Array<{ month: string; revenue: number; profit: number; createdAt: string }>
  customerDemographics: Array<{ name: string; value: number }>
  revenueBooking: Array<{ month: string; revenue: number; bookings: number }>
  bookingTime: Array<{ time: string; bookings: number }>
  utilization: Array<{ category: string; utilization: number }>
}

export interface DealerSettings {
  id: string
  name: string
  contactEmail: string
  contactPhone?: string
  website?: string
  address?: string
  description?: string
  licenseNumber?: string
  businessHours: Array<{
    day: string
    enabled: boolean
    startTime: string
    endTime: string
  }>
  logoUrl?: string
  bankAccountName?: string
  bankName?: string
  bankIban?: string
  bankDetailsVerifiedAt?: string
}

export interface BookingRequestWithVehicle extends BookingRequest {
  vehicle?: Vehicle
  customer?: { id: string; name: string; email: string }
}

export interface RentalCustomerSummary {
  id: string
  name: string
  email: string
}

export interface RentalWithRelations extends Rental {
  vehicle?: Vehicle
  customer?: RentalCustomerSummary
}

export interface RentalDetail extends RentalWithRelations {
  events: RentalEvent[]
  invoices: Invoice[]
}

export interface RentalHandoverInput {
  mileage?: number
  fuelLevel?: string
  conditionNotes?: string
  photos?: string[]
}

export interface RentalReturnInput extends RentalHandoverInput {
  vehicleNextStatus?: 'available' | 'maintenance'
  depositResolution?: {
    releaseAmount: number
    withheldAmount: number
    note?: string
  }
}

export interface SwapRequestWithRelations extends SwapRequest {
  currentVehicle?: Vehicle
  requestedVehicle?: Vehicle
  customer?: RentalCustomerSummary
}

export interface SwapDecisionInput {
  status: 'approved' | 'declined'
  declineReason?: string
  mileageOut?: number
  mileageIn?: number
}

export interface CustomerDocumentsForDealer {
  qidDocumentPath: string | null
  driversLicensePath: string | null
}

export type CreateVehicleInput = Omit<Vehicle, 'id' | 'dealerId'> & { id?: string }

export interface CreateLeadInput {
  name: string
  email: string
  phone?: string
  source?: string
  stage?: LeadStage
  priority?: string
  notes?: string
}

export async function getDealerDashboard(): Promise<DealerDashboardData> {
  return apiRequest('/dealer/dashboard')
}

export async function getDealerAnalytics(): Promise<DealerAnalyticsData> {
  return apiRequest('/dealer/analytics')
}

export async function listInventory(params: ListParams = {}): Promise<Paginated<Vehicle>> {
  return apiRequest('/dealer/inventory', { params: params as any })
}

export async function getCustomerDocumentsForDealer(
  customerId: string
): Promise<CustomerDocumentsForDealer> {
  return apiRequest(`/dealer/customer-documents/${customerId}`)
}

export async function listBookingRequests(
  params: ListParams = {}
): Promise<Paginated<BookingRequestWithVehicle>> {
  return apiRequest('/dealer/booking-requests', { params: params as any })
}

export async function updateBookingRequestStatus(
  id: string,
  status: BookingRequest['status'],
  declineReason?: string
): Promise<BookingRequest> {
  return apiRequest(`/dealer/booking-requests/${id}/status`, {
    method: 'PATCH',
    body: { status, declineReason },
  })
}

export async function listRentals(
  params: ListParams & { status?: RentalStatus } = {}
): Promise<Paginated<RentalWithRelations>> {
  return apiRequest('/dealer/rentals', { params: params as any })
}

export async function getRental(id: string): Promise<RentalDetail> {
  return apiRequest(`/dealer/rentals/${id}`)
}

/** Activates a `reserved` rental after the physical vehicle handover. 409 when the first payment is missing. */
export async function recordHandover(id: string, input: RentalHandoverInput = {}): Promise<Rental> {
  return apiRequest(`/dealer/rentals/${id}/handover`, { method: 'POST', body: input })
}

/** Completes an `active`/`past_due` rental and frees or parks the vehicle. */
export async function recordReturn(id: string, input: RentalReturnInput = {}): Promise<Rental> {
  return apiRequest(`/dealer/rentals/${id}/return`, { method: 'POST', body: input })
}

/** Extends the minimum term for an active subscription. */
export async function extendRental(id: string, months: number): Promise<Rental> {
  return apiRequest(`/dealer/rentals/${id}/extend`, { method: 'POST', body: { months } })
}

/** Mark customer delivery/pickup as scheduled or delivered. */
export async function acknowledgePickupFulfilment(
  id: string,
  status: 'scheduled' | 'delivered'
): Promise<Rental> {
  return apiRequest(`/dealer/rentals/${id}/pickup-fulfilment`, { method: 'POST', body: { status } })
}

/**
 * Records an offline (cash / transfer / POS) payment for a rental.
 * The amount is derived server-side from the oldest unpaid invoice; 409 when nothing is due.
 */
export async function recordOfflinePayment(input: {
  rentalId: string
  method?: PaymentMethodType
}): Promise<Payment> {
  return apiRequest('/dealer/payments/offline', { method: 'POST', body: input })
}

export async function listSwapRequests(
  params: ListParams = {}
): Promise<Paginated<SwapRequestWithRelations>> {
  return apiRequest('/dealer/swap-requests', { params: params as any })
}

/** Approving atomically moves the subscription to the requested vehicle. */
export async function updateSwapRequestStatus(
  id: string,
  input: SwapDecisionInput
): Promise<SwapRequest> {
  return apiRequest(`/dealer/swap-requests/${id}/status`, { method: 'PATCH', body: input })
}

export async function listLeads(params: ListParams = {}): Promise<Paginated<Lead>> {
  return apiRequest('/dealer/leads', { params: params as any })
}

export async function listNotifications(params: ListParams = {}): Promise<Paginated<Notification>> {
  return apiRequest('/dealer/notifications', { params: params as any })
}

export async function getDealerVehicleCount(): Promise<number> {
  const data = await apiRequest<{ count: number }>('/dealer/vehicle-count')
  return data.count
}

export async function listPaymentMethods(): Promise<PaymentMethod[]> {
  return apiRequest('/dealer/payment-methods')
}

export async function removePaymentMethod(id: string): Promise<void> {
  await apiRequest(`/dealer/payment-methods/${id}`, { method: 'DELETE' })
}

export async function createVehicle(input: CreateVehicleInput): Promise<Vehicle> {
  return apiRequest('/dealer/vehicles', { method: 'POST', body: input })
}

/** General vehicle edit. The backend rejects a `status` field here (400) — use `updateVehicleStatus`. */
export async function updateVehicle(
  id: string,
  updates: Partial<Omit<Vehicle, 'status'>>
): Promise<Vehicle> {
  return apiRequest(`/dealer/vehicles/${id}`, { method: 'PATCH', body: updates })
}

/** Status-only change. 409 with an explanatory error when the vehicle has an open rental. */
export async function updateVehicleStatus(id: string, status: VehicleStatus): Promise<Vehicle> {
  return apiRequest(`/dealer/vehicles/${id}/status`, { method: 'PATCH', body: { status } })
}

export async function removeVehicle(id: string): Promise<void> {
  await apiRequest(`/dealer/vehicles/${id}`, { method: 'DELETE' })
}

export async function createLead(input: CreateLeadInput): Promise<Lead> {
  return apiRequest('/dealer/leads', { method: 'POST', body: input })
}

export async function updateLead(
  id: string,
  updates: Partial<Lead> & { priority?: string; notes?: string }
): Promise<Lead> {
  return apiRequest(`/dealer/leads/${id}`, { method: 'PATCH', body: updates })
}

export async function removeLead(id: string): Promise<void> {
  await apiRequest(`/dealer/leads/${id}`, { method: 'DELETE' })
}

export async function markNotificationRead(id: string): Promise<Notification> {
  return apiRequest(`/dealer/notifications/${id}/read`, { method: 'POST' })
}

export async function markAllNotificationsRead(): Promise<Notification[]> {
  return apiRequest('/dealer/notifications/read-all', { method: 'POST' })
}

export async function getDealerSettings(): Promise<DealerSettings> {
  return apiRequest('/dealer/settings')
}

export async function updateDealerSettings(
  updates: Partial<DealerSettings>
): Promise<DealerSettings> {
  return apiRequest('/dealer/settings', { method: 'PATCH', body: updates })
}

export interface DealerPayout {
  id: string
  amount: number
  status: string
  periodStart: string | null
  periodEnd: string | null
  paidAt: string | null
  note?: string
  createdAt: string
}

export interface DealerEarnings {
  byStatus: Record<string, { gross: number; net: number; commission: number }>
  pendingPayoutTotal: number
}

export interface DealerMaintenanceRecord {
  id: string
  vehicleId: string
  dealerId: string
  rentalId: string | null
  status: string
  title: string
  description: string | null
  reportedBy: string | null
  photos: string[]
  scheduledAt: string | null
  source: string
  reporterName?: string
  completedAt: string | null
  createdAt: string
}

export interface DealerAnalyticsInsights {
  fleet: {
    total: number
    available: number
    rented: number
    maintenance: number
    utilizationPct: number
  }
  insights: string[]
}

export interface CreateMaintenanceInput {
  vehicleId: string
  title: string
  description?: string
  rentalId?: string
}

export async function listDealerPayouts(params: ListParams = {}): Promise<Paginated<DealerPayout>> {
  return apiRequest('/dealer/payouts', { params: params as any })
}

export async function getDealerEarnings(): Promise<DealerEarnings> {
  return apiRequest('/dealer/earnings')
}

export async function listDealerMaintenance(
  params: ListParams = {}
): Promise<Paginated<DealerMaintenanceRecord>> {
  return apiRequest('/dealer/maintenance', { params: params as any })
}

export async function createDealerMaintenance(
  input: CreateMaintenanceInput
): Promise<DealerMaintenanceRecord> {
  return apiRequest('/dealer/maintenance', { method: 'POST', body: input })
}

export async function completeDealerMaintenance(id: string): Promise<{ ok: boolean }> {
  return apiRequest(`/dealer/maintenance/${id}/complete`, { method: 'PATCH' })
}

export async function acceptDealerMaintenance(id: string): Promise<DealerMaintenanceRecord> {
  return apiRequest(`/dealer/maintenance/${id}/accept`, { method: 'PATCH' })
}

export async function scheduleDealerMaintenance(
  id: string,
  scheduledAt: string
): Promise<DealerMaintenanceRecord> {
  return apiRequest(`/dealer/maintenance/${id}/schedule`, {
    method: 'PATCH',
    body: { scheduledAt },
  })
}

export async function getDealerAnalyticsInsights(): Promise<DealerAnalyticsInsights> {
  return apiRequest('/dealer/analytics/insights')
}

/**
 * DEALER SUBSCRIPTION BILLING
 *
 * These mirror apps/backend/src/routes/dealerFeatures.ts (`/billing/*` and
 * `/subscription/*`), which is backed by the dealer_plans / dealer_subscriptions
 * / dealer_invoices tables. They are NOT the customer-facing `plans` /
 * `subscriptions` tables: `/dealer/plans` returns the tiers CarFlow sells to
 * *customers*, and `/dealer/billing/plans` returns the tiers CarFlow sells to
 * *dealers*. Only the latter is a valid target for a dealer plan change.
 */

export interface DealerBillingPlan {
  id: string
  code: string
  name: string
  priceQar: number
  /** Null means unlimited listings. */
  vehicleLimit: number | null
  features: string[]
  active: boolean
}

export interface DealerBillingSubscription {
  id: string
  dealerId: string
  planId: string
  planCode: string
  planName: string
  priceQar: number
  vehicleLimit: number | null
  status: 'active' | 'past_due' | 'cancelled' | 'pending'
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAt?: string
  createdAt: string
}

export interface DealerBillingInvoice {
  id: string
  dealerId: string
  subscriptionId: string
  amount: number
  status: 'due' | 'paid' | 'past_due' | 'void'
  date: string
  description: string
  periodStart: string
  periodEnd: string
  dueDate: string
  paidAt?: string
  paymentId?: string
}

/** Listing headroom the current plan grants. `limit === null` means unlimited. */
export interface DealerVehicleQuota {
  planId: string | null
  planCode: string | null
  planName: string | null
  limit: number | null
  used: number
  remaining: number | null
  overLimit: boolean
  /** True only when a capped plan is actually enforceable for this dealer. */
  enforced: boolean
}

export interface DealerBillingState {
  subscription: DealerBillingSubscription | null
  plan: DealerBillingPlan | null
  quota: DealerVehicleQuota
}

export interface DealerPlanChangeResult {
  subscription: DealerBillingSubscription
  plan: DealerBillingPlan
  /** Raised when the change is billable — it is due, not paid. */
  invoice: DealerBillingInvoice | null
  change: 'subscribed' | 'upgraded' | 'downgraded' | 'unchanged'
  deactivatedVehicles: number
  quota: DealerVehicleQuota
}

export interface DealerCancelResult {
  subscription: DealerBillingSubscription
  plan: DealerBillingPlan
  /** Billing boundary the cancellation takes effect on — never immediate. */
  effectiveDate: string
}

/** Tiers CarFlow sells to dealers, cheapest first. */
export async function listDealerBillingPlans(): Promise<DealerBillingPlan[]> {
  return apiRequest('/dealer/billing/plans')
}

export async function getDealerBillingState(): Promise<DealerBillingState> {
  return apiRequest('/dealer/billing/subscription')
}

export async function listDealerBillingInvoices(): Promise<DealerBillingInvoice[]> {
  return apiRequest('/dealer/billing/invoices')
}

/**
 * Changes the dealer's plan. An upgrade is applied immediately but is never
 * free: the response carries a `due` invoice that must be paid inside the
 * billing grace window or the dealer walks down to the free tier.
 */
export async function changeDealerSubscriptionPlan(planId: string): Promise<DealerPlanChangeResult> {
  return apiRequest('/dealer/subscription/plan', { method: 'PATCH', body: { planId } })
}

export async function cancelDealerSubscription(): Promise<DealerCancelResult> {
  return apiRequest('/dealer/subscription/cancel', { method: 'POST' })
}

export interface DealerMessage extends Message {
  fromName?: string
  fromEmail?: string
  fromRole?: string
  toName?: string
  toEmail?: string
}

export interface MessageThreadSummary {
  threadSubject: string
  displaySubject: string
  lastMessage: DealerMessage
  unreadCount: number
  participantName?: string
  participantEmail?: string
}

export interface SendDealerMessageInput {
  toUserId: string
  body: string
  subject?: string
  rentalId?: string
  bookingRequestId?: string
  replyToMessageId?: string
}

export async function listDealerMessages(
  params: ListParams & { folder?: MessageFolder } = {}
): Promise<Paginated<DealerMessage>> {
  return apiRequest('/dealer/messages', { params: params as Record<string, string | number | undefined> })
}

export async function getDealerUnreadMessageCount(): Promise<number> {
  const data = await apiRequest<{ count: number }>('/dealer/messages/unread-count')
  return data.count
}

export async function listDealerMessageThreads(): Promise<MessageThreadSummary[]> {
  return apiRequest('/dealer/messages/threads')
}

export async function getDealerMessageThread(threadSubject: string): Promise<DealerMessage[]> {
  return apiRequest('/dealer/messages/thread', { params: { subject: threadSubject } })
}

export async function sendDealerMessage(input: SendDealerMessageInput): Promise<DealerMessage> {
  return apiRequest('/dealer/messages', { method: 'POST', body: input })
}

export async function markDealerMessageRead(id: string, read = true): Promise<DealerMessage> {
  return apiRequest(`/dealer/messages/${id}/read`, { method: 'PATCH', body: { read } })
}

export async function moveDealerMessageToFolder(id: string, folder: MessageFolder): Promise<DealerMessage> {
  return apiRequest(`/dealer/messages/${id}/folder`, { method: 'PATCH', body: { folder } })
}

export async function listDealerReviews(
  params: ListParams = {}
): Promise<Paginated<DealerReview>> {
  return apiRequest('/dealer/reviews', { params: params as any })
}

export async function respondToDealerReview(
  reviewId: string,
  response: string
): Promise<{ id: string; dealerResponse: string; dealerRespondedAt: string }> {
  return apiRequest(`/dealer/reviews/${reviewId}/respond`, {
    method: 'POST',
    body: { response },
  })
}
