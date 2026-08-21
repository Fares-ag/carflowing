import type {
  BookingRequest,
  BookingRequestStatus,
  Complaint,
  ComplaintPriority,
  Favorite,
  Invoice,
  Message,
  MessageFolder,
  Notification,
  Paginated,
  PaymentMethod,
  Rental,
  RentalEvent,
  Subscription,
  SwapRequest,
  Vehicle,
  VehicleReviewList,
} from '@carflow/shared'
import { apiFetchBlob, apiRequest } from '@carflow/shared'

export interface ListParams {
  page?: number
  pageSize?: number
}

export type CatalogSort = 'recommended' | 'price_asc' | 'price_desc' | 'newest'

export interface CatalogListParams extends ListParams {
  search?: string
  category?: string
  make?: string
  fuelType?: string
  transmission?: string
  seats?: string
  priceMin?: number
  priceMax?: number
  minRating?: number
  maxMileage?: number
  yearMin?: number
  yearMax?: number
  features?: string
  location?: string
  startDate?: string
  sort?: CatalogSort
}

export interface CustomerDashboardData {
  upcomingRentals: Rental[]
  recentRentals: Rental[]
  favoritesCount: number
}

export interface RentalWithDetails extends Rental {
  vehicle?: Vehicle
}

export interface BookingRequestWithVehicle extends BookingRequest {
  vehicle?: Vehicle
}

export interface CustomerProfileDocuments {
  qid_document_path: string | null
  drivers_license_path: string | null
}

export interface CreateBookingRequestInput {
  vehicleId: string
  note?: string
}

export async function getCustomerDashboard(): Promise<CustomerDashboardData> {
  return apiRequest('/customer/dashboard')
}

export async function listCatalogVehicles(params: CatalogListParams = {}): Promise<Paginated<Vehicle>> {
  return apiRequest('/customer/vehicles', { params: params as Record<string, string | number | undefined> })
}

export async function getPricingSettings(): Promise<{ subscriptionDepositAmount: number }> {
  return apiRequest('/customer/pricing-settings')
}

export async function getVehicle(id: string): Promise<Vehicle> {
  return apiRequest(`/customer/vehicles/${id}`)
}

export async function getVehicleReviews(
  vehicleId: string,
  params: ListParams = {}
): Promise<VehicleReviewList> {
  return apiRequest(`/customer/vehicles/${vehicleId}/reviews`, { params: params as any })
}

export async function listRentals(params: ListParams = {}): Promise<Paginated<Rental>> {
  return apiRequest('/customer/rentals', { params: params as any })
}

export async function listRentalsWithDetails(
  params: ListParams = {}
): Promise<Paginated<Rental & { vehicle?: Vehicle }>> {
  return apiRequest('/customer/rentals/details', { params: params as any })
}

export async function listFavorites(params: ListParams = {}): Promise<Paginated<Favorite>> {
  return apiRequest('/customer/favorites', { params: params as any })
}

export interface FavoriteVehicleItem {
  favorite: Favorite
  vehicle: Vehicle | null
  unavailableReason: 'removed' | 'pending_booking' | 'unavailable' | null
}

export async function listFavoriteVehicles(): Promise<{ items: FavoriteVehicleItem[] }> {
  return apiRequest('/customer/favorites/vehicles')
}

export interface SubmitComplaintInput {
  category: string
  priority?: ComplaintPriority
  subject: string
  description: string
}

export async function submitComplaint(input: SubmitComplaintInput): Promise<Complaint> {
  return apiRequest('/customer/complaints', { method: 'POST', body: input })
}

export interface CustomerComplaintReply {
  id: string
  body: string
  createdAt: string
  authorName: string
  fromSupport: boolean
}

export interface CustomerComplaintWithReplies extends Complaint {
  replies: CustomerComplaintReply[]
}

export async function listMyComplaints(): Promise<{ items: CustomerComplaintWithReplies[] }> {
  return apiRequest('/customer/complaints')
}

export async function listBookingRequests(params: ListParams = {}): Promise<Paginated<BookingRequest>> {
  return apiRequest('/customer/booking-requests', { params: params as any })
}

export async function listBookingRequestsWithVehicles(
  params: ListParams = {}
): Promise<Paginated<BookingRequest & { vehicle?: Vehicle }>> {
  return apiRequest('/customer/booking-requests/details', { params: params as any })
}

