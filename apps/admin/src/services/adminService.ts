import type {
  BookingRequest,
  BookingRequestStatus,
  Complaint,
  ComplaintStatus,
  Dealer,
  KpiMetric,
  Message,
  Paginated,
  Payment,
  Plan,
  Rental,
  RentalStatus,
  TimeSeriesPoint,
  User,
  UserStatus,
  Vehicle,
  VehicleStatus,
} from '@carflow/shared'
import {
  mapBookingRequest,
  mapComplaint,
  mapDealer,
  mapMessage,
  mapPayment,
  mapPlan,
  mapProfileToUser,
  mapRental,
  mapVehicle,
  supabase,
} from '@carflow/shared'

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
  kpis: KpiMetric[]
  rentalsTrend: TimeSeriesPoint[]
  revenueTrend: TimeSeriesPoint[]
  recentRentals: RecentRentalWithDetails[]
  bookingStatusCounts: { active: number; reserved: number; completed: number; cancelled: number }
  todayBookingsCount: number
}

export interface AdminAnalyticsData {
  kpis: KpiMetric[]
  revenueTrend: TimeSeriesPoint[]
  rentalsTrend: TimeSeriesPoint[]
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

const DEFAULT_PAGE_SIZE = 10

function getRange(page: number, pageSize: number) {
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  return { from, to }
}

function buildSeries(points: Array<{ date: string; value: number }>, limit: number): TimeSeriesPoint[] {
  const sorted = points.sort((a, b) => a.date.localeCompare(b.date))
  return sorted.slice(-limit)
}

function buildMonthlySeries(rows: Array<{ created_at: string; amount?: number }>, months: number): TimeSeriesPoint[] {
  const now = new Date()
  const buckets: Record<string, number> = {}
  for (let i = months - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    buckets[key] = 0
  }
  rows.forEach((row) => {
    const date = new Date(row.created_at)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    if (key in buckets) {
      buckets[key] += row.amount ?? 1
    }
  })
  return Object.entries(buckets).map(([date, value]) => ({ date, value }))
}

export async function getAdminDashboard(): Promise<AdminDashboardData> {
  const [
    { data: paymentRows },
    rentalsCount,
    dealersCount,
    usersCount,
    recentRentalsRes,
    allRentalsRes,
    rentalsByStatusRes,
    todayRentalsRes,
  ] = await Promise.all([
    supabase.from('payments').select('amount, created_at'),
    supabase.from('rentals').select('id', { count: 'exact', head: true }),
    supabase.from('dealers').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'customer'),
    supabase.from('rentals').select('*, customer:profiles!customer_id(id, name, email), vehicle:vehicles!vehicle_id(id, name, year)').order('created_at', { ascending: false }).limit(5),
    supabase.from('rentals').select('created_at'),
    supabase.from('rentals').select('status'),
    supabase.from('rentals').select('id').gte('created_at', new Date().toISOString().slice(0, 10)),
  ])

  const totalRevenue = (paymentRows ?? []).reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0)
  const kpis: KpiMetric[] = [
    { label: 'Total Revenue', value: totalRevenue },
    { label: 'Total Rentals', value: rentalsCount.count ?? 0 },
    { label: 'Active Dealers', value: dealersCount.count ?? 0 },
    { label: 'Active Users', value: usersCount.count ?? 0 },
  ]

  const rentalsTrend = buildMonthlySeries(
    (allRentalsRes.data ?? []).map((row) => ({ created_at: row.created_at })),
    4
  )
  const revenueTrend = buildMonthlySeries(
    (paymentRows ?? []).map((row) => ({ created_at: row.created_at, amount: row.amount })),
    4
  )

  const recentRentals = (recentRentalsRes.data ?? []).map((row: any) => {
    const rental = mapRental(row)
    return {
      ...rental,
      customerName: row.customer?.name ?? null,
      customerEmail: row.customer?.email ?? null,
      vehicleName: row.vehicle?.name ?? null,
      vehicleYear: row.vehicle?.year ?? null,
    }
  })

  const rentals = rentalsByStatusRes.data ?? []
  const activeCount = rentals.filter((r) => r.status === 'active').length
  const reservedCount = rentals.filter((r) => r.status === 'reserved').length
  const completedCount = rentals.filter((r) => r.status === 'completed').length
  const cancelledCount = rentals.filter((r) => r.status === 'cancelled').length
  const todayCount = todayRentalsRes.data?.length ?? 0

  return {
    kpis,
    rentalsTrend,
    revenueTrend,
    recentRentals,
    bookingStatusCounts: { active: activeCount, reserved: reservedCount, completed: completedCount, cancelled: cancelledCount },
    todayBookingsCount: todayCount,
  }
}

