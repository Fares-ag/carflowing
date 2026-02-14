import type {
  BookingRequest,
  BookingRequestStatus,
  Favorite,
  Invoice,
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
    .range(from, to)
  if (error) {
    throw new Error(error.message)
  }
  return { items: (data ?? []).map(mapBookingRequest), total: count ?? 0, page, pageSize }
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
