import type {
  BookingRequest,
  BookingRequestStatus,
  Complaint,
  ComplaintStatus,
  Dealer,
  Message,
  Paginated,
  Payment,
  Plan,
  Rental,
  RentalStatus,
  User,
  UserStatus,
  Vehicle,
  VehicleStatus,
} from '@carflow/shared'
import { apiRequest } from '@carflow/shared'

export interface ListParams {
  page?: number
  pageSize?: number
}

export interface RecentRentalWithDetails extends Rental {
  customerName?: string | null
  customerEmail?: string | null
  vehicleName?: string | null
  vehicleYear?: number | null
}

export interface AdminDashboardData {
  kpis: Array<{ label: string; value: number }>
  rentalsTrend: Array<{ date: string; value: number }>
  revenueTrend: Array<{ date: string; value: number }>
  recentRentals: RecentRentalWithDetails[]
  bookingStatusCounts: { active: number; reserved: number; completed: number; cancelled: number }
  todayBookingsCount: number
}

export interface AdminAnalyticsData {
  kpis: Array<{ label: string; value: number }>
  revenueTrend: Array<{ date: string; value: number }>
  rentalsTrend: Array<{ date: string; value: number }>
  categoryDistribution: Array<{ category: string; value: number }>
  topVehicles: Array<{ name: string; value: number }>
}

export interface AdminAppSettings {
  id: string
  companyName: string
  supportEmail: string
  supportPhone?: string
  defaultTaxRate: number
}

export interface CustomerStats {
  total: number
  active: number
  suspended: number
  newThisMonth: number
}

export interface CreateVehicleInput {
  dealerId: string
  name: string
  make: string
  model: string
  year: number
  category: Vehicle['category']
  status?: VehicleStatus
  pricePerDay: number
  mileage?: number
  transmission?: 'automatic' | 'manual'
  fuelType?: 'gas' | 'diesel' | 'electric' | 'hybrid'
  seats?: number
  imageUrl?: string
}

export interface CustomerWithStats extends User {
  rentalsCount: number
  totalSpent: number
  verification: 'verified' | 'unverified'
  accountStatus: UserStatus
}

export interface RentalWithDetails extends Rental {
  vehicle?: Vehicle
  customer?: User
  dealer?: { id: string; name: string }
}

export interface PaymentWithDetails extends Payment {
  customer?: User
}

export interface PlanStats {
  totalPlans: number
  activePlans: number
  activeSubscriptions: number
}

export interface ComplaintWithCustomer extends Complaint {
  customerName?: string
  customerEmail?: string
}

export interface MessageSender {
  id: string
  name: string
  email: string
  role?: string
}

export interface MessageWithSender extends Message {
  fromName?: string
  fromEmail?: string
  fromRole?: string
  sender?: MessageSender
}

export interface MessageFolderCounts {
  inbox: number
  sent: number
  starred: number
  archived: number
  unread: number
}

export interface ListMessagesParams extends ListParams {
  folder?: Message['folder']
}

export interface CreateMessageInput {
  toUserId: string
  subject: string
  body: string
}

export async function getAdminDashboard(): Promise<AdminDashboardData> {
  return apiRequest('/admin/dashboard')
}

export async function getCustomerStats(): Promise<CustomerStats> {
  return apiRequest('/admin/customer-stats')
}

export async function getAdminAnalytics(): Promise<AdminAnalyticsData> {
  return apiRequest('/admin/analytics')
}

export async function listVehicles(params: ListParams = {}): Promise<Paginated<Vehicle>> {
  return apiRequest('/admin/vehicles', { params: params as any })
}

export async function getVehicle(id: string): Promise<Vehicle> {
  return apiRequest(`/admin/vehicles/${id}`)
}

export async function createVehicle(input: CreateVehicleInput): Promise<Vehicle> {
  return apiRequest('/admin/vehicles', { method: 'POST', body: input })
}

export async function deleteVehicle(id: string): Promise<void> {
  await apiRequest(`/admin/vehicles/${id}`, { method: 'DELETE' })
}