export interface CustomerStats {
  total: number
  active: number
  suspended: number
  newThisMonth: number
}

export async function getCustomerStats(): Promise<CustomerStats> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [totalRes, activeRes, suspendedRes, newRes] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'customer'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'customer').eq('status', 'active'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'customer').eq('status', 'suspended'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'customer').gte('created_at', startOfMonth),
  ])

  return {
    total: totalRes.count ?? 0,
    active: activeRes.count ?? 0,
    suspended: suspendedRes.count ?? 0,
    newThisMonth: newRes.count ?? 0,
  }
}

export async function getAdminAnalytics(): Promise<AdminAnalyticsData> {
  const [{ data: payments }, rentalsRes, vehiclesRes] = await Promise.all([
    supabase.from('payments').select('amount, created_at'),
    supabase.from('rentals').select('vehicle_id, created_at'),
    supabase.from('vehicles').select('id, name, category'),
  ])

  const totalRevenue = (payments ?? []).reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0)
  const totalRentals = rentalsRes.data?.length ?? 0

  const kpis: KpiMetric[] = [
    { label: 'Total Revenue', value: totalRevenue },
    { label: 'Total Rentals', value: totalRentals },
    { label: 'Avg Duration', value: 0 },
    { label: 'Customer Growth', value: 0 },
  ]

  const revenueTrend = buildMonthlySeries(payments ?? [], 5)
  const rentalsTrend = buildMonthlySeries(
    (rentalsRes.data ?? []).map((row) => ({ created_at: row.created_at })),
    5
  )

  const categoryCounts: Record<string, number> = {}
  ;(vehiclesRes.data ?? []).forEach((vehicle) => {
    categoryCounts[vehicle.category] = (categoryCounts[vehicle.category] ?? 0) + 1
  })
  const categoryDistribution = Object.entries(categoryCounts).map(([category, value]) => ({ category, value }))

  const rentalByVehicle: Record<string, number> = {}
  ;(rentalsRes.data ?? []).forEach((rental) => {
    rentalByVehicle[rental.vehicle_id] = (rentalByVehicle[rental.vehicle_id] ?? 0) + 1
  })
  const topVehicles = Object.entries(rentalByVehicle)
    .map(([vehicleId, value]) => {
      const vehicle = vehiclesRes.data?.find((item) => item.id === vehicleId)
      return { name: vehicle?.name ?? 'Vehicle', value }
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)

  return {
    kpis,
    revenueTrend: buildSeries(revenueTrend, 5),
    rentalsTrend: buildSeries(rentalsTrend, 5),
    categoryDistribution,
    topVehicles,
  }
}

export async function listVehicles(params: ListParams = {}): Promise<Paginated<Vehicle>> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE
  const { from, to } = getRange(page, pageSize)
  const { data, count, error } = await supabase
    .from('vehicles')
    .select('*', { count: 'exact' })
    .range(from, to)
  if (error) {
    throw new Error(error.message)
  }
  return { items: (data ?? []).map(mapVehicle), total: count ?? 0, page, pageSize }
}

export async function getVehicle(id: string): Promise<Vehicle> {
  const { data, error } = await supabase.from('vehicles').select('*').eq('id', id).single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Vehicle not found')
  }
  return mapVehicle(data)
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

export async function createVehicle(input: CreateVehicleInput): Promise<Vehicle> {
  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      dealer_id: input.dealerId,
      name: input.name,
      make: input.make,
      model: input.model,
      year: input.year,
      category: input.category,
      status: input.status ?? 'available',
      price_per_day: input.pricePerDay,
      mileage: input.mileage ?? 0,
      transmission: input.transmission ?? 'automatic',
      fuel_type: input.fuelType ?? 'gas',
      seats: input.seats ?? 5,
      image_url: input.imageUrl,
    })
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to create vehicle')
  }
  return mapVehicle(data)
}

