import type {
  BillingHistoryItem,
  BookingRequest,
  KpiMetric,
  Lead,
  LeadStage,
  Notification,
  Paginated,
  PaymentMethod,
  Subscription,
  TimeSeriesPoint,
  Vehicle,
  VehicleStatus,
} from '@carflow/shared'
import {
  mapBookingRequest,
  mapLead,
  mapNotification,
  mapPaymentMethod,
  mapSubscription,
  mapVehicle,
  supabase,
} from '@carflow/shared'

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
  kpis: KpiMetric[]
  revenueTrend: TimeSeriesPoint[]
  bookingTrend: TimeSeriesPoint[]
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

const DEFAULT_PAGE_SIZE = 10

function getRange(page: number, pageSize: number) {
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  return { from, to }
}

async function getAuthedUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    throw new Error(error?.message ?? 'Not authenticated')
  }
  return data.user.id
}

async function getDealerId(): Promise<string> {
  const userId = await getAuthedUserId()
  const { data, error } = await supabase
    .from('dealers')
    .select('id')
    .eq('owner_user_id', userId)
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Dealer profile not found')
  }
  return data.id
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function buildDealerRevenueChart(payments: Array<{ created_at: string; amount?: number }>, months: number) {
  const now = new Date()
  const buckets: Record<string, number> = {}
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    buckets[key] = 0
  }
  payments.forEach((p) => {
    const date = new Date(p.created_at)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    if (key in buckets) buckets[key] += Number(p.amount ?? 0)
  })
  return Object.entries(buckets).map(([key, value]) => {
    const [y, m] = key.split('-')
    const monthLabel = MONTH_NAMES[parseInt(m, 10) - 1] ?? m
    return { month: `${monthLabel} ${y}`, revenue: value }
  })
}

export async function getDealerDashboard(): Promise<DealerDashboardData> {
  const dealerId = await getDealerId()
  const [vehiclesRes, rentalsRes, paymentsRes, leadsCountRes, recentRentalsRes] = await Promise.all([
    supabase.from('vehicles').select('id, name, status').eq('dealer_id', dealerId),
    supabase.from('rentals').select('created_at').eq('dealer_id', dealerId),
    supabase.from('payments').select('amount, created_at').eq('dealer_id', dealerId),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('dealer_id', dealerId),
    supabase.from('rentals').select('*, vehicle:vehicles!vehicle_id(id, name), customer:profiles!customer_id(id, name)').eq('dealer_id', dealerId).order('created_at', { ascending: false }).limit(5),
  ])

  const totalRevenue = (paymentsRes.data ?? []).reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0)
  const kpis: KpiMetric[] = [
    { label: 'Total Revenue', value: totalRevenue },
    { label: 'Total Rentals', value: rentalsRes.data?.length ?? 0 },
    { label: 'Active Vehicles', value: vehiclesRes.data?.length ?? 0 },
    { label: 'Active Leads', value: leadsCountRes.count ?? 0 },
  ]

  const revenueTrend: TimeSeriesPoint[] = (paymentsRes.data ?? []).map((payment) => ({
    date: payment.created_at,
    value: Number(payment.amount ?? 0),
  }))
  const bookingTrend: TimeSeriesPoint[] = (rentalsRes.data ?? []).map((rental) => ({
    date: rental.created_at,
    value: 1,
  }))
  const revenueChartData = buildDealerRevenueChart(paymentsRes.data ?? [], 6)
  const recentRentals = (recentRentalsRes.data ?? []).map((r: any) => ({
    id: r.id,
    customerName: r.customer?.name ?? 'Customer',
    vehicleName: r.vehicle?.name ?? 'Unknown',
    status: r.status,
    createdAt: r.created_at,
    paymentStatus: r.payment_status ?? 'pending',
    totalAmount: Number(r.total_amount ?? 0),
  }))
  const vehiclesWithStatus = (vehiclesRes.data ?? []).map((v: any) => ({
    id: v.id,
    name: v.name,
    status: v.status ?? 'available',
  }))

  return {
    kpis,
    revenueTrend,
    bookingTrend,
    revenueChartData,
    recentRentals,
    vehiclesWithStatus,
  }
}