export async function getSubscription(): Promise<Subscription> {
  const sub = await apiRequest<Subscription | null>('/customer/subscription')
  if (!sub) throw new Error('No subscription found')
  return sub
}

export async function listInvoices(): Promise<Invoice[]> {
  return apiRequest('/customer/invoices')
}

export async function listPaymentMethods(): Promise<PaymentMethod[]> {
  return apiRequest('/customer/payment-methods')
}

export async function addFavorite(vehicleId: string): Promise<Favorite> {
  return apiRequest('/customer/favorites', { method: 'POST', body: { vehicleId } })
}

export async function removeFavorite(id: string): Promise<void> {
  await apiRequest(`/customer/favorites/${id}`, { method: 'DELETE' })
}

export async function clearFavorites(): Promise<void> {
  await apiRequest('/customer/favorites', { method: 'DELETE' })
}

export async function getCustomerProfile(): Promise<CustomerProfileDocuments | null> {
  const row = await apiRequest<{
    qidDocumentPath?: string
    driversLicensePath?: string
  } | null>('/customer/profile')
  if (!row) return null
  return {
    qid_document_path: row.qidDocumentPath ?? null,
    drivers_license_path: row.driversLicensePath ?? null,
  }
}

export async function updateCustomerDocuments(
  updates: Partial<CustomerProfileDocuments> & {
    qid_number?: string
    drivers_license_number?: string
  }
): Promise<CustomerProfileDocuments> {
  const row = await apiRequest<{
    qidDocumentPath?: string | null
    driversLicensePath?: string | null
  }>('/customer/profile/documents', {
    method: 'PATCH',
    body: {
      qidDocumentPath: updates.qid_document_path,
      driversLicensePath: updates.drivers_license_path,
      qidNumber: updates.qid_number,
      driversLicenseNumber: updates.drivers_license_number,
    },
  })
  return {
    qid_document_path: row.qidDocumentPath ?? null,
    drivers_license_path: row.driversLicensePath ?? null,
  }
}

export async function listNotifications(params: ListParams = {}): Promise<Paginated<Notification>> {
  return apiRequest('/customer/notifications', { params: params as any })
}

export async function getUnreadNotificationCount(): Promise<number> {
  const data = await apiRequest<{ count: number }>('/customer/notifications/unread-count')
  return data.count
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiRequest(`/customer/notifications/${id}/read`, { method: 'POST' })
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiRequest('/customer/notifications/read-all', { method: 'POST' })
}

export async function createBookingRequest(input: CreateBookingRequestInput): Promise<BookingRequest> {
  return apiRequest('/customer/booking-requests', { method: 'POST', body: input })
}

export async function updateBookingRequestStatus(
  id: string,
  status: BookingRequestStatus
): Promise<BookingRequest> {
  return apiRequest(`/customer/booking-requests/${id}/status`, {
    method: 'PATCH',
    body: { status },
  })
}

export async function updateBookingRequestNote(id: string, note: string): Promise<BookingRequest> {
  return apiRequest(`/customer/booking-requests/${id}/note`, {
    method: 'PATCH',
    body: { note },
  })
}

export async function removePaymentMethod(id: string): Promise<void> {
  await apiRequest(`/customer/payment-methods/${id}`, { method: 'DELETE' })
}

export async function setDefaultPaymentMethod(id: string): Promise<void> {
  await apiRequest(`/customer/payment-methods/${id}/default`, { method: 'POST' })
}

/**
 * The backend only accepts `cancelled` from customers on this endpoint —
 * anything else is a 403. Prefer `cancelRental`, the dedicated cancel route.
 */
export async function updateRentalStatus(
  id: string,
  status: 'cancelled',
  reason?: string
): Promise<Rental> {
  return apiRequest(`/customer/rentals/${id}/status`, {
    method: 'PATCH',
    body: reason ? { status, reason } : { status },
  })
}

/**
 * Cancel a subscription (invygo/FINN-style). A `reserved` rental is cancelled
 * immediately; an `active` one keeps running until the returned rental's
 * `cancellationEffectiveDate` (30-day notice at a billing boundary).
 */
