import type {
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

export interface AdminDashboardData {
  kpis: KpiMetric[]
  rentalsTrend: TimeSeriesPoint[]
  revenueTrend: TimeSeriesPoint[]
  recentRentals: Rental[]
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
  const [{ data: paymentRows }, rentalsCount, dealersCount, usersCount, recentRentalsRes] =
    await Promise.all([
      supabase.from('payments').select('amount'),
      supabase.from('rentals').select('id', { count: 'exact', head: true }),
      supabase.from('dealers').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('rentals').select('*').order('created_at', { ascending: false }).limit(5),
    ])

  const totalRevenue = (paymentRows ?? []).reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0)
  const kpis: KpiMetric[] = [
    { label: 'Total Revenue', value: totalRevenue },
    { label: 'Total Rentals', value: rentalsCount.count ?? 0 },
    { label: 'Active Dealers', value: dealersCount.count ?? 0 },
    { label: 'Active Users', value: usersCount.count ?? 0 },
  ]

  const rentalsTrend = buildMonthlySeries(
    (recentRentalsRes.data ?? []).map((row) => ({ created_at: row.created_at })),
    4
  )
  const revenueTrend = buildMonthlySeries(
    (paymentRows ?? []).map((row) => ({ created_at: new Date().toISOString(), amount: row.amount })),
    4
  )

  return {
    kpis,
    rentalsTrend,
    revenueTrend,
    recentRentals: (recentRentalsRes.data ?? []).map(mapRental),
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

export async function listCustomers(params: ListParams = {}): Promise<Paginated<User>> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE
  const { from, to } = getRange(page, pageSize)
  const { data, count, error } = await supabase
    .from('profiles')
    .select('*', { count: 'exact' })
    .eq('role', 'customer')
    .range(from, to)
  if (error) {
    throw new Error(error.message)
  }
  return { items: (data ?? []).map(mapProfileToUser), total: count ?? 0, page, pageSize }
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

export async function listPlans(): Promise<Plan[]> {
  const { data, error } = await supabase.from('plans').select('*')
  if (error) {
    throw new Error(error.message)
  }
  return (data ?? []).map(mapPlan)
}

export async function listComplaints(params: ListParams = {}): Promise<Paginated<Complaint>> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE
  const { from, to } = getRange(page, pageSize)
  const { data, count, error } = await supabase
    .from('complaints')
    .select('*', { count: 'exact' })
    .range(from, to)
  if (error) {
    throw new Error(error.message)
  }
  return { items: (data ?? []).map(mapComplaint), total: count ?? 0, page, pageSize }
}

export async function listMessages(params: ListParams = {}): Promise<Paginated<Message>> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE
  const { from, to } = getRange(page, pageSize)
  const { data, count, error } = await supabase
    .from('messages')
    .select('*', { count: 'exact' })
    .range(from, to)
  if (error) {
    throw new Error(error.message)
  }
  return { items: (data ?? []).map(mapMessage), total: count ?? 0, page, pageSize }
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
