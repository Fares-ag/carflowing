import type {
  BillingHistoryItem,
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

export interface DealerDashboardData {
  kpis: KpiMetric[]
  revenueTrend: TimeSeriesPoint[]
  bookingTrend: TimeSeriesPoint[]
}

export interface DealerAnalyticsData {
  revenueTrend: Array<{ month: string; revenue: number; profit: number }>
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

export async function getDealerDashboard(): Promise<DealerDashboardData> {
  const dealerId = await getDealerId()
  const [vehiclesRes, rentalsRes, paymentsRes] = await Promise.all([
    supabase.from('vehicles').select('id').eq('dealer_id', dealerId),
    supabase.from('rentals').select('created_at').eq('dealer_id', dealerId),
    supabase.from('payments').select('amount, created_at').eq('dealer_id', dealerId),
  ])

  const totalRevenue = (paymentsRes.data ?? []).reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0)
  const kpis: KpiMetric[] = [
    { label: 'Total Revenue', value: totalRevenue },
    { label: 'Total Rentals', value: rentalsRes.data?.length ?? 0 },
    { label: 'Active Vehicles', value: vehiclesRes.data?.length ?? 0 },
    { label: 'Active Leads', value: 0 },
  ]

  const revenueTrend: TimeSeriesPoint[] = (paymentsRes.data ?? []).map((payment) => ({
    date: payment.created_at,
    value: payment.amount ?? 0,
  }))
  const bookingTrend: TimeSeriesPoint[] = (rentalsRes.data ?? []).map((rental) => ({
    date: rental.created_at,
    value: 1,
  }))

  return {
    kpis,
    revenueTrend,
    bookingTrend,
  }
}

export async function getDealerAnalytics(): Promise<DealerAnalyticsData> {
  const dealerId = await getDealerId()
  const [paymentsRes, rentalsRes, vehiclesRes] = await Promise.all([
    supabase.from('payments').select('amount, created_at').eq('dealer_id', dealerId),
    supabase.from('rentals').select('created_at').eq('dealer_id', dealerId),
    supabase.from('vehicles').select('category').eq('dealer_id', dealerId),
  ])

  const revenueTrend = (paymentsRes.data ?? []).map((payment) => ({
    month: payment.created_at,
    revenue: payment.amount ?? 0,
    profit: Math.round((payment.amount ?? 0) * 0.2),
  }))
  const revenueBooking = (rentalsRes.data ?? []).map((rental) => ({
    month: rental.created_at,
    revenue: 0,
    bookings: 1,
  }))
  const utilization = (vehiclesRes.data ?? []).map((vehicle) => ({
    category: vehicle.category,
    utilization: 0,
  }))

  return {
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

export async function getSubscription(): Promise<Subscription> {
  const dealerId = await getDealerId()
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('owner_id', dealerId)
    .eq('owner_type', 'dealer')
    .order('start_date', { ascending: false })
    .limit(1)
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Subscription not found')
  }
  return mapSubscription(data)
}

export async function listPaymentMethods(): Promise<PaymentMethod[]> {
  const { data, error } = await supabase.from('payment_methods').select('*')
  if (error) {
    throw new Error(error.message)
  }
  return (data ?? []).map(mapPaymentMethod)
}

export async function listBillingHistory(): Promise<BillingHistoryItem[]> {
  const dealerId = await getDealerId()
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('owner_id', dealerId)
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

export async function createVehicle(input: Omit<Vehicle, 'id'> & { id?: string }): Promise<Vehicle> {
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
    })
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to create lead')
  }
  return mapLead(data)
}

export async function updateLead(id: string, updates: Partial<Lead>): Promise<Lead> {
  const { data, error } = await supabase
    .from('leads')
    .update({
      name: updates.name,
      email: updates.email,
      phone: updates.phone,
      source: updates.source,
      stage: updates.stage,
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
