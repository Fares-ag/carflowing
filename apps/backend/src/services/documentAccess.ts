import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { bookingRequests, rentals, vehicles } from '../db/schema.js'

/** Dealers may only read customer documents when they share a rental or booking request. */
export async function dealerCanAccessCustomerDocuments(
  dealerId: string,
  customerId: string
): Promise<boolean> {
  const [rental] = await db
    .select({ id: rentals.id })
    .from(rentals)
    .where(and(eq(rentals.dealerId, dealerId), eq(rentals.customerId, customerId)))
    .limit(1)
  if (rental) return true

  const [booking] = await db
    .select({ id: bookingRequests.id })
    .from(bookingRequests)
    .innerJoin(vehicles, eq(bookingRequests.vehicleId, vehicles.id))
    .where(and(eq(bookingRequests.customerId, customerId), eq(vehicles.dealerId, dealerId)))
    .limit(1)
  return !!booking
}

export function userOwnsStoredPath(userId: string, storedPath: string): boolean {
  const normalized = storedPath.replace(/\\/g, '/')
  return (
    normalized.startsWith(`${userId}/`) ||
    normalized.startsWith(`documents/${userId}/`) ||
    normalized.includes(`/${userId}/`)
  )
}
