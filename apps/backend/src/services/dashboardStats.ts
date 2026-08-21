import { and, count, desc, eq, gte, inArray, ne, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { mapRental } from '../db/mappers.js'
import { dealers, favorites, payments, profiles, rentals, vehicles } from '../db/schema.js'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function recentMonthKeys(months: number): string[] {
  const now = new Date()
  const keys: string[] = []
  for (let i = months - 1; i >= 0; i -= 1) {
    keys.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)))
  }
  return keys
}

/** Net platform revenue via SQL aggregation (Phase 2.3). */
export async function aggregatePlatformRevenue(): Promise<number> {
  const [row] = await db
    .select({
      total: sql<string>`COALESCE(SUM(CASE
        WHEN ${payments.type} = 'refund' THEN 0
        WHEN ${payments.status} IN ('completed', 'refunded')
          THEN ${payments.amount}::numeric - COALESCE(${payments.refundedAmount}, 0)::numeric
        ELSE 0 END), 0)`,
    })
    .from(payments)
  return Number(row?.total ?? 0)
}

export async function aggregateDealerRevenue(dealerId: string): Promise<number> {
  const [row] = await db
    .select({
      total: sql<string>`COALESCE(SUM(CASE
        WHEN ${payments.type} = 'refund' THEN 0
        WHEN ${payments.dealerId} = ${dealerId}
          AND ${payments.status} IN ('completed', 'refunded')
          THEN ${payments.amount}::numeric - COALESCE(${payments.refundedAmount}, 0)::numeric
        ELSE 0 END), 0)`,
    })
    .from(payments)
  return Number(row?.total ?? 0)
}

export async function countRentalsByStatus(
  scopeDealerId?: string
): Promise<Record<string, number>> {
  const where = scopeDealerId ? eq(rentals.dealerId, scopeDealerId) : undefined
  const rows = await db
    .select({ status: rentals.status, value: count() })
    .from(rentals)
    .where(where)
    .groupBy(rentals.status)
  const out: Record<string, number> = {}
  for (const row of rows) out[row.status] = Number(row.value)
  return out
}

export async function monthlyPaymentBuckets(
  months: number,
  scopeDealerId?: string
): Promise<Record<string, number>> {
  const keys = recentMonthKeys(months)
  const start = `${keys[0]}-01`
  const baseWhere = scopeDealerId
    ? and(eq(payments.dealerId, scopeDealerId), gte(payments.createdAt, new Date(start)))
    : gte(payments.createdAt, new Date(start))
  const rows = await db
    .select({
      month: sql<string>`to_char(${payments.createdAt}, 'YYYY-MM')`,
      total: sql<string>`COALESCE(SUM(CASE
        WHEN ${payments.type} = 'refund' THEN 0
        WHEN ${payments.status} IN ('completed', 'refunded')
          THEN ${payments.amount}::numeric - COALESCE(${payments.refundedAmount}, 0)::numeric
        ELSE 0 END), 0)`,
    })
    .from(payments)
    .where(baseWhere)
    .groupBy(sql`to_char(${payments.createdAt}, 'YYYY-MM')`)
  const buckets: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]))
  for (const row of rows) {
    if (row.month in buckets) buckets[row.month] = Number(row.total)
  }
  return buckets
}

export async function monthlyRentalBuckets(
  months: number,
  scopeDealerId?: string
): Promise<Record<string, number>> {
  const keys = recentMonthKeys(months)
  const start = `${keys[0]}-01`
  const baseWhere = scopeDealerId
    ? and(eq(rentals.dealerId, scopeDealerId), gte(rentals.createdAt, new Date(start)))
    : gte(rentals.createdAt, new Date(start))
  const rows = await db
    .select({
      month: sql<string>`to_char(${rentals.createdAt}, 'YYYY-MM')`,
      value: count(),
    })
    .from(rentals)
    .where(baseWhere)
    .groupBy(sql`to_char(${rentals.createdAt}, 'YYYY-MM')`)
  const buckets: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]))
  for (const row of rows) {
    if (row.month in buckets) buckets[row.month] = Number(row.value)
  }
  return buckets
}