export async function cancelRental(
  id: string,
  options?: {
    reason?: string
    collection?: {
      mode: 'dealer_return' | 'collection'
      location?: string
      date: string
      time: string
    }
  }
): Promise<Rental> {
  const body: Record<string, unknown> = {}
  if (options?.reason) body.reason = options.reason
  if (options?.collection) body.collection = options.collection
  return apiRequest(`/customer/rentals/${id}/cancel`, {
    method: 'POST',
    body,
  })
}

/** Aggregated monthly-subscription view for one rental. */
export interface RentalSubscriptionData {
  rental: Rental
  vehicle: Vehicle | null
  invoices: Invoice[]
  events: RentalEvent[]
  swapRequests: SwapRequest[]
  /** ISO timestamp from which a car swap can be requested; null before handover. */
  swapEligibleFrom: string | null
  /** Maximum pause duration in days (travel hold). */
  maxPauseDays: number
}

export async function getRentalSubscription(rentalId: string): Promise<RentalSubscriptionData> {
  return apiRequest(`/customer/rentals/${rentalId}/subscription`)
}

export interface CreateSwapRequestInput {
  vehicleId: string
  note?: string
}

/**
 * Request an invygo-style car swap within the same dealer fleet.
 * The server answers 409 (with a human-readable error) when the rental is not
 * eligible yet, the vehicle is unavailable, or a swap is already pending.
 */
export async function createSwapRequest(
  rentalId: string,
  input: CreateSwapRequestInput
): Promise<SwapRequest> {
  return apiRequest(`/customer/rentals/${rentalId}/swap-requests`, {
    method: 'POST',
    body: input,
  })
}

/** Cancel the customer's own pending swap request. */
export async function cancelSwapRequest(id: string): Promise<SwapRequest> {
  return apiRequest(`/customer/swap-requests/${id}/cancel`, { method: 'PATCH' })
}

export interface RentalReview {
  id: string
  rating: number
  comment?: string | null
  createdAt: string
}

export async function extendRental(rentalId: string, months: number): Promise<Rental> {
  return apiRequest(`/customer/rentals/${rentalId}/extend`, {
    method: 'POST',
    body: { months },
  })
}

export async function pauseRental(
  rentalId: string,
  input?: { days?: number; reason?: string }
): Promise<Rental> {
  return apiRequest(`/customer/rentals/${rentalId}/pause`, {
    method: 'POST',
    body: input ?? {},
  })
}

export async function resumeRental(rentalId: string): Promise<Rental> {
  return apiRequest(`/customer/rentals/${rentalId}/resume`, { method: 'POST' })
}

export async function submitRentalReview(
  rentalId: string,
  input: { rating: number; comment?: string }
): Promise<RentalReview> {
  return apiRequest(`/customer/rentals/${rentalId}/reviews`, {
    method: 'POST',
    body: input,
  })
}

export async function getRentalReview(rentalId: string): Promise<RentalReview | null> {
  return apiRequest(`/customer/rentals/${rentalId}/reviews`)
}

export interface MaintenanceRequest {
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
  completedAt: string | null
  createdAt: string
}

export async function listRentalMaintenanceRequests(
  rentalId: string
): Promise<{ items: MaintenanceRequest[] }> {
  return apiRequest(`/customer/rentals/${rentalId}/maintenance-requests`)
}

export async function createRentalMaintenanceRequest(
  rentalId: string,
  input: { description: string; title?: string; photos?: string[] }
): Promise<MaintenanceRequest> {
  return apiRequest(`/customer/rentals/${rentalId}/maintenance-requests`, {
    method: 'POST',
    body: input,
  })
}

export interface PromoValidationResult {
  valid: boolean
  error?: string
  promoCodeId?: string
  code?: string
  discountType?: 'percent' | 'fixed'
  discountValue?: number
  discountAmount?: number
}

export async function validatePromoCode(input: {
  code: string
  termMonths: number
  vehicleId: string
}): Promise<PromoValidationResult> {
  return apiRequest('/customer/promo-codes/validate', { method: 'POST', body: input })
}

export interface AddPaymentMethodInput {
  brand: string
  last4: string
  expiryMonth: number
  expiryYear: number
  methodType?: 'card' | 'bank' | 'wallet'
}

export async function addPaymentMethod(input: AddPaymentMethodInput): Promise<PaymentMethod> {
  return apiRequest('/customer/payment-methods', { method: 'POST', body: input })
}