export async function getDealerAnalytics(): Promise<DealerAnalyticsData> {
  const dealerId = await getDealerId()
  const [paymentsRes, rentalsRes, vehiclesRes, activeRentalsRes] = await Promise.all([
    supabase.from('payments').select('amount, created_at').eq('dealer_id', dealerId),
    supabase.from('rentals').select('created_at, customer_id, status').eq('dealer_id', dealerId),
    supabase.from('vehicles').select('category, id').eq('dealer_id', dealerId),
    supabase.from('rentals').select('id').eq('dealer_id', dealerId).in('status', ['active', 'reserved']),
  ])

  const totalRevenue = (paymentsRes.data ?? []).reduce((sum, p) => sum + Number(p.amount ?? 0), 0)
  const activeBookings = activeRentalsRes.data?.length ?? 0
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const uniqueCustomersThisMonth = new Set(
    (rentalsRes.data ?? []).filter((r) => String(r.created_at).startsWith(thisMonth)).map((r) => r.customer_id)
  ).size
  const totalVehicles = vehiclesRes.data?.length ?? 1
  const rentedCount = (rentalsRes.data ?? []).filter((r) => r.status === 'active').length
  const fleetUtilization = totalVehicles > 0 ? Math.round((rentedCount / totalVehicles) * 100) : 0

  const revenueTrend = (paymentsRes.data ?? []).map((payment) => {
    const d = new Date(payment.created_at)
    const monthLabel = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
    const amount = Number(payment.amount ?? 0)
    return {
      month: monthLabel,
      revenue: amount,
      profit: Math.round(amount * 0.2),
      createdAt: payment.created_at,
    }
  })
  const revenueBooking = (rentalsRes.data ?? []).map((rental) => ({
    month: rental.created_at,
    revenue: 0,
    bookings: 1,
  }))
  const utilization = (vehiclesRes.data ?? []).map((vehicle) => ({
    category: vehicle.category ?? 'other',
    utilization: totalVehicles > 0 ? Math.round((rentedCount / totalVehicles) * 100) : 0,
  }))

  return {
    totalRevenue,
    activeBookings,
    newCustomersThisMonth: uniqueCustomersThisMonth,
    fleetUtilization,
    revenueTrend,
    customerDemographics: [],
    revenueBooking,
    bookingTime: [],
    utilization,
  }
}

export async function listInventory(params: ListParams = {}): Promise<Paginated<Vehicle>> {
  const dealerId = await getDealerId()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE
  const { from, to } = getRange(page, pageSize)
  const { data, count, error } = await supabase
    .from('vehicles')
    .select('*', { count: 'exact' })
    .eq('dealer_id', dealerId)
    .range(from, to)
  if (error) {
    throw new Error(error.message)
  }
  return { items: (data ?? []).map(mapVehicle), total: count ?? 0, page, pageSize }
}

export interface BookingRequestWithVehicle extends BookingRequest {
  vehicle?: { id: string; name: string; image_url?: string; make?: string; model?: string }
  customer?: { email?: string; name?: string | null }
}

export interface CustomerDocumentsForDealer {
  qidDocumentPath: string | null
  driversLicensePath: string | null
}

export async function getCustomerDocumentsForDealer(
  customerId: string
): Promise<CustomerDocumentsForDealer> {
  const { data, error } = await supabase
    .from('customer_profiles')
    .select('qid_document_path, drivers_license_path')
    .eq('user_id', customerId)
    .maybeSingle()
  if (error) {
    throw new Error(error.message)
  }
  return {
    qidDocumentPath: data?.qid_document_path ?? null,
    driversLicensePath: data?.drivers_license_path ?? null,
  }
}

export async function listBookingRequests(
  params: ListParams = {}
): Promise<Paginated<BookingRequestWithVehicle>> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE
  const { from, to } = getRange(page, pageSize)
  const { data, count, error } = await supabase
    .from('booking_requests')
    .select(
      '*, vehicle:vehicles(id, name, image_url, make, model), customer:profiles!customer_id(email, name)',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(from, to)
  if (error) {
    throw new Error(error.message)
  }
  const items = (data ?? []).map((row: any) => ({
    ...mapBookingRequest(row),
    vehicle: row.vehicle ?? undefined,
    customer: row.customer
      ? { email: row.customer.email ?? undefined, name: row.customer.name ?? null }
      : undefined,
  }))
  return { items, total: count ?? 0, page, pageSize }
}

export async function updateBookingRequestStatus(
  id: string,
  status: 'pending' | 'approved' | 'declined',
  options?: { declineReason?: string }
): Promise<void> {
  const updates: Record<string, unknown> = { status }
  if (status === 'declined') {
    const reason = options?.declineReason?.trim()
    if (!reason) {
      throw new Error('Please provide a reason the customer can understand when declining a request.')
    }
    updates.decline_reason = reason
  } else {
    updates.decline_reason = null
  }
  const { error } = await supabase.from('booking_requests').update(updates).eq('id', id)
  if (error) {
    throw new Error(error.message)
  }
}