export async function countRentalsToday(scopeDealerId?: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10)
  const where = scopeDealerId
    ? and(eq(rentals.dealerId, scopeDealerId), sql`${rentals.createdAt}::date = ${today}`)
    : sql`${rentals.createdAt}::date = ${today}`
  const [row] = await db.select({ value: count() }).from(rentals).where(where)
  return Number(row?.value ?? 0)
}

export async function platformDashboardCounts() {
  const [dealersCount] = await db.select({ value: count() }).from(dealers)
  const [usersCount] = await db
    .select({ value: count() })
    .from(profiles)
    .where(eq(profiles.role, 'customer'))
  const [vehiclesCount] = await db.select({ value: count() }).from(vehicles)
  const [rentalsCount] = await db.select({ value: count() }).from(rentals)
  return {
    dealers: Number(dealersCount.value),
    users: Number(usersCount.value),
    vehicles: Number(vehiclesCount.value),
    rentals: Number(rentalsCount.value),
  }
}

export async function vehicleCategoryDistribution(scopeDealerId?: string) {
  const where = scopeDealerId ? eq(vehicles.dealerId, scopeDealerId) : undefined
  const rows = await db
    .select({ category: vehicles.category, value: count() })
    .from(vehicles)
    .where(where)
    .groupBy(vehicles.category)
  return rows.map((r) => ({ category: r.category, value: Number(r.value) }))
}

export async function countActiveRentals(scopeDealerId?: string): Promise<number> {
  const where = scopeDealerId
    ? and(
        eq(rentals.dealerId, scopeDealerId),
        inArray(rentals.status, ['reserved', 'active', 'past_due'])
      )
    : inArray(rentals.status, ['reserved', 'active', 'past_due'])
  const [row] = await db.select({ value: count() }).from(rentals).where(where)
  return Number(row?.value ?? 0)
}

export async function countVehicles(scopeDealerId?: string): Promise<number> {
  const where = scopeDealerId ? eq(vehicles.dealerId, scopeDealerId) : undefined
  const [row] = await db.select({ value: count() }).from(vehicles).where(where)
  return Number(row?.value ?? 0)
}

export async function countRentals(scopeDealerId?: string): Promise<number> {
  const where = scopeDealerId ? eq(rentals.dealerId, scopeDealerId) : undefined
  const [row] = await db.select({ value: count() }).from(rentals).where(where)
  return Number(row?.value ?? 0)
}

export async function countRentalsWithStatus(status: string, scopeDealerId?: string): Promise<number> {
  const where = scopeDealerId
    ? and(eq(rentals.dealerId, scopeDealerId), eq(rentals.status, status as any))
    : eq(rentals.status, status as any)
  const [row] = await db.select({ value: count() }).from(rentals).where(where)
  return Number(row?.value ?? 0)
}

export async function uniqueCustomersThisMonth(scopeDealerId: string): Promise<number> {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const [row] = await db
    .select({ value: sql<number>`count(distinct ${rentals.customerId})` })
    .from(rentals)
    .where(and(eq(rentals.dealerId, scopeDealerId), gte(rentals.createdAt, start)))
  return Number(row?.value ?? 0)
}

/** Customer profile KPIs for admin /customer-stats (SQL aggregates, no full-table load). */
export async function aggregateCustomerProfileStats() {
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const baseWhere = eq(profiles.role, 'customer')
  const [[row], [newRow]] = await Promise.all([
    db
      .select({
        total: count(),
        active: sql<number>`sum(case when ${profiles.status} = 'active' then 1 else 0 end)`,
        suspended: sql<number>`sum(case when ${profiles.status} = 'suspended' then 1 else 0 end)`,
      })
      .from(profiles)
      .where(baseWhere),
    db
      .select({ value: count() })
      .from(profiles)
      .where(and(baseWhere, gte(profiles.createdAt, startOfMonth))),
  ])
  return {
    total: Number(row?.total ?? 0),
    active: Number(row?.active ?? 0),
    suspended: Number(row?.suspended ?? 0),
    newThisMonth: Number(newRow?.value ?? 0),
  }
}

