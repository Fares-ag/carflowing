import { and, avg, count, desc, eq, inArray } from 'drizzle-orm'
import type { DealerReview, Vehicle, VehicleReview } from '@carflow/shared/types'
import { db } from '../db/index.js'
import { dealers, profiles, rentalReviews, rentals, vehicles } from '../db/schema.js'
import { logAuditSafe } from './audit.js'

export type ReviewAggregate = { averageRating: number; reviewCount: number }

function roundRating(value: number): number {
  return Math.round(value * 10) / 10
}

function publicCustomerName(fullName: string | null | undefined): string | undefined {
  if (!fullName?.trim()) return undefined
  return fullName.trim().split(/\s+/)[0]
}

export async function fetchVehicleReviewAggregates(
  vehicleIds: string[]
): Promise<Map<string, ReviewAggregate>> {
  const map = new Map<string, ReviewAggregate>()
  if (vehicleIds.length === 0) return map

  const rows = await db
    .select({
      vehicleId: rentalReviews.vehicleId,
      average: avg(rentalReviews.rating),
      total: count(),
    })
    .from(rentalReviews)
    .where(inArray(rentalReviews.vehicleId, vehicleIds))
    .groupBy(rentalReviews.vehicleId)

  for (const row of rows) {
    map.set(row.vehicleId, {
      averageRating: roundRating(Number(row.average ?? 0)),
      reviewCount: Number(row.total ?? 0),
    })
  }
  return map
}

export function attachReviewAggregates<T extends Pick<Vehicle, 'id'>>(
  items: T[],
  aggregates: Map<string, ReviewAggregate>
): (T & { averageRating?: number; reviewCount?: number })[] {
  return items.map((item) => {
    const stats = aggregates.get(item.id)
    if (!stats || stats.reviewCount === 0) return item
    return {
      ...item,
      averageRating: stats.averageRating,
      reviewCount: stats.reviewCount,
    }
  })
}

function mapPublicReview(row: {
  id: string
  rentalId: string
  vehicleId: string
  dealerId: string
  rating: number
  comment: string | null
  createdAt: Date
  dealerResponse: string | null
  dealerRespondedAt: Date | null
  customerName?: string | null
}): VehicleReview {
  return {
    id: row.id,
    rentalId: row.rentalId,
    vehicleId: row.vehicleId,
    dealerId: row.dealerId,
    rating: row.rating,
    comment: row.comment ?? undefined,
    createdAt: row.createdAt.toISOString(),
    customerName: publicCustomerName(row.customerName),
    dealerResponse: row.dealerResponse ?? undefined,
    dealerRespondedAt: row.dealerRespondedAt?.toISOString(),
  }
}

export async function listVehicleReviews(
  vehicleId: string,
  page = 1,
  pageSize = 20
): Promise<{
  averageRating: number
  reviewCount: number
  items: VehicleReview[]
  page: number
  pageSize: number
  total: number
}> {
  const safePage = Math.max(1, page)
  const safeSize = Math.min(50, Math.max(1, pageSize))
  const offset = (safePage - 1) * safeSize

  const [stats] = await db
    .select({
      average: avg(rentalReviews.rating),
      total: count(),
    })
    .from(rentalReviews)
    .where(eq(rentalReviews.vehicleId, vehicleId))

  const total = Number(stats?.total ?? 0)
  const averageRating = total > 0 ? roundRating(Number(stats?.average ?? 0)) : 0

  const rows = await db
    .select({
      id: rentalReviews.id,
      rentalId: rentalReviews.rentalId,
      vehicleId: rentalReviews.vehicleId,
      dealerId: rentalReviews.dealerId,
      rating: rentalReviews.rating,
      comment: rentalReviews.comment,
      createdAt: rentalReviews.createdAt,
      dealerResponse: rentalReviews.dealerResponse,
      dealerRespondedAt: rentalReviews.dealerRespondedAt,
      customerName: profiles.name,
    })
    .from(rentalReviews)
    .leftJoin(profiles, eq(rentalReviews.customerId, profiles.id))
    .where(eq(rentalReviews.vehicleId, vehicleId))
    .orderBy(desc(rentalReviews.createdAt))
    .limit(safeSize)
    .offset(offset)

  return {
    averageRating,
    reviewCount: total,
    items: rows.map(mapPublicReview),
    page: safePage,
    pageSize: safeSize,
    total,
  }
}

export async function listDealerReviews(
  dealerId: string,
  page = 1,
  pageSize = 20
): Promise<{ items: DealerReview[]; page: number; pageSize: number; total: number }> {
  const safePage = Math.max(1, page)
  const safeSize = Math.min(50, Math.max(1, pageSize))
  const offset = (safePage - 1) * safeSize

  const [totalRow] = await db
    .select({ value: count() })
    .from(rentalReviews)
    .where(eq(rentalReviews.dealerId, dealerId))

  const rows = await db
    .select({
      review: rentalReviews,
      customerName: profiles.name,
      vehicleName: vehicles.name,
    })
    .from(rentalReviews)
    .leftJoin(profiles, eq(rentalReviews.customerId, profiles.id))
    .leftJoin(vehicles, eq(rentalReviews.vehicleId, vehicles.id))
    .where(eq(rentalReviews.dealerId, dealerId))
    .orderBy(desc(rentalReviews.createdAt))
    .limit(safeSize)
    .offset(offset)

  const items: DealerReview[] = rows.map((row) => ({
    id: row.review.id,
    rentalId: row.review.rentalId,
    vehicleId: row.review.vehicleId,
    vehicleName: row.vehicleName ?? undefined,
    customerId: row.review.customerId,
    customerName: row.customerName ?? undefined,
    rating: row.review.rating,
    comment: row.review.comment ?? undefined,
    createdAt: row.review.createdAt.toISOString(),
    dealerResponse: row.review.dealerResponse ?? undefined,
    dealerRespondedAt: row.review.dealerRespondedAt?.toISOString(),
  }))

  return {
    items,
    page: safePage,
    pageSize: safeSize,
    total: Number(totalRow?.value ?? 0),
  }
}