export async function deleteVehicle(id: string): Promise<void> {
  const { error } = await supabase.from('vehicles').delete().eq('id', id)
  if (error) {
    throw new Error(error.message)
  }
}

export interface CustomerWithStats extends User {
  rentalsCount: number
  totalSpent: number
  verification: 'verified' | 'unverified'
  accountStatus: UserStatus
}

export async function listCustomersWithStats(
  params: ListParams = {}
): Promise<Paginated<CustomerWithStats>> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE
  const { from, to } = getRange(page, pageSize)
  const { data: profilesData, count, error } = await supabase
    .from('profiles')
    .select('*', { count: 'exact' })
    .eq('role', 'customer')
    .order('created_at', { ascending: false })
    .range(from, to)
  if (error) {
    throw new Error(error.message)
  }
  const profiles = profilesData ?? []
  const userIds = profiles.map((p: { id: string }) => p.id)
  const { data: custData } = await supabase
    .from('customer_profiles')
    .select('user_id, status, rentals_count, total_spent')
    .in('user_id', userIds)
  const custByUserId = new Map<string, { status: string; rentals_count: number; total_spent: number }>()
  for (const c of custData ?? []) {
    custByUserId.set(c.user_id, {
      status: c.status ?? 'unverified',
      rentals_count: c.rentals_count ?? 0,
      total_spent: c.total_spent ?? 0,
    })
  }
  const items: CustomerWithStats[] = profiles.map((p: any) => {
    const user = mapProfileToUser(p)
    const cust = custByUserId.get(p.id)
    const verification = cust?.status === 'verified' ? 'verified' : 'unverified'
    return {
      ...user,
      status: p.status ?? 'active',
      rentalsCount: cust?.rentals_count ?? 0,
      totalSpent: cust?.total_spent ?? 0,
      verification,
      accountStatus: (p.status ?? 'active') as UserStatus,
    }
  })
  return { items, total: count ?? 0, page, pageSize }
}

export async function listCustomers(params: ListParams = {}): Promise<Paginated<User>> {
  const res = await listCustomersWithStats(params)
  return { ...res, items: res.items }
}

export async function getCustomerDetails(userId: string): Promise<CustomerWithStats | null> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .eq('role', 'customer')
    .single()
  if (error || !profile) return null
  const { data: cust } = await supabase
    .from('customer_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  const user = mapProfileToUser(profile)
  const verification = cust?.status === 'verified' ? 'verified' : 'unverified'
  return {
    ...user,
    status: profile.status ?? 'active',
    rentalsCount: cust?.rentals_count ?? 0,
    totalSpent: cust?.total_spent ?? 0,
    verification,
    accountStatus: (profile.status ?? 'active') as UserStatus,
  }
}

export async function updateCustomerStatus(userId: string, status: UserStatus): Promise<void> {
  const { error } = await supabase.from('profiles').update({ status }).eq('id', userId)
  if (error) {
    throw new Error(error.message)
  }
}

export async function updateCustomerProfile(
  userId: string,
  updates: { name?: string; phone?: string }
): Promise<void> {
  const payload: Record<string, unknown> = {}
  if (updates.name != null) payload.name = updates.name
  if (updates.phone != null) payload.phone = updates.phone
  if (Object.keys(payload).length === 0) return
  const { error } = await supabase.from('profiles').update(payload).eq('id', userId)
  if (error) {
    throw new Error(error.message)
  }
}