export async function listCustomersWithStats(
  params: ListParams = {}
): Promise<Paginated<CustomerWithStats>> {
  const data = await apiRequest<
    Paginated<
      User & {
        customerStatus?: string
        rentalsCount?: number
        totalSpent?: number
        status?: UserStatus
      }
    >
  >('/admin/customers/with-stats', { params: params as any })
  return {
    ...data,
    items: data.items.map((u) => ({
      ...u,
      rentalsCount: u.rentalsCount ?? 0,
      totalSpent: u.totalSpent ?? 0,
      verification: u.customerStatus === 'verified' ? 'verified' : 'unverified',
      accountStatus: (u.status as UserStatus) ?? 'active',
    })),
  }
}

export async function listCustomers(params: ListParams = {}): Promise<Paginated<User>> {
  return apiRequest('/admin/customers', { params: params as any })
}

export async function getCustomerDetails(userId: string): Promise<CustomerWithStats | null> {
  const u = await apiRequest<
    (User & { customerStatus?: string; rentalsCount?: number; totalSpent?: number }) | null
  >(`/admin/customers/${userId}`)
  if (!u) return null
  return {
    ...u,
    rentalsCount: u.rentalsCount ?? 0,
    totalSpent: u.totalSpent ?? 0,
    verification: u.customerStatus === 'verified' ? 'verified' : 'unverified',
    accountStatus: (u.status as UserStatus) ?? 'active',
  }
}

export async function updateCustomerStatus(userId: string, status: UserStatus): Promise<void> {
  await apiRequest(`/admin/customers/${userId}/status`, { method: 'PATCH', body: { status } })
}

export async function updateCustomerProfile(
  userId: string,
  updates: Partial<Pick<User, 'name' | 'phone' | 'email'>>
): Promise<void> {
  await apiRequest(`/admin/customers/${userId}/profile`, { method: 'PATCH', body: updates })
}

export async function updateCustomerVerification(
  userId: string,
  status: 'verified' | 'unverified' | 'active' | 'suspended'
): Promise<void> {
  await apiRequest(`/admin/customers/${userId}/verification`, { method: 'PATCH', body: { status } })
}

export async function listRentals(params: ListParams = {}): Promise<Paginated<Rental>> {
  return apiRequest('/admin/rentals', { params: params as any })
}

export async function listRentalsWithDetails(
  params: ListParams = {}
): Promise<Paginated<RentalWithDetails>> {
  return apiRequest('/admin/rentals/details', { params: params as any })
}

export async function listDealers(params: ListParams = {}): Promise<Paginated<Dealer>> {
  return apiRequest('/admin/dealers', { params: params as any })
}

export async function createDealer(input: {
  email: string
  name?: string
  contactEmail?: string
  contactPhone?: string
  address?: string
  password?: string
}): Promise<Dealer & { accountCreated?: boolean; temporaryPassword?: string }> {
  return apiRequest('/admin/dealers', {
    method: 'POST',
    body: {
      email: input.email,
      name: input.name,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      address: input.address,
      password: input.password,
    },
  })
}

export interface PaymentSummary {
  totalRevenue: number
  pendingCount: number
  completedCount: number
  refundedCount: number
  refundTotal: number
  needsRefundCount: number
}

export async function getPaymentSummary(): Promise<PaymentSummary> {
  return apiRequest('/admin/payments/summary')
}

export async function refundPayment(paymentId: string): Promise<Payment> {
  return apiRequest(`/admin/payments/${paymentId}/refund`, { method: 'POST' })
}

export async function listPayments(params: ListParams = {}): Promise<Paginated<Payment>> {
  return apiRequest('/admin/payments', { params: params as any })
}

export async function listPaymentsWithDetails(
  params: ListParams = {}
): Promise<Paginated<PaymentWithDetails>> {
  return apiRequest('/admin/payments/details', { params: params as any })
}

export async function getPlanStats(): Promise<PlanStats> {
  return apiRequest('/admin/plan-stats')
}

export async function listPlans(): Promise<Plan[]> {
  return apiRequest('/admin/plans')
}

export async function listComplaints(
  params: ListParams = {}
): Promise<Paginated<ComplaintWithCustomer>> {
  return apiRequest('/admin/complaints', { params: params as any })
}

