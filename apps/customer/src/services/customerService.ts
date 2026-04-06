import type {
  BookingRequest,
  BookingRequestStatus,
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
import {
  mapBookingRequest,
  mapFavorite,
  mapInvoice,
  mapNotification,
  mapPaymentMethod,
  mapRental,
  mapSubscription,
  mapVehicle,
  supabase,
} from '@carflow/shared'

export interface ListParams {
  page?: number
  pageSize?: number
}

export interface CustomerDashboardData {
  upcomingRentals: Rental[]
  recentRentals: Rental[]
  favoritesCount: number
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

export async function getCustomerDashboard(): Promise<CustomerDashboardData> {
  const [rentalsRes, favoritesRes] = await Promise.all([
    supabase.from('rentals').select('*'),
    supabase.from('favorites').select('id'),
  ])
  const rentals = (rentalsRes.data ?? []).map(mapRental)
  const upcomingRentals = rentals.filter(rental => rental.status === 'reserved').slice(0, 3)
  return {
    upcomingRentals,
    recentRentals: rentals.slice(0, 5),
    favoritesCount: favoritesRes.data?.length ?? 0,
  }
}

export async function listCatalogVehicles(params: ListParams = {}): Promise<Paginated<Vehicle>> {
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
  vehicle?: { id: string; name?: string; image_url?: string }
  dealer?: { id: string; name?: string; contact_phone?: string }
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
      '*, vehicle:vehicles!vehicle_id(id, name, image_url), dealer:dealers!dealer_id(id, name, contact_phone)',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(from, to)
  if (error) {
    throw new Error(error.message)
  }
  const items = (data ?? []).map((row: any) => ({
    ...mapRental(row),
    vehicle: row.vehicle ?? undefined,
    dealer: row.dealer ?? undefined,
  }))
  return { items, total: count ?? 0, page, pageSize }
}

export async function listFavorites(params: ListParams = {}): Promise<Paginated<Favorite>> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE
  const { from, to } = getRange(page, pageSize)
  const { data, count, error } = await supabase
    .from('favorites')
    .select('*', { count: 'exact' })
    .range(from, to)
  if (error) {
    throw new Error(error.message)
  }
  return { items: (data ?? []).map(mapFavorite), total: count ?? 0, page, pageSize }
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

export interface BookingRequestWithVehicle extends BookingRequest {
  vehicle?: {
    id: string
    name: string
    image_url?: string
    make?: string
    model?: string
    dealer?: { name?: string; contact_phone?: string }
  }
}

export async function listBookingRequestsWithVehicles(
  params: ListParams = {}
): Promise<Paginated<BookingRequestWithVehicle>> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE
  const { from, to } = getRange(page, pageSize)
  const { data, count, error } = await supabase
    .from('booking_requests')
    .select('*, vehicle:vehicles(id, name, image_url, make, model, dealer:dealers(name, contact_phone))', {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .range(from, to)
  if (error) {
    throw new Error(error.message)
  }
  const items = (data ?? []).map((row: any) => ({
    ...mapBookingRequest(row),
    vehicle: row.vehicle
      ? {
          ...row.vehicle,
          dealer: row.vehicle.dealer ?? undefined,
        }
      : undefined,
  }))
  return { items, total: count ?? 0, page, pageSize }
}

export async function getSubscription(): Promise<Subscription> {
  const userId = await getAuthedUserId()
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('owner_id', userId)
    .eq('owner_type', 'customer')
    .order('start_date', { ascending: false })
    .limit(1)
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Subscription not found')
  }
  return mapSubscription(data)
}

export async function listInvoices(): Promise<Invoice[]> {
  const userId = await getAuthedUserId()
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('owner_id', userId)
    .eq('owner_type', 'customer')
  if (error) {
    throw new Error(error.message)
  }
  return (data ?? []).map(mapInvoice)
}

export async function listPaymentMethods(): Promise<PaymentMethod[]> {
  const { data, error } = await supabase.from('payment_methods').select('*')
  if (error) {
    throw new Error(error.message)
  }
  return (data ?? []).map(mapPaymentMethod)
}

export async function addFavorite(vehicleId: string): Promise<Favorite> {
  const userId = await getAuthedUserId()
  const { data, error } = await supabase
    .from('favorites')
    .insert({ customer_id: userId, vehicle_id: vehicleId })
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to add favorite')
  }
  return mapFavorite(data)
}

export async function removeFavorite(id: string): Promise<void> {
  const { error } = await supabase.from('favorites').delete().eq('id', id)
  if (error) {
    throw new Error(error.message)
  }
}

export async function clearFavorites(): Promise<void> {
  const userId = await getAuthedUserId()
  const { error } = await supabase.from('favorites').delete().eq('customer_id', userId)
  if (error) {
    throw new Error(error.message)
  }
}

export interface CustomerProfileDocuments {
  qid_document_path: string | null
  drivers_license_path: string | null
}

export async function getCustomerProfile(): Promise<CustomerProfileDocuments | null> {
  const userId = await getAuthedUserId()
  const { data, error } = await supabase
    .from('customer_profiles')
    .select('qid_document_path, drivers_license_path')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    throw new Error(error.message ?? 'Failed to load profile')
  }
  return data
}