export async function updateCustomerVerification(
  userId: string,
  verification: 'verified' | 'unverified'
): Promise<void> {
  const { data: existing } = await supabase
    .from('customer_profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  const status = verification
  if (existing) {
    const { error } = await supabase
      .from('customer_profiles')
      .update({ status })
      .eq('user_id', userId)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('customer_profiles').insert({
      user_id: userId,
      status,
      join_date: new Date().toISOString().slice(0, 10),
      rentals_count: 0,
      total_spent: 0,
    })
    if (error) throw new Error(error.message)
  }
}

export async function listRentals(params: ListParams = {}): Promise<Paginated<Rental>> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE
  const { from, to } = getRange(page, pageSize)
  const { data, count, error } = await supabase
    .from('rentals')
    .select('*', { count: 'exact' })
    .range(from, to)
  if (error) {
    throw new Error(error.message)
  }
  return { items: (data ?? []).map(mapRental), total: count ?? 0, page, pageSize }
}

export interface RentalWithDetails extends Rental {
  customer?: { id: string; name?: string; email?: string }
  dealer?: { id: string; name?: string }
  vehicle?: { id: string; name?: string; year?: number }
}

export async function listRentalsWithDetails(
  params: ListParams = {}
): Promise<Paginated<RentalWithDetails>> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE
  const { from, to } = getRange(page, pageSize)
  const { data, count, error } = await supabase
    .from('rentals')
    .select(
      '*, customer:profiles!customer_id(id, name, email), dealer:dealers!dealer_id(id, name), vehicle:vehicles!vehicle_id(id, name, year)',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(from, to)
  if (error) {
    throw new Error(error.message)
  }
  const items = (data ?? []).map((row: any) => ({
    ...mapRental(row),
    customer: row.customer ?? undefined,
    dealer: row.dealer ?? undefined,
    vehicle: row.vehicle ?? undefined,
  }))
  return { items, total: count ?? 0, page, pageSize }
}

export async function listDealers(params: ListParams = {}): Promise<Paginated<Dealer>> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE
  const { from, to } = getRange(page, pageSize)
  const { data, count, error } = await supabase
    .from('dealers')
    .select('*', { count: 'exact' })
    .range(from, to)
  if (error) {
    throw new Error(error.message)
  }
  return { items: (data ?? []).map(mapDealer), total: count ?? 0, page, pageSize }
}

export async function createDealer(input: {
  name: string
  ownerEmail: string
  contactEmail: string
  contactPhone?: string
  address?: string
}): Promise<void> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', input.ownerEmail.trim())
    .single()
  if (profileError || !profile) {
    throw new Error('User not found with that email')
  }

  const { error: roleError } = await supabase
    .from('profiles')
    .update({ role: 'dealer' })
    .eq('id', profile.id)
  if (roleError) {
    throw new Error(roleError.message)
  }

  const { error } = await supabase.from('dealers').insert({
    name: input.name.trim(),
    owner_user_id: profile.id,
    contact_email: input.contactEmail.trim(),
    contact_phone: input.contactPhone?.trim() || null,
    address: input.address?.trim() || null,
    status: 'active',
  })
  if (error) {
    throw new Error(error.message)
  }
}

export async function listPayments(params: ListParams = {}): Promise<Paginated<Payment>> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE
  const { from, to } = getRange(page, pageSize)
  const { data, count, error } = await supabase
    .from('payments')
    .select('*', { count: 'exact' })
    .range(from, to)
  if (error) {
    throw new Error(error.message)
  }
  return { items: (data ?? []).map(mapPayment), total: count ?? 0, page, pageSize }
}

export interface PaymentWithDetails extends Payment {
  customerName?: string | null
  customerEmail?: string | null
  vehicleName?: string | null
}

export async function listPaymentsWithDetails(
  params: ListParams = {}
): Promise<Paginated<PaymentWithDetails>> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE
  const { from, to } = getRange(page, pageSize)
  const { data, count, error } = await supabase
    .from('payments')
    .select(
      '*, customer:profiles!customer_id(name, email), rental:rentals!rental_id(vehicle:vehicles!vehicle_id(name))',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(from, to)
  if (error) {
    throw new Error(error.message)
  }
  const items = (data ?? []).map((row: any) => ({
    ...mapPayment(row),
    customerName: row.customer?.name ?? null,
    customerEmail: row.customer?.email ?? null,
    vehicleName: row.rental?.vehicle?.name ?? null,
  }))
  return { items, total: count ?? 0, page, pageSize }
}

