import type {
  BookingRequest,
  BookingRequestStatus,
  Complaint,
  ComplaintPriority,
  Favorite,
  Invoice,
  Notification,
  Paginated,
  PaymentMethod,
  Rental,
  RentalStatus,
  Subscription,
  Vehicle,
} from '@carflow/shared'
import { apiRequest } from '@carflow/shared'

export interface ListParams {
  page?: number
  pageSize?: number
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

export async function listCatalogVehicles(params: ListParams = {}): Promise<Paginated<Vehicle>> {
  return apiRequest('/customer/vehicles', { params: params as any })
}

export async function getVehicle(id: string): Promise<Vehicle> {
  return apiRequest(`/customer/vehicles/${id}`)
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
  updates: Partial<CustomerProfileDocuments>
): Promise<CustomerProfileDocuments> {
  const row = await apiRequest<{
    qidDocumentPath?: string | null
    driversLicensePath?: string | null
  }>('/customer/profile/documents', {
    method: 'PATCH',
    body: {
      qidDocumentPath: updates.qid_document_path,
      driversLicensePath: updates.drivers_license_path,
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

export async function updateRentalStatus(id: string, status: RentalStatus): Promise<Rental> {
  return apiRequest(`/customer/rentals/${id}/status`, { method: 'PATCH', body: { status } })
}