export async function listMessages(
  params: ListMessagesParams = {}
): Promise<Paginated<MessageWithSender>> {
  return apiRequest('/admin/messages', { params: params as any })
}

export async function getMessageFolderCounts(): Promise<MessageFolderCounts> {
  return apiRequest('/admin/messages/folder-counts')
}

export async function listMessagesActivitySample(limit = 10): Promise<MessageWithSender[]> {
  return apiRequest('/admin/messages/activity', { params: { limit } })
}

export async function createMessage(
  _fromUserId: string,
  input: CreateMessageInput
): Promise<MessageWithSender> {
  return apiRequest('/admin/messages', { method: 'POST', body: input })
}

export async function createPlan(input: Omit<Plan, 'id'> & { id?: string }): Promise<Plan> {
  return apiRequest('/admin/plans', { method: 'POST', body: input })
}

export async function deletePlan(id: string): Promise<void> {
  await apiRequest(`/admin/plans/${id}`, { method: 'DELETE' })
}

export async function updatePlan(id: string, updates: Partial<Plan>): Promise<Plan> {
  return apiRequest(`/admin/plans/${id}`, { method: 'PATCH', body: updates })
}

export async function updateComplaintStatus(id: string, status: ComplaintStatus): Promise<Complaint> {
  return apiRequest(`/admin/complaints/${id}/status`, { method: 'PATCH', body: { status } })
}

export async function updateMessageRead(id: string, read: boolean): Promise<Message> {
  return apiRequest(`/admin/messages/${id}/read`, { method: 'PATCH', body: { read } })
}

export async function updateMessageFolder(id: string, folder: Message['folder']): Promise<Message> {
  return apiRequest(`/admin/messages/${id}/folder`, { method: 'PATCH', body: { folder } })
}

export async function starMessage(id: string): Promise<Message> {
  return updateMessageFolder(id, 'starred')
}

export async function archiveMessage(id: string): Promise<Message> {
  return updateMessageFolder(id, 'archived')
}

export async function unstarMessage(id: string): Promise<Message> {
  return updateMessageFolder(id, 'inbox')
}

export async function unarchiveMessage(id: string): Promise<Message> {
  return updateMessageFolder(id, 'inbox')
}

export async function updateRentalStatus(id: string, status: RentalStatus): Promise<Rental> {
  return apiRequest(`/admin/rentals/${id}/status`, { method: 'PATCH', body: { status } })
}

export async function deleteDealer(id: string): Promise<void> {
  await apiRequest(`/admin/dealers/${id}`, { method: 'DELETE' })
}

export async function updateDealerStatus(id: string, status: UserStatus): Promise<Dealer> {
  return apiRequest(`/admin/dealers/${id}/status`, { method: 'PATCH', body: { status } })
}

export async function updateVehicleStatus(id: string, status: VehicleStatus): Promise<Vehicle> {
  return apiRequest(`/admin/vehicles/${id}/status`, { method: 'PATCH', body: { status } })
}

export async function getAppSettings(): Promise<AdminAppSettings> {
  return apiRequest('/admin/settings')
}

export async function listBookingRequests(params: ListParams = {}): Promise<Paginated<BookingRequest>> {
  return apiRequest('/admin/booking-requests', { params: params as any })
}

export async function getBookingRequest(id: string): Promise<BookingRequest> {
  return apiRequest(`/admin/booking-requests/${id}`)
}

export async function updateBookingRequestStatus(
  id: string,
  status: BookingRequestStatus,
  declineReason?: string
): Promise<BookingRequest> {
  return apiRequest(`/admin/booking-requests/${id}/status`, {
    method: 'PATCH',
    body: { status, declineReason },
  })
}

export async function deleteBookingRequest(id: string): Promise<void> {
  await apiRequest(`/admin/booking-requests/${id}`, { method: 'DELETE' })
}

export async function updateAppSettings(
  updates: Partial<AdminAppSettings>
): Promise<AdminAppSettings> {
  return apiRequest('/admin/settings', { method: 'PATCH', body: updates })
}