/** Record cash / transfer / POS payment collected outside the platform. Updates rental.payment_status. */
export async function recordOfflinePayment(input: {
  rentalId: string
  amount: number
  method: 'card' | 'bank' | 'wallet'
}): Promise<void> {
  const dealerId = await getDealerId()
  const { data: rental, error: rErr } = await supabase
    .from('rentals')
    .select('id, customer_id, dealer_id, payment_status, total_amount')
    .eq('id', input.rentalId)
    .single()
  if (rErr || !rental) {
    throw new Error(rErr?.message ?? 'Rental not found')
  }
  if (rental.dealer_id !== dealerId) {
    throw new Error('Not authorized for this rental')
  }
  if (rental.payment_status === 'completed') {
    throw new Error('This rental is already marked as paid')
  }
  const amount = input.amount > 0 ? input.amount : Number(rental.total_amount ?? 0)
  if (amount <= 0) {
    throw new Error('Enter a positive amount (or set rental total in admin)')
  }

  const { error: pErr } = await supabase.from('payments').insert({
    rental_id: input.rentalId,
    customer_id: rental.customer_id,
    dealer_id: dealerId,
    amount,
    status: 'completed',
    type: 'rental',
    method: input.method,
  })
  if (pErr) {
    throw new Error(pErr.message)
  }

  const { error: uErr } = await supabase
    .from('rentals')
    .update({ payment_status: 'completed' })
    .eq('id', input.rentalId)
  if (uErr) {
    throw new Error(uErr.message)
  }
}

export async function listLeads(params: ListParams = {}): Promise<Paginated<Lead>> {
  const dealerId = await getDealerId()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE
  const { from, to } = getRange(page, pageSize)
  const { data, count, error } = await supabase
    .from('leads')
    .select('*', { count: 'exact' })
    .eq('dealer_id', dealerId)
    .range(from, to)
  if (error) {
    throw new Error(error.message)
  }
  return { items: (data ?? []).map(mapLead), total: count ?? 0, page, pageSize }
}

export async function listNotifications(params: ListParams = {}): Promise<Paginated<Notification>> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE
  const { from, to } = getRange(page, pageSize)
  const { data, count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact' })
    .range(from, to)
  if (error) {
    throw new Error(error.message)
  }
  return { items: (data ?? []).map(mapNotification), total: count ?? 0, page, pageSize }
}

export async function getDealerVehicleCount(): Promise<number> {
  const dealerId = await getDealerId()
  const { count, error } = await supabase
    .from('vehicles')
    .select('id', { count: 'exact', head: true })
    .eq('dealer_id', dealerId)
  if (error) {
    throw new Error(error.message)
  }
  return count ?? 0
}

export async function getSubscription(): Promise<Subscription> {
  const userId = await getAuthedUserId()
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('owner_id', userId)
    .eq('owner_type', 'dealer')
    .order('start_date', { ascending: false })
    .limit(1)
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Subscription not found')
  }
  const mapped = mapSubscription(data)
  if (data.plan_id) {
    const { data: planRow } = await supabase
      .from('plans')
      .select('name, price_monthly, price_yearly, features')
      .eq('id', data.plan_id)
      .single()
    if (planRow) {
      return {
        ...mapped,
        plan: {
          name: planRow.name,
          priceMonthly: Number(planRow.price_monthly),
          priceYearly: Number(planRow.price_yearly),
          features: Array.isArray(planRow.features) ? planRow.features : [],
        },
      }
    }
  }
  return mapped
}

export async function listPaymentMethods(): Promise<PaymentMethod[]> {
  const { data, error } = await supabase.from('payment_methods').select('*')
  if (error) {
    throw new Error(error.message)
  }
  return (data ?? []).map(mapPaymentMethod)
}

export async function removePaymentMethod(id: string): Promise<void> {
  const { error } = await supabase.from('payment_methods').delete().eq('id', id)
  if (error) {
    throw new Error(error.message)
  }
}

export async function listBillingHistory(): Promise<BillingHistoryItem[]> {
  const userId = await getAuthedUserId()
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('owner_id', userId)
    .eq('owner_type', 'dealer')
  if (error) {
    throw new Error(error.message)
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    date: row.date,
    amount: row.amount,
    status: row.status,
    description: row.description,
  }))
}

export type CreateVehicleInput = Omit<Vehicle, 'id' | 'dealerId'> & { id?: string }

export async function createVehicle(input: CreateVehicleInput): Promise<Vehicle> {
  const dealerId = await getDealerId()
  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      id: input.id,
      dealer_id: dealerId,
      name: input.name,
      make: input.make,
      model: input.model,
      year: input.year,
      category: input.category,
      status: input.status,
      price_per_day: input.pricePerDay,
      mileage: input.mileage,
      transmission: input.transmission,
      fuel_type: input.fuelType,
      seats: input.seats,
      image_url: input.imageUrl,
    })
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to create vehicle')
  }
  return mapVehicle(data)
}

