import type {
  AuditLog,
  BookingRequest,
  BookingRequestStatus,
  Complaint,
  ComplaintReply,
  ComplaintStatus,
  Dealer,
  Invoice,
  Message,
  Paginated,
  Payment,
  Plan,
  Rental,
  RentalEvent,
  RentalStatus,
  User,
  UserStatus,
  Vehicle,
  VehicleStatus,
} from '@carflow/shared'
export type { ComplaintReply } from '@carflow/shared'
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
  platformCommissionRate: number
  billingGraceDays: number
  paymentHoldTtlMinutes: number
  cancelNoticeDays: number
  swapEligibleDays: number
  subscriptionDepositAmount: number
  signupsEnabled: boolean
  onlinePaymentsEnabled: boolean
  newBookingsEnabled: boolean
  updatedAt?: string
}

export interface AdminBusinessSettings {
  platformCommissionRate: number
  billingGraceDays: number
  paymentHoldTtlMinutes: number
  cancelNoticeDays: number
  swapEligibleDays: number
  subscriptionDepositAmount: number
  updatedAt: string
}

export interface AdminFeatureFlags {
  checkoutEnabled: boolean
  onlinePaymentsEnabled: boolean
  signupsEnabled: boolean
  dealerSignupsEnabled: boolean
  updatedAt: string
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
  qidDocumentPath?: string
  driversLicensePath?: string
}

export interface CustomerVerificationUpdate {
  status: 'verified' | 'unverified'
  reason?: string
  decision?: 'approve' | 'reject'
}

export interface RentalWithDetails extends Rental {
  vehicle?: Vehicle
  customer?: User
  dealer?: { id: string; name: string }
}

/** Audit log row as returned by the admin API (actor joined in). */
export interface AuditLogEntry extends AuditLog {
  actorName?: string
  actorEmail?: string
}

/** `GET /admin/rentals/:id/full` — rental spread plus every related record. */
export interface RentalFullDetails extends RentalWithDetails {
  events: RentalEvent[]
  invoices: Invoice[]
  payments: Payment[]
  auditTrail: AuditLogEntry[]
}