export async function updateCustomerDocuments(
  updates: Partial<CustomerProfileDocuments>
): Promise<CustomerProfileDocuments> {
  const userId = await getAuthedUserId()
  const existing = await getCustomerProfile().catch(() => null)
  const payload = {
    qid_document_path: updates.qid_document_path ?? existing?.qid_document_path ?? null,
    drivers_license_path: updates.drivers_license_path ?? existing?.drivers_license_path ?? null,
  }

  // Try update first to avoid RLS issues on insert when row already exists.
  const updateRes = await supabase
    .from('customer_profiles')
    .update(payload)
    .eq('user_id', userId)
    .select('qid_document_path, drivers_license_path')

  if (!updateRes.error && updateRes.data && updateRes.data.length > 0) {
    return updateRes.data[0]
  }

  const insertRes = await supabase
    .from('customer_profiles')
    .insert({ user_id: userId, ...payload })
    .select('qid_document_path, drivers_license_path')
    .single()

  if (insertRes.error || !insertRes.data) {
    const message = insertRes.error?.message ?? updateRes.error?.message ?? 'Failed to save documents'
    if (/row-level security|violates row-level security policy/i.test(message)) {
      throw new Error('You do not have permission to create your customer profile row. Please ask an admin to enable INSERT policy on customer_profiles.')
    }
    throw new Error(message)
  }

  return insertRes.data
}

export async function listNotifications(params: ListParams = {}): Promise<Paginated<Notification>> {
  const userId = await getAuthedUserId()
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const { from, to } = getRange(page, pageSize)
  const { data, count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(from, to)
  if (error) {
    throw new Error(error.message ?? 'Failed to load notifications')
  }
  return {
    items: (data ?? []).map(mapNotification),
    total: count ?? 0,
    page,
    pageSize,
  }
}

export async function getUnreadNotificationCount(): Promise<number> {
  const userId = await getAuthedUserId()
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false)
  if (error) {
    return 0
  }
  return count ?? 0
}

export async function markNotificationRead(id: string): Promise<void> {
  await getAuthedUserId()
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', id)
  if (error) {
    throw new Error(error.message ?? 'Failed to update notification')
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  const userId = await getAuthedUserId()
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
  if (error) {
    throw new Error(error.message ?? 'Failed to update notifications')
  }
}

export interface CreateBookingRequestInput {
  vehicleId: string
  note?: string
}

export async function createBookingRequest(input: CreateBookingRequestInput): Promise<BookingRequest> {
  const userId = await getAuthedUserId()
  const { data, error } = await supabase
    .from('booking_requests')
    .insert({ customer_id: userId, vehicle_id: input.vehicleId, note: input.note })
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to create booking request')
  }
  return mapBookingRequest(data)
}

export async function updateBookingRequestStatus(
  id: string,
  status: BookingRequestStatus
): Promise<BookingRequest> {
  const { data, error } = await supabase
    .from('booking_requests')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to update booking request')
  }
  return mapBookingRequest(data)
}

export async function updateBookingRequestNote(
  id: string,
  note: string
): Promise<BookingRequest> {
  const { data, error } = await supabase
    .from('booking_requests')
    .update({ note })
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to update booking request note')
  }
  return mapBookingRequest(data)
}

export async function removePaymentMethod(id: string): Promise<void> {
  const { error } = await supabase.from('payment_methods').delete().eq('id', id)
  if (error) {
    throw new Error(error.message ?? 'Failed to remove payment method')
  }
}

export async function setDefaultPaymentMethod(id: string): Promise<void> {
  const userId = await getAuthedUserId()
  const { error: clearError } = await supabase
    .from('payment_methods')
    .update({ is_default: false })
    .eq('user_id', userId)
  if (clearError) {
    throw new Error(clearError.message ?? 'Failed to update payment methods')
  }
  const { error } = await supabase
    .from('payment_methods')
    .update({ is_default: true })
    .eq('id', id)
  if (error) {
    throw new Error(error.message ?? 'Failed to set default payment method')
  }
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