export interface PlanStats {
  subscriberCountByPlanId: Record<string, number>
  revenueByPlanId: Record<string, number>
  totalSubscribers: number
  totalRevenue: number
  growthRate: number
}

export async function getPlanStats(): Promise<PlanStats> {
  const [
    { data: subscriptions },
    { data: subscriptionPayments },
    { data: dealers },
    { data: invoices },
  ] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('plan_id')
      .eq('owner_type', 'dealer')
      .in('status', ['active', 'trial'])
      .not('plan_id', 'is', null),
    supabase
      .from('payments')
      .select('dealer_id, amount')
      .eq('type', 'subscription'),
    supabase.from('dealers').select('id, owner_user_id, plan_id'),
    supabase
      .from('invoices')
      .select('owner_id, amount')
      .eq('owner_type', 'dealer')
      .eq('status', 'paid'),
  ])

  const dealerPlanByDealerId = new Map<string, string>()
  const dealerPlanByUserId = new Map<string, string>()
  for (const d of dealers?.data ?? []) {
    if (d?.plan_id) {
      dealerPlanByDealerId.set(d.id, d.plan_id)
      if (d?.owner_user_id) dealerPlanByUserId.set(d.owner_user_id, d.plan_id)
    }
  }

  const subscriberCountByPlanId: Record<string, number> = {}
  for (const s of subscriptions?.data ?? []) {
    const pid = s?.plan_id
    if (!pid) continue
    subscriberCountByPlanId[pid] = (subscriberCountByPlanId[pid] ?? 0) + 1
  }

  const revenueByPlanId: Record<string, number> = {}
  for (const p of subscriptionPayments?.data ?? []) {
    const planId = p?.dealer_id ? dealerPlanByDealerId.get(p.dealer_id) : null
    if (!planId || p?.amount == null) continue
    revenueByPlanId[planId] = (revenueByPlanId[planId] ?? 0) + Number(p.amount)
  }
  for (const inv of invoices?.data ?? []) {
    const planId = inv?.owner_id ? dealerPlanByUserId.get(inv.owner_id) : null
    if (!planId || inv?.amount == null) continue
    revenueByPlanId[planId] = (revenueByPlanId[planId] ?? 0) + Number(inv.amount)
  }

  const totalSubscribers = Object.values(subscriberCountByPlanId).reduce((a, b) => a + b, 0)
  const totalRevenue = Object.values(revenueByPlanId).reduce((a, b) => a + b, 0)

  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10)
  const [{ count: thisMonthCount }, { count: lastMonthCount }] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('owner_type', 'dealer')
      .gte('start_date', thisMonthStart)
      .lt('start_date', nextMonthStart),
    supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('owner_type', 'dealer')
      .gte('start_date', lastMonthStart)
      .lt('start_date', thisMonthStart),
  ])

  const lastMonth = lastMonthCount ?? 0
  const thisMonth = thisMonthCount ?? 0
  const growthRate = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : (thisMonth > 0 ? 100 : 0)

  return {
    subscriberCountByPlanId,
    revenueByPlanId,
    totalSubscribers,
    totalRevenue,
    growthRate,
  }
}

export async function listPlans(): Promise<Plan[]> {
  const { data, error } = await supabase.from('plans').select('*')
  if (error) {
    throw new Error(error.message)
  }
  return (data ?? []).map(mapPlan)
}

export interface ComplaintWithCustomer extends Complaint {
  customerName?: string | null
  customerEmail?: string | null
}

export async function listComplaints(
  params: ListParams = {}
): Promise<Paginated<ComplaintWithCustomer>> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE
  const { from, to } = getRange(page, pageSize)
  const { data, count, error } = await supabase
    .from('complaints')
    .select('*, customer:profiles!customer_id(name, email)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)
  if (error) {
    throw new Error(error.message)
  }
  const items = (data ?? []).map((row: any) => {
    const complaint = mapComplaint(row)
    return {
      ...complaint,
      customerName: row.customer?.name ?? null,
      customerEmail: row.customer?.email ?? null,
    }
  })
  return { items, total: count ?? 0, page, pageSize }
}

export interface MessageSender {
  name: string | null
  email: string | null
  role: string | null
}

