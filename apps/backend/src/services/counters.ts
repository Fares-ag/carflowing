import { and, eq, inArray, sql } from 'drizzle-orm'
import { customerProfiles, dealers, rentals } from '../db/schema.js'
import type { DbOrTx } from './audit.js'

/** Increment customer denormalized stats when money settles or a rental completes. */
export async function recordCustomerPayment(
  tx: DbOrTx,
  customerId: string,
  amount: number
): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) return
  await tx
    .update(customerProfiles)
    .set({
      totalSpent: sql`${customerProfiles.totalSpent} + ${String(amount)}`,
    })
    .where(eq(customerProfiles.userId, customerId))
}

/** Reverse a settled payment portion (refunds). Clamped at zero by CHECK constraints. */
export async function reverseCustomerPayment(
  tx: DbOrTx,
  customerId: string,
  amount: number
): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) return
  await tx
    .update(customerProfiles)
    .set({
      totalSpent: sql`GREATEST(0, ${customerProfiles.totalSpent} - ${String(amount)})`,
    })
    .where(eq(customerProfiles.userId, customerId))
}

/** Bump rentals_count when a subscription rental is created (approval). */
export async function recordCustomerRentalStarted(tx: DbOrTx, customerId: string): Promise<void> {
  await tx
    .update(customerProfiles)
    .set({ rentalsCount: sql`${customerProfiles.rentalsCount} + 1` })
    .where(eq(customerProfiles.userId, customerId))
}

/** Dealer revenue + active rental counters on settlement / lifecycle changes. */
export async function recordDealerPayment(
  tx: DbOrTx,
  dealerId: string,
  amount: number
): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) return
  await tx
    .update(dealers)
    .set({ totalRevenue: sql`${dealers.totalRevenue} + ${String(amount)}` })
    .where(eq(dealers.id, dealerId))
}

/** Reverse a settled payment portion (refunds). Clamped at zero by CHECK constraints. */
export async function reverseDealerPayment(
  tx: DbOrTx,
  dealerId: string,
  amount: number
): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) return
  await tx
    .update(dealers)
    .set({
      totalRevenue: sql`GREATEST(0, ${dealers.totalRevenue} - ${String(amount)})`,
    })
    .where(eq(dealers.id, dealerId))
}

export async function adjustDealerActiveRentals(
  tx: DbOrTx,
  dealerId: string,
  delta: number
): Promise<void> {
  if (delta === 0) return
  await tx
    .update(dealers)
    .set({ activeRentals: sql`GREATEST(0, ${dealers.activeRentals} + ${delta})` })
    .where(eq(dealers.id, dealerId))
}

/** Recompute dealer active_rentals from open rentals (repair / return / cancel). */
export async function syncDealerActiveRentals(tx: DbOrTx, dealerId: string): Promise<void> {
  const [row] = await tx
    .select({ count: sql<number>`count(*)` })
    .from(rentals)
    .where(
      and(eq(rentals.dealerId, dealerId), inArray(rentals.status, ['reserved', 'active', 'paused', 'past_due']))
    )
  await tx
    .update(dealers)
    .set({ activeRentals: Number(row?.count ?? 0) })
    .where(eq(dealers.id, dealerId))
}