export async function updateVehicle(id: string, updates: Partial<Vehicle>): Promise<Vehicle> {
  const { data, error } = await supabase
    .from('vehicles')
    .update({
      name: updates.name,
      make: updates.make,
      model: updates.model,
      year: updates.year,
      category: updates.category,
      status: updates.status,
      price_per_day: updates.pricePerDay,
      mileage: updates.mileage,
      transmission: updates.transmission,
      fuel_type: updates.fuelType,
      seats: updates.seats,
      image_url: updates.imageUrl,
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to update vehicle')
  }
  return mapVehicle(data)
}

export async function updateVehicleStatus(id: string, status: VehicleStatus): Promise<Vehicle> {
  const { data, error } = await supabase
    .from('vehicles')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to update vehicle status')
  }
  return mapVehicle(data)
}

export async function removeVehicle(id: string): Promise<void> {
  const { error } = await supabase.from('vehicles').delete().eq('id', id)
  if (error) {
    throw new Error(error.message)
  }
}

export interface CreateLeadInput {
  name: string
  email: string
  phone?: string
  source: string
  stage: LeadStage
  priority?: string
  notes?: string
}

export async function createLead(input: CreateLeadInput): Promise<Lead> {
  const dealerId = await getDealerId()
  const { data, error } = await supabase
    .from('leads')
    .insert({
      dealer_id: dealerId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      source: input.source,
      stage: input.stage,
      priority: input.priority,
      notes: input.notes,
    })
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to create lead')
  }
  return mapLead(data)
}

export async function updateLead(id: string, updates: Partial<Lead> & { priority?: string; notes?: string }): Promise<Lead> {
  const { data, error } = await supabase
    .from('leads')
    .update({
      name: updates.name,
      email: updates.email,
      phone: updates.phone,
      source: updates.source,
      stage: updates.stage,
      priority: updates.priority,
      notes: updates.notes,
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to update lead')
  }
  return mapLead(data)
}

export async function removeLead(id: string): Promise<void> {
  const { error } = await supabase.from('leads').delete().eq('id', id)
  if (error) {
    throw new Error(error.message)
  }
}

export async function markNotificationRead(id: string): Promise<Notification> {
  const { data, error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to update notification')
  }
  return mapNotification(data)
}

export async function markAllNotificationsRead(): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .update({ read: true })
    .select('*')
  if (error) {
    throw new Error(error.message)
  }
  return (data ?? []).map(mapNotification)
}

export async function getDealerSettings(): Promise<DealerSettings> {
  const dealerId = await getDealerId()
  const { data, error } = await supabase
    .from('dealers')
    .select(
      'id, name, contact_email, contact_phone, website, address, description, license_number, tax_id, business_hours, logo_url'
    )
    .eq('id', dealerId)
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to load dealer settings')
  }
  return {
    id: data.id,
    name: data.name,
    contactEmail: data.contact_email,
    contactPhone: data.contact_phone ?? undefined,
    website: data.website ?? undefined,
    address: data.address ?? undefined,
    description: data.description ?? undefined,
    licenseNumber: data.license_number ?? undefined,
    taxId: data.tax_id ?? undefined,
    businessHours: data.business_hours ?? [],
    logoUrl: data.logo_url ?? undefined,
  }
}

export async function updateDealerSettings(
  id: string,
  updates: Partial<DealerSettings>
): Promise<DealerSettings> {
  const { data, error } = await supabase
    .from('dealers')
    .update({
      name: updates.name,
      contact_email: updates.contactEmail,
      contact_phone: updates.contactPhone,
      website: updates.website,
      address: updates.address,
      description: updates.description,
      license_number: updates.licenseNumber,
      tax_id: updates.taxId,
      business_hours: updates.businessHours,
      logo_url: updates.logoUrl,
    })
    .eq('id', id)
    .select(
      'id, name, contact_email, contact_phone, website, address, description, license_number, tax_id, business_hours, logo_url'
    )
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to update dealer settings')
  }
  return {
    id: data.id,
    name: data.name,
    contactEmail: data.contact_email,
    contactPhone: data.contact_phone ?? undefined,
    website: data.website ?? undefined,
    address: data.address ?? undefined,
    description: data.description ?? undefined,
    licenseNumber: data.license_number ?? undefined,
    taxId: data.tax_id ?? undefined,
    businessHours: data.business_hours ?? [],
    logoUrl: data.logo_url ?? undefined,
  }
}