export interface MessageWithSender extends Message {
  sender: MessageSender | null
}

function mapMessageWithSender(row: any): MessageWithSender {
  const base = mapMessage(row)
  const s = row.sender
  return {
    ...base,
    sender: s
      ? { name: s.name ?? null, email: s.email ?? null, role: s.role ?? null }
      : null,
  }
}

const PROFILE_EMAIL_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface ListMessagesParams extends ListParams {
  folder?: Message['folder']
}

export async function listMessages(params: ListMessagesParams = {}): Promise<Paginated<MessageWithSender>> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE
  const { from, to } = getRange(page, pageSize)
  let query = supabase
    .from('messages')
    .select('*, sender:profiles!from_user_id(name, email, role)', { count: 'exact' })
    .order('created_at', { ascending: false })
  if (params.folder) {
    query = query.eq('folder', params.folder)
  }
  const { data, count, error } = await query.range(from, to)
  if (error) {
    throw new Error(error.message)
  }
  return { items: (data ?? []).map(mapMessageWithSender), total: count ?? 0, page, pageSize }
}

export async function getMessageFolderCounts(): Promise<{
  total: number
  unreadInbox: number
  starred: number
  archived: number
}> {
  const [totalRes, unreadInboxRes, starredRes, archivedRes] = await Promise.all([
    supabase.from('messages').select('id', { count: 'exact', head: true }),
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('read', false).eq('folder', 'inbox'),
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('folder', 'starred'),
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('folder', 'archived'),
  ])
  return {
    total: totalRes.count ?? 0,
    unreadInbox: unreadInboxRes.count ?? 0,
    starred: starredRes.count ?? 0,
    archived: archivedRes.count ?? 0,
  }
}

export async function listMessagesActivitySample(
  limit = 500
): Promise<Array<{ createdAt: string; folder: Message['folder'] }>> {
  const { data, error } = await supabase
    .from('messages')
    .select('created_at, folder')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    throw new Error(error.message)
  }
  return (data ?? []).map((row: { created_at: string; folder: Message['folder'] }) => ({
    createdAt: row.created_at,
    folder: row.folder,
  }))
}

export interface CreateMessageInput {
  to: string
  subject: string
  body: string
}

/** Resolves `to` as a profile UUID or looks up by email (case-insensitive). */
export async function createMessage(fromUserId: string, input: CreateMessageInput): Promise<MessageWithSender> {
  const toTrim = input.to.trim()
  if (!toTrim) {
    throw new Error('Recipient is required')
  }
  let toUserId = toTrim
  if (!PROFILE_EMAIL_UUID_RE.test(toTrim)) {
    const { data: profile, error: lookupError } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', toTrim)
      .maybeSingle()
    if (lookupError) {
      throw new Error(lookupError.message)
    }
    if (!profile) {
      throw new Error('No user found with that email or id')
    }
    toUserId = profile.id
  }
  const { data, error } = await supabase
    .from('messages')
    .insert({
      from_user_id: fromUserId,
      to_user_id: toUserId,
      subject: input.subject.trim(),
      body: input.body.trim(),
      read: false,
      folder: 'sent',
    })
    .select('*, sender:profiles!from_user_id(name, email, role)')
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to send message')
  }
  return mapMessageWithSender(data)
}

export async function createPlan(input: Omit<Plan, 'id'> & { id?: string }): Promise<Plan> {
  const { data, error } = await supabase
    .from('plans')
    .insert({
      id: input.id,
      name: input.name,
      tier: input.tier,
      status: input.status,
      price_monthly: input.priceMonthly,
      price_yearly: input.priceYearly,
      features: input.features,
    })
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to create plan')
  }
  return mapPlan(data)
}

export async function deletePlan(id: string): Promise<void> {
  const { error } = await supabase.from('plans').delete().eq('id', id)
  if (error) {
    throw new Error(error.message)
  }
}