export async function countActiveBookings(scopeDealerId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(rentals)
    .where(
      and(
        eq(rentals.dealerId, scopeDealerId),
        inArray(rentals.status, ['active', 'reserved'])
      )
    )
  return Number(row?.value ?? 0)
}

async function dealerAnalyticsPaymentTrend(dealerId: string) {
  return db
    .select({
      createdAt: payments.createdAt,
      amount: payments.amount,
      refundedAmount: payments.refundedAmount,
    })
    .from(payments)
    .where(
      and(
        eq(payments.dealerId, dealerId),
        ne(payments.type, 'refund'),
        inArray(payments.status, ['completed', 'refunded'])
      )
    )
}

async function dealerAnalyticsRentalTrend(dealerId: string) {
  return db
    .select({ createdAt: rentals.createdAt })
    .from(rentals)
    .where(eq(rentals.dealerId, dealerId))
}

async function dealerVehicleCategories(dealerId: string) {
  return db
    .select({ category: vehicles.category })
    .from(vehicles)
    .where(eq(vehicles.dealerId, dealerId))
}

/** Dealer /analytics payload — KPIs via SQL aggregates; trend arrays via filtered column selects. */
export async function buildDealerAnalyticsResponse(dealerId: string) {
  const [
    totalRevenue,
    activeBookings,
    newCustomersThisMonth,
    rentedCount,
    vehicleCount,
    paymentTrendRows,
    rentalTrendRows,
    categoryRows,
  ] = await Promise.all([
    aggregateDealerRevenue(dealerId),
    countActiveBookings(dealerId),
    uniqueCustomersThisMonth(dealerId),
    countRentalsWithStatus('active', dealerId),
    countVehicles(dealerId),
    dealerAnalyticsPaymentTrend(dealerId),
    dealerAnalyticsRentalTrend(dealerId),
    dealerVehicleCategories(dealerId),
  ])

  const fleetUtilization = vehicleCount > 0 ? Math.round((rentedCount / vehicleCount) * 100) : 0

  return {
    totalRevenue,
    activeBookings,
    newCustomersThisMonth,
    fleetUtilization,
    revenueTrend: paymentTrendRows.map((p) => {
      const d = new Date(p.createdAt)
      const amount = Number(p.amount) - Number(p.refundedAmount ?? 0)
      return {
        month: `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`,
        revenue: amount,
        profit: Math.round(amount * 0.2),
        createdAt: p.createdAt.toISOString(),
      }
    }),
    customerDemographics: [],
    revenueBooking: rentalTrendRows.map((r) => ({
      month: r.createdAt.toISOString(),
      revenue: 0,
      bookings: 1,
    })),
    bookingTime: [],
    utilization: categoryRows.map((v) => ({
      category: v.category,
      utilization: fleetUtilization,
    })),
  }
}

/** Customer /dashboard — bounded rental lists (limit 5) plus favorites count. */
export async function buildCustomerDashboardResponse(customerId: string) {
  const [fav] = await db
    .select({ value: count() })
    .from(favorites)
    .where(eq(favorites.customerId, customerId))

  const [upcomingRows, recentRows] = await Promise.all([
    db
      .select()
      .from(rentals)
      .where(
        and(
          eq(rentals.customerId, customerId),
          inArray(rentals.status, ['reserved', 'active'])
        )
      )
      .orderBy(desc(rentals.createdAt))
      .limit(5),
    db
      .select()
      .from(rentals)
      .where(eq(rentals.customerId, customerId))
      .orderBy(desc(rentals.createdAt))
      .limit(5),
  ])

  return {
    upcomingRentals: upcomingRows.map(mapRental),
    recentRentals: recentRows.map(mapRental),
    favoritesCount: Number(fav?.value ?? 0),
  }
}