export async function listDealerPublicReviews(dealerId: string, page = 1, pageSize = 20) {
  const safePage = Math.max(1, page)
  const safeSize = Math.min(50, Math.max(1, pageSize))
  const offset = (safePage - 1) * safeSize

  const [stats] = await db
    .select({
      average: avg(rentalReviews.rating),
      total: count(),
    })
    .from(rentalReviews)
    .where(eq(rentalReviews.dealerId, dealerId))

  const total = Number(stats?.total ?? 0)
  const averageRating = total > 0 ? roundRating(Number(stats?.average ?? 0)) : 0

  const rows = await db
    .select({
      id: rentalReviews.id,
      rentalId: rentalReviews.rentalId,
      vehicleId: rentalReviews.vehicleId,
      dealerId: rentalReviews.dealerId,
      rating: rentalReviews.rating,
      comment: rentalReviews.comment,
      createdAt: rentalReviews.createdAt,
      dealerResponse: rentalReviews.dealerResponse,
      dealerRespondedAt: rentalReviews.dealerRespondedAt,
      customerName: profiles.name,
    })
    .from(rentalReviews)
    .leftJoin(profiles, eq(rentalReviews.customerId, profiles.id))
    .where(eq(rentalReviews.dealerId, dealerId))
    .orderBy(desc(rentalReviews.createdAt))
    .limit(safeSize)
    .offset(offset)

  return {
    averageRating,
    reviewCount: total,
    items: rows.map(mapPublicReview),
    page: safePage,
    pageSize: safeSize,
    total,
  }
}

export async function createRentalReview(input: {
  rentalId: string
  customerId: string
  rating: number
  comment?: string
}): Promise<{ status: number; body: unknown }> {
  const [rental] = await db
    .select()
    .from(rentals)
    .where(and(eq(rentals.id, input.rentalId), eq(rentals.customerId, input.customerId)))
    .limit(1)
  if (!rental) return { status: 404, body: { error: 'Rental not found' } }
  if (rental.status !== 'completed') {
    return { status: 409, body: { error: 'Reviews are only allowed after subscription completion' } }
  }

  const [existing] = await db
    .select({ id: rentalReviews.id })
    .from(rentalReviews)
    .where(eq(rentalReviews.rentalId, rental.id))
    .limit(1)
  if (existing) {
    return { status: 409, body: { error: 'You already reviewed this subscription' } }
  }

  const [row] = await db
    .insert(rentalReviews)
    .values({
      rentalId: rental.id,
      customerId: input.customerId,
      dealerId: rental.dealerId,
      vehicleId: rental.vehicleId,
      rating: input.rating,
      comment: input.comment?.trim() || null,
    })
    .returning()

  const [avgRow] = await db
    .select({ value: avg(rentalReviews.rating) })
    .from(rentalReviews)
    .where(eq(rentalReviews.dealerId, rental.dealerId))
  await db
    .update(dealers)
    .set({ rating: String(Number(avgRow?.value ?? input.rating).toFixed(2)) })
    .where(eq(dealers.id, rental.dealerId))

  await logAuditSafe({
    actorId: input.customerId,
    actorRole: 'customer',
    action: 'review.created',
    entityType: 'rental_review',
    entityId: row.id,
    after: { rentalId: rental.id, vehicleId: rental.vehicleId, rating: input.rating },
  })

  return {
    status: 201,
    body: {
      id: row.id,
      rentalId: row.rentalId,
      rating: row.rating,
      comment: row.comment ?? undefined,
      createdAt: row.createdAt.toISOString(),
    },
  }
}

export async function respondToReview(input: {
  reviewId: string
  dealerId: string
  actorId: string
  response: string
}): Promise<{ status: number; body: unknown }> {
  const [review] = await db
    .select()
    .from(rentalReviews)
    .where(and(eq(rentalReviews.id, input.reviewId), eq(rentalReviews.dealerId, input.dealerId)))
    .limit(1)
  if (!review) return { status: 404, body: { error: 'Review not found' } }
  if (review.dealerResponse) {
    return { status: 409, body: { error: 'This review already has a dealer response' } }
  }

  const now = new Date()
  const [updated] = await db
    .update(rentalReviews)
    .set({
      dealerResponse: input.response.trim(),
      dealerRespondedAt: now,
      dealerRespondedBy: input.actorId,
    })
    .where(eq(rentalReviews.id, review.id))
    .returning()

  await logAuditSafe({
    actorId: input.actorId,
    actorRole: 'dealer',
    action: 'review.respond',
    entityType: 'rental_review',
    entityId: review.id,
    after: { dealerResponse: input.response.trim() },
  })

  return {
    status: 200,
    body: {
      id: updated.id,
      dealerResponse: updated.dealerResponse,
      dealerRespondedAt: updated.dealerRespondedAt?.toISOString(),
    },
  }
}