export async function updatePlan(id: string, updates: Partial<Plan>): Promise<Plan> {
  const { data, error } = await supabase
    .from('plans')
    .update({
      name: updates.name,
      tier: updates.tier,
      status: updates.status,
      price_monthly: updates.priceMonthly,
      price_yearly: updates.priceYearly,
      features: updates.features,
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to update plan')
  }
  return mapPlan(data)
}

export async function updateComplaintStatus(id: string, status: ComplaintStatus): Promise<Complaint> {
  const { data, error } = await supabase
    .from('complaints')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to update complaint')
  }
  return mapComplaint(data)
}

export async function updateMessageRead(id: string, read: boolean): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .update({ read })
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to update message')
  }
  return mapMessage(data)
}

export async function updateMessageFolder(id: string, folder: Message['folder']): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .update({ folder })
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to update message folder')
  }
  return mapMessage(data)
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
  const { data, error } = await supabase
    .from('rentals')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to update rental')
  }
  return mapRental(data)
}

export async function deleteDealer(id: string): Promise<void> {
  const { error } = await supabase.from('dealers').delete().eq('id', id)
  if (error) {
    throw new Error(error.message)
  }
}

export async function updateDealerStatus(id: string, status: UserStatus): Promise<Dealer> {
  const { data, error } = await supabase
    .from('dealers')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to update dealer')
  }
  return mapDealer(data)
}

export async function updateVehicleStatus(id: string, status: VehicleStatus): Promise<Vehicle> {
  const { data, error } = await supabase
    .from('vehicles')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to update vehicle')
  }
  return mapVehicle(data)
}

export async function getAppSettings(): Promise<AdminAppSettings> {
  const { data, error } = await supabase.from('app_settings').select('*').limit(1).single()
  if (error && error.code === 'PGRST116') {
    const created = await supabase.from('app_settings').insert({}).select('*').single()
    if (created.error || !created.data) {
      throw new Error(created.error?.message ?? 'Unable to initialize settings')
    }
    return {
      id: created.data.id,
      companyName: created.data.company_name,
      supportEmail: created.data.support_email,
      supportPhone: created.data.support_phone ?? undefined,
      defaultTaxRate: created.data.default_tax_rate,
    }
  }
  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to load settings')
  }
  return {
    id: data.id,
    companyName: data.company_name,
    supportEmail: data.support_email,
    supportPhone: data.support_phone ?? undefined,
    defaultTaxRate: data.default_tax_rate,
  }
}

export async function listBookingRequests(params: ListParams = {}): Promise<Paginated<BookingRequest>> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE
  const { from, to } = getRange(page, pageSize)
  const { data, count, error } = await supabase
    .from('booking_requests')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)
  if (error) {
    throw new Error(error.message)
  }
  return { items: (data ?? []).map(mapBookingRequest), total: count ?? 0, page, pageSize }
}

export async function getBookingRequest(id: string): Promise<BookingRequest> {
  const { data, error } = await supabase
    .from('booking_requests')
    .select('*')
    .eq('id', id)
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Booking request not found')
  }
  return mapBookingRequest(data)
}

export async function updateBookingRequestStatus(
  id: string,
  status: BookingRequestStatus,
  options?: { declineReason?: string }
): Promise<BookingRequest> {
  const updates: Record<string, unknown> = { status }
  if (status === 'declined') {
    const reason = options?.declineReason?.trim()
    if (reason) updates.decline_reason = reason
  } else {
    updates.decline_reason = null
  }
  const { data, error } = await supabase.from('booking_requests').update(updates).eq('id', id).select('*').single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to update booking request')
  }
  return mapBookingRequest(data)
}

export async function deleteBookingRequest(id: string): Promise<void> {
  const { error } = await supabase.from('booking_requests').delete().eq('id', id)
  if (error) {
    throw new Error(error.message)
  }
}

export async function updateAppSettings(
  id: string,
  updates: Partial<AdminAppSettings>
): Promise<AdminAppSettings> {
  const { data, error } = await supabase
    .from('app_settings')
    .update({
      company_name: updates.companyName,
      support_email: updates.supportEmail,
      support_phone: updates.supportPhone,
      default_tax_rate: updates.defaultTaxRate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to update settings')
  }
  return {
    id: data.id,
    companyName: data.company_name,
    supportEmail: data.support_email,
    supportPhone: data.support_phone ?? undefined,
    defaultTaxRate: data.default_tax_rate,
  }
}