export async function downloadInvoicePdf(invoiceId: string): Promise<Blob> {
  return apiFetchBlob(`/customer/invoices/${invoiceId}/pdf`)
}

export async function downloadRentalContractPdf(rentalId: string): Promise<Blob> {
  return apiFetchBlob(`/customer/rentals/${rentalId}/contract/pdf`)
}

export interface CustomerMessage extends Message {
  fromName?: string
  fromEmail?: string
}

export async function listMessages(params: ListParams & { folder?: MessageFolder } = {}): Promise<
  Paginated<CustomerMessage>
> {
  return apiRequest('/customer/messages', { params: params as Record<string, string | number | undefined> })
}

export async function getUnreadMessageCount(): Promise<number> {
  const data = await apiRequest<{ count: number }>('/customer/messages/unread-count')
  return data.count
}

export async function markMessageRead(id: string, read = true): Promise<CustomerMessage> {
  return apiRequest(`/customer/messages/${id}/read`, { method: 'PATCH', body: { read } })
}

export async function moveMessageToFolder(id: string, folder: MessageFolder): Promise<CustomerMessage> {
  return apiRequest(`/customer/messages/${id}/folder`, { method: 'PATCH', body: { folder } })
}

export interface MessageThreadSummary {
  threadSubject: string
  displaySubject: string
  lastMessage: CustomerMessage
  unreadCount: number
  participantName?: string
  participantEmail?: string
}

export interface SendCustomerMessageInput {
  toUserId: string
  body: string
  subject?: string
  rentalId?: string
  bookingRequestId?: string
  replyToMessageId?: string
}

export async function listMessageThreads(): Promise<MessageThreadSummary[]> {
  return apiRequest('/customer/messages/threads')
}

export async function getMessageThread(threadSubject: string): Promise<CustomerMessage[]> {
  return apiRequest('/customer/messages/thread', { params: { subject: threadSubject } })
}

export async function sendMessage(input: SendCustomerMessageInput): Promise<CustomerMessage> {
  return apiRequest('/customer/messages', { method: 'POST', body: input })
}

export interface UserPreferences {
  emailNotifications: boolean
  pushNotifications: boolean
  smsNotifications: boolean
  marketingEmails: boolean
  locale: string
  theme: string
}

export async function getPreferences(): Promise<UserPreferences> {
  return apiRequest('/customer/preferences')
}

export async function updatePreferences(patch: Partial<UserPreferences>): Promise<UserPreferences> {
  return apiRequest('/customer/preferences', { method: 'PATCH', body: patch })
}

export interface BillingAddress {
  line1: string
  line2: string
  city: string
  country: string
  postalCode: string
}

export async function getBillingAddress(): Promise<BillingAddress> {
  return apiRequest('/customer/profile/billing-address')
}

export async function updateBillingAddress(
  patch: Partial<Pick<BillingAddress, 'line1' | 'line2' | 'city' | 'country' | 'postalCode'>>
): Promise<BillingAddress> {
  return apiRequest('/customer/profile/billing-address', { method: 'PATCH', body: patch })
}

export interface SecurityStatus {
  totpEnabled: boolean
  smsVerified: boolean
  smsPhone: string | null
  smsVerificationAvailable: boolean
  smsProviderConfigured: boolean
  smsDevFallback: boolean
}

export async function getSecurityStatus(): Promise<SecurityStatus> {
  return apiRequest('/customer/security')
}

export interface TotpSetupResult {
  secret: string
  uri: string
}

export async function setup2fa(): Promise<TotpSetupResult> {
  return apiRequest('/customer/security/2fa/setup', { method: 'POST' })
}

export async function enable2fa(code: string): Promise<{ ok: true }> {
  return apiRequest('/customer/security/2fa/enable', { method: 'POST', body: { code } })
}

export async function disable2fa(code: string): Promise<{ ok: true }> {
  return apiRequest('/customer/security/2fa/disable', { method: 'POST', body: { code } })
}

export async function sendSmsVerification(phone: string): Promise<{ ok: true }> {
  return apiRequest('/customer/security/sms/send', { method: 'POST', body: { phone } })
}

export async function verifySmsCode(code: string): Promise<{ ok: true }> {
  return apiRequest('/customer/security/sms/verify', { method: 'POST', body: { code } })
}
