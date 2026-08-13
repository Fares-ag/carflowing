import type {
  BillingHistoryItem,
  BookingRequest,
  Lead,
  LeadStage,
  Notification,
  Paginated,
  PaymentMethod,
  Subscription,
  Vehicle,
  VehicleStatus,
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
  taxId?: string
  businessHours: Array<{
    day: string
    enabled: boolean
    startTime: string
    endTime: string
  }>
  logoUrl?: string
}

export interface BookingRequestWithVehicle extends BookingRequest {
  vehicle?: Vehicle
  customer?: { id: string; name: string; email: string }
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

export async function recordOfflinePayment(input: {
  rentalId?: string
  customerId?: string
  amount: number
  method?: string
}): Promise<unknown> {
  return apiRequest('/dealer/payments/offline', { method: 'POST', body: input })
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

export async function getSubscription(): Promise<Subscription> {
  const sub = await apiRequest<Subscription | null>('/dealer/subscription')
  if (!sub) throw new Error('No subscription found')
  return sub
}

export async function listPaymentMethods(): Promise<PaymentMethod[]> {
  return apiRequest('/dealer/payment-methods')
}

export async function removePaymentMethod(id: string): Promise<void> {
  await apiRequest(`/dealer/payment-methods/${id}`, { method: 'DELETE' })
}

export async function listBillingHistory(): Promise<BillingHistoryItem[]> {
  return apiRequest('/dealer/billing-history')
}

export async function createVehicle(input: CreateVehicleInput): Promise<Vehicle> {
  return apiRequest('/dealer/vehicles', { method: 'POST', body: input })
}

export async function updateVehicle(id: string, updates: Partial<Vehicle>): Promise<Vehicle> {
  return apiRequest(`/dealer/vehicles/${id}`, { method: 'PATCH', body: updates })
}

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
