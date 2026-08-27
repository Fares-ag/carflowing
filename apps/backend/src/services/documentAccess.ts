import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { bookingRequests, rentals, vehicles } from '../db/schema.js'
import { storageKeyFromReference } from '../storage/index.js'

/**
 * Dealers may read customer identity documents only while there is an active
 * business relationship: a rental, or a booking request that is actionable —
 * `pending` and actually decidable (not an unpaid online hold), or
 * `approved`. Declined/withdrawn requests no longer grant access forever
 * (audit BUG-16: national-ID exposure).
 */
export async function dealerCanAccessCustomerDocuments(
  dealerId: string,
  customerId: string
): Promise<boolean> {
  const [rental] = await db
    .select({ id: rentals.id })
    .from(rentals)
    .where(
      and(
        eq(rentals.dealerId, dealerId),
        eq(rentals.customerId, customerId),
        // Open relationships only — a completed/cancelled rental must not
        // grant identity-document access forever (re-audit L2).
        inArray(rentals.status, ['reserved', 'active', 'past_due'])
      )
    )
    .limit(1)
  if (rental) return true

  // Booking requests only grant access during the DECISION window (`pending`,
  // payable). An `approved` request always has a rental row, which the check
  // above already covers with open statuses — leaving `approved` in here let
  // access survive rental completion forever (re-audit RA-13).
  const [booking] = await db
    .select({ id: bookingRequests.id })
    .from(bookingRequests)
    .innerJoin(vehicles, eq(bookingRequests.vehicleId, vehicles.id))
    .where(
      and(
        eq(bookingRequests.customerId, customerId),
        eq(vehicles.dealerId, dealerId),
        eq(bookingRequests.status, 'pending'),
        eq(bookingRequests.awaitingPayment, false)
      )
    )
    .limit(1)
  return !!booking
}

/**
 * Ownership of a stored object, given either a raw storage key or any of the
 * URL shapes we hand out for it.
 *
 * The reference has to be resolved to a key first: under `UPLOAD_DRIVER=blob`
 * (production) nothing the client holds is a bare key — avatars come back as
 * `…/api/uploads/media?path=…` and documents as `…/api/uploads/documents/file?path=…`
 * — so a prefix test on the raw string refused every legitimate owner
 * (audit: DELETE /uploads/by-url always 403 under blob).
 */
export function userOwnsStoredPath(userId: string, storedPathOrUrl: string): boolean {
  if (!storedPathOrUrl) return false
  const key = storageKeyFromReference(storedPathOrUrl) ?? storedPathOrUrl
  const normalized = key.replace(/\\/g, '/').replace(/^\/+/, '')
  // A prefix match alone would accept `documents/<ownId>/../../elsewhere`.
  if (normalized.split('/').includes('..')) return false
  return (
    normalized.startsWith(`${userId}/`) ||
    normalized.startsWith(`documents/${userId}/`) ||
    normalized.startsWith(`user-avatars/profiles/${userId}/`)
  )
}