export interface ListAuditLogsParams extends ListParams {
  entityType?: string
  entityId?: string
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
    (User & {
      customerStatus?: string
      rentalsCount?: number
      totalSpent?: number
      qidDocumentPath?: string
      driversLicensePath?: string
    }) | null
  >(`/admin/customers/${userId}`)
  if (!u) return null
  return {
    ...u,
    rentalsCount: u.rentalsCount ?? 0,
    totalSpent: u.totalSpent ?? 0,
    verification: u.customerStatus === 'verified' ? 'verified' : 'unverified',
    accountStatus: (u.status as UserStatus) ?? 'active',
    qidDocumentPath: u.qidDocumentPath,
    driversLicensePath: u.driversLicensePath,
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
  status: 'verified' | 'unverified' | 'active' | 'suspended',
  options?: Pick<CustomerVerificationUpdate, 'reason' | 'decision'>
): Promise<void> {
  await apiRequest(`/admin/customers/${userId}/verification`, {
    method: 'PATCH',
    body: {
      status,
      ...(options?.reason ? { reason: options.reason } : {}),
      ...(options?.decision ? { decision: options.decision } : {}),
    },
  })
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
  /** Net revenue (gross minus everything refunded). */
  totalRevenue: number
  grossRevenue: number
  pendingCount: number
  completedCount: number
  refundedCount: number
  refundTotal: number
  needsRefundCount: number
  stuckPendingCount: number
  overdueInvoicesCount: number
}

export async function getPaymentSummary(): Promise<PaymentSummary> {
  return apiRequest('/admin/payments/summary')
}

export interface RefundPaymentInput {
  /** Omit to refund the full remaining amount. Must be ≤ remaining. */
  amount?: number
  /** Set true after processing the refund manually (SkipCash dashboard/cash). */
  manualConfirmed?: boolean
}

/**
 * Refund a payment. Throws ApiError with status 409 and
 * `details.requiresManualConfirmation === true` when the provider refund is
 * not possible — no money has moved; retry with `manualConfirmed: true` after
 * processing it manually.
 */
export async function refundPayment(
  paymentId: string,
  input: RefundPaymentInput = {}
): Promise<Payment> {
  return apiRequest(`/admin/payments/${paymentId}/refund`, { method: 'POST', body: input })
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

export async function listComplaintReplies(complaintId: string): Promise<ComplaintReply[]> {
  return apiRequest(`/admin/complaints/${complaintId}/replies`)
}

export async function replyToComplaint(complaintId: string, body: string): Promise<ComplaintReply> {
  return apiRequest(`/admin/complaints/${complaintId}/replies`, { method: 'POST', body: { body } })
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

/**
 * Change a rental's status. The backend validates transitions
 * (reserved→active/cancelled, active↔past_due, active/past_due→completed/cancelled)
 * and rejects anything else with 409 "Illegal transition x → y".
 */
export async function updateRentalStatus(
  id: string,
  status: RentalStatus,
  note?: string
): Promise<Rental> {
  return apiRequest(`/admin/rentals/${id}/status`, { method: 'PATCH', body: { status, note } })
}

/** Immediate cancellation of any open rental: frees the vehicle, voids invoices. */
export async function cancelRental(id: string, reason?: string): Promise<Rental> {
  return apiRequest(`/admin/rentals/${id}/cancel`, { method: 'POST', body: { reason } })
}

/** Rental drill-down: rental + vehicle + customer + dealer + events/invoices/payments/audit. */
export async function getRentalFull(id: string): Promise<RentalFullDetails> {
  return apiRequest(`/admin/rentals/${id}/full`)
}

export async function listAuditLogs(
  params: ListAuditLogsParams = {}
): Promise<Paginated<AuditLogEntry>> {
  return apiRequest('/admin/audit-logs', { params: params as any })
}

export async function deleteDealer(id: string): Promise<void> {
  await apiRequest(`/admin/dealers/${id}`, { method: 'DELETE' })
}

export async function updateDealerStatus(id: string, status: UserStatus): Promise<Dealer> {
  return apiRequest(`/admin/dealers/${id}/status`, { method: 'PATCH', body: { status } })
}

export async function updateDealerBankDetails(
  id: string,
  input: {
    verified?: boolean
    bankAccountName?: string
    bankName?: string
    bankIban?: string
  }
): Promise<Dealer> {
  return apiRequest(`/admin/dealers/${id}/bank-details`, { method: 'PATCH', body: input })
}

export interface AdminPayout {
  id: string
  dealerId: string
  dealerName: string
  amount: number
  status: string
  periodStart: string | null
  periodEnd: string | null
  paidAt: string | null
  createdAt: string
}

export async function listPayouts(params: ListParams = {}): Promise<Paginated<AdminPayout>> {
  return apiRequest('/admin/payouts', { params: params as any })
}

export async function generatePayouts(): Promise<{ created: number }> {
  return apiRequest('/admin/payouts/generate', { method: 'POST' })
}

export async function markPayoutPaid(id: string, note?: string): Promise<{ ok: boolean }> {
  return apiRequest(`/admin/payouts/${id}/mark-paid`, { method: 'POST', body: { note } })
}

export async function updateVehicleStatus(id: string, status: VehicleStatus): Promise<Vehicle> {
  return apiRequest(`/admin/vehicles/${id}/status`, { method: 'PATCH', body: { status } })
}

export async function getAppSettings(): Promise<AdminAppSettings> {
  return apiRequest('/admin/settings')
}

export async function getBusinessSettings(): Promise<AdminBusinessSettings> {
  return apiRequest('/admin/settings/business')
}

export async function getFeatureFlags(): Promise<AdminFeatureFlags> {
  return apiRequest('/admin/settings/flags')
}

export async function updateFeatureFlags(
  updates: Partial<Omit<AdminFeatureFlags, 'updatedAt'>>
): Promise<AdminFeatureFlags> {
  return apiRequest('/admin/settings/flags', { method: 'PATCH', body: updates })
}

export async function updateBusinessSettings(
  updates: Partial<AdminBusinessSettings>
): Promise<AdminBusinessSettings> {
  return apiRequest('/admin/settings/business', { method: 'PATCH', body: updates })
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

export interface JobRun {
  id: string
  startedAt: string
  completedAt: string | null
  invoices: number
  overdue: number
  reminders: number
  reconciled: number
  holdsReleased: number
  payouts: number
  error?: string
}

export interface JobRunResult {
  invoices?: number
  overdue?: number
  reconciled?: number
  holdsReleased?: number
  payouts?: number
  reminders?: number
  skipped?: boolean
}

export interface AnalyticsRollups {
  revenue: Array<{ date: string; value: number }>
  rentals: Array<{ date: string; value: number }>
  metrics: {
    activationRate: number
    approvalSlaHours: number
    paymentSuccessRate: number
    churnRate: number
    counts: {
      signups: number
      emailVerified: number
      bookingsApproved: number
      paymentsCompleted: number
      paymentsFailed: number
      rentalsActivated: number
      cancelRequested: number
    }
  }
  metricTrends: {
    activation_rate: Array<{ date: string; value: number }>
    approval_sla_hours: Array<{ date: string; value: number }>
    payment_success_rate: Array<{ date: string; value: number }>
    churn_rate: Array<{ date: string; value: number }>
  }
}

export interface StaffInvite {
  id: string
  email: string
  name: string
  role: 'admin' | 'finance' | 'ops' | 'support'
  expiresAt: string
  acceptedAt: string | null
  createdAt: string
}

export interface StaffMember {
  id: string
  email: string
  name: string
  role: 'admin' | 'finance' | 'ops' | 'support'
  status: 'active' | 'suspended' | 'pending'
  createdAt: string
}

export interface CreateStaffInviteInput {
  email: string
  name: string
  role: 'admin' | 'finance' | 'ops' | 'support'
}

export type DisputeStatus = 'open' | 'investigating' | 'won' | 'lost' | 'closed'

export interface PaymentDispute {
  id: string
  paymentId: string
  customerId: string
  dealerId: string
  status: DisputeStatus
  reason: string
  amount: number
  providerReference?: string
  assignedTo?: string
  resolution?: string
  createdAt: string
  resolvedAt: string | null
}

export interface ListDisputesParams extends ListParams {
  status?: DisputeStatus
}

export interface CreateDisputeInput {
  paymentId: string
  reason: string
  amount?: number
  providerReference?: string
}

export interface UpdateDisputeInput {
  status?: DisputeStatus
  resolution?: string
  assignedTo?: string
}

export interface VehicleSearchParams extends ListParams {
  q?: string
  status?: VehicleStatus
  category?: Vehicle['category']
  dealerId?: string
  minPrice?: number
  maxPrice?: number
}

export interface AdminMaintenanceRecord {
  id: string
  vehicleId: string
  dealerId: string
  rentalId: string | null
  status: string
  title: string
  description: string | null
  reportedBy: string | null
  completedAt: string | null
  createdAt: string
}

export interface ListMaintenanceParams extends ListParams {
  status?: string
}

export async function listJobRuns(params: ListParams = {}): Promise<Paginated<JobRun>> {
  return apiRequest('/admin/jobs/runs', { params: params as any })
}

export async function runJobOnce(): Promise<JobRunResult> {
  return apiRequest('/admin/jobs/run-once', { method: 'POST' })
}

export async function getAnalyticsRollups(days = 30): Promise<AnalyticsRollups> {
  return apiRequest('/admin/analytics/rollups', { params: { days } })
}

export async function refreshAnalyticsRollups(): Promise<{ written: number }> {
  return apiRequest('/admin/analytics/rollups/refresh', { method: 'POST' })
}

export async function listStaffInvites(): Promise<{ items: StaffInvite[] }> {
  return apiRequest('/admin/staff/invites')
}

export async function listStaffMembers(): Promise<{ items: StaffMember[] }> {
  return apiRequest('/admin/staff')
}

export async function createStaffInvite(input: CreateStaffInviteInput): Promise<StaffInvite> {
  return apiRequest('/admin/staff/invites', { method: 'POST', body: input })
}

export async function resendStaffInvite(id: string): Promise<StaffInvite> {
  return apiRequest(`/admin/staff/invites/${id}/resend`, { method: 'POST' })
}

export async function revokeStaffInvite(id: string): Promise<void> {
  return apiRequest(`/admin/staff/invites/${id}`, { method: 'DELETE' })
}

export async function deactivateStaffMember(id: string): Promise<StaffMember> {
  return apiRequest(`/admin/staff/${id}/deactivate`, { method: 'PATCH' })
}

export type BroadcastSegment =
  | 'all_customers'
  | 'all_dealers'
  | 'overdue_customers'
  | 'active_subscribers'
  | 'pending_dealers'

export interface AdminBroadcast {
  id: string
  segment: BroadcastSegment
  subject: string
  body: string
  channels: { inApp: boolean; email: boolean }
  sentCount: number
  createdBy: string
  createdAt: string
}

export async function listBroadcasts(): Promise<{ items: AdminBroadcast[] }> {
  return apiRequest('/admin/broadcasts')
}

export async function previewBroadcast(
  segment: BroadcastSegment
): Promise<{ segment: BroadcastSegment; recipientCount: number }> {
  return apiRequest('/admin/broadcasts/preview', { params: { segment } })
}

export async function createBroadcast(input: {
  segment: BroadcastSegment
  subject: string
  body: string
  channels: { inApp: boolean; email: boolean }
}): Promise<AdminBroadcast> {
  return apiRequest('/admin/broadcasts', { method: 'POST', body: input })
}

export async function listDisputes(
  params: ListDisputesParams = {}
): Promise<Paginated<PaymentDispute>> {
  return apiRequest('/admin/disputes', { params: params as any })
}

export async function createDispute(
  input: CreateDisputeInput
): Promise<{ id: string; status: string }> {
  return apiRequest('/admin/disputes', { method: 'POST', body: input })
}

export async function updateDispute(
  id: string,
  input: UpdateDisputeInput
): Promise<PaymentDispute> {
  return apiRequest(`/admin/disputes/${id}`, { method: 'PATCH', body: input })
}

export async function searchVehicles(params: VehicleSearchParams = {}): Promise<Paginated<Vehicle>> {
  return apiRequest('/admin/vehicles/search', { params: params as any })
}

export async function listAdminMaintenance(
  params: ListMaintenanceParams = {}
): Promise<Paginated<AdminMaintenanceRecord>> {
  return apiRequest('/admin/maintenance', { params: params as any })
}

export async function completeAdminMaintenance(id: string): Promise<{ ok: boolean }> {
  return apiRequest(`/admin/maintenance/${id}/complete`, { method: 'PATCH' })
}

export interface AdminPromoCode {
  id: string
  code: string
  discountType: 'percent' | 'fixed'
  discountValue: number
  minTermMonths: number
  maxUses: number | null
  usedCount: number
  remainingUses: number | null
  perCustomerLimit: number
  firstInvoiceOnly: boolean
  validFrom: string | null
  validUntil: string | null
  active: boolean
  createdAt: string
}

export async function listPromoCodes(): Promise<AdminPromoCode[]> {
  const data = await apiRequest<{ items: AdminPromoCode[] }>('/admin/promo-codes')
  return data.items
}

export async function createPromoCode(input: {
  code: string
  discountType: 'percent' | 'fixed'
  discountValue: number
  minTermMonths?: number
  maxUses?: number | null
  perCustomerLimit?: number
  firstInvoiceOnly?: boolean
  validFrom?: string | null
  validUntil?: string | null
  active?: boolean
}): Promise<AdminPromoCode> {
  return apiRequest('/admin/promo-codes', { method: 'POST', body: input })
}

export async function updatePromoCode(
  id: string,
  patch: Partial<{
    discountType: 'percent' | 'fixed'
    discountValue: number
    minTermMonths: number
    maxUses: number | null
    perCustomerLimit: number
    firstInvoiceOnly: boolean
    validFrom: string | null
    validUntil: string | null
    active: boolean
  }>
): Promise<AdminPromoCode> {
  return apiRequest(`/admin/promo-codes/${id}`, { method: 'PATCH', body: patch })
}

export async function disablePromoCode(id: string): Promise<AdminPromoCode> {
  return apiRequest(`/admin/promo-codes/${id}`, { method: 'DELETE' })
}
