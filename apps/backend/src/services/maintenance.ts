import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { mapMaintenanceRecord } from '../db/mappers.js'
import { maintenanceRecords, profiles, rentals, vehicles } from '../db/schema.js'
import { notifyDealerOwner, notifyUser } from './notify.js'

const ACTIVE_RENTAL_STATUSES = ['reserved', 'active', 'past_due'] as const

type RentalRow = typeof rentals.$inferSelect

async function loadOwnedActiveRental(
  rentalId: string,
  customerId: string
): Promise<{ kind: 'ok'; rental: RentalRow } | { kind: 'not_found' } | { kind: 'not_active' }> {
  const [rental] = await db
    .select()
    .from(rentals)
    .where(and(eq(rentals.id, rentalId), eq(rentals.customerId, customerId)))
    .limit(1)
  if (!rental) return { kind: 'not_found' }
  if (!ACTIVE_RENTAL_STATUSES.includes(rental.status as (typeof ACTIVE_RENTAL_STATUSES)[number])) {
    return { kind: 'not_active' }
  }
  return { kind: 'ok', rental }
}

export async function createCustomerMaintenanceRequest(params: {
  rentalId: string
  customerId: string
  title: string
  description: string
  photos?: string[]
}) {
  const access = await loadOwnedActiveRental(params.rentalId, params.customerId)
  if (access.kind === 'not_found') {
    return { status: 404 as const, body: { error: 'Rental not found' } }
  }
  if (access.kind === 'not_active') {
    return {
      status: 409 as const,
      body: { error: 'Maintenance requests are only allowed for active subscriptions' },
    }
  }
  const { rental } = access

  const [row] = await db
    .insert(maintenanceRecords)
    .values({
      vehicleId: rental.vehicleId,
      dealerId: rental.dealerId,
      rentalId: rental.id,
      title: params.title,
      description: params.description,
      reportedBy: params.customerId,
      status: 'requested',
      source: 'customer',
      photos: params.photos ?? [],
    })
    .returning()

  const [vehicle] = await db
    .select({ name: vehicles.name })
    .from(vehicles)
    .where(eq(vehicles.id, rental.vehicleId))
    .limit(1)
  const [customer] = await db
    .select({ name: profiles.name })
    .from(profiles)
    .where(eq(profiles.id, params.customerId))
    .limit(1)

  await notifyDealerOwner(db, rental.dealerId, {
    type: 'warning',
    title: 'New service request',
    message: `${customer?.name ?? 'A customer'} reported an issue on ${vehicle?.name ?? 'their vehicle'}: ${params.title}`,
  })

  return { status: 201 as const, body: mapMaintenanceRecord(row) }
}

export async function listRentalMaintenanceRequests(rentalId: string, customerId: string) {
  const [rental] = await db
    .select({ id: rentals.id })
    .from(rentals)
    .where(and(eq(rentals.id, rentalId), eq(rentals.customerId, customerId)))
    .limit(1)
  if (!rental) {
    return { status: 404 as const, body: { error: 'Rental not found' } }
  }

  const rows = await db
    .select()
    .from(maintenanceRecords)
    .where(eq(maintenanceRecords.rentalId, rentalId))
    .orderBy(desc(maintenanceRecords.createdAt))

  return {
    status: 200 as const,
    body: { items: rows.map(mapMaintenanceRecord) },
  }
}

async function getDealerMaintenanceRecord(dealerId: string, recordId: string) {
  const [record] = await db
    .select()
    .from(maintenanceRecords)
    .where(and(eq(maintenanceRecords.id, recordId), eq(maintenanceRecords.dealerId, dealerId)))
    .limit(1)
  return record ?? null
}

async function notifyCustomerReporter(
  record: typeof maintenanceRecords.$inferSelect,
  title: string,
  message: string
) {
  if (!record.reportedBy || record.source !== 'customer') return
  await notifyUser(db, {
    userId: record.reportedBy,
    type: 'info',
    title,
    message,
  })
}

export async function acceptDealerMaintenanceRequest(dealerId: string, recordId: string) {
  const record = await getDealerMaintenanceRecord(dealerId, recordId)
  if (!record) return { status: 404 as const, body: { error: 'Not found' } }
  if (record.status !== 'requested') {
    return { status: 409 as const, body: { error: 'Only pending customer requests can be accepted' } }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(maintenanceRecords)
      .set({ status: 'open' })
      .where(eq(maintenanceRecords.id, record.id))
    await tx.update(vehicles).set({ status: 'maintenance' }).where(eq(vehicles.id, record.vehicleId))
  })

  await notifyCustomerReporter(record, 'Service request accepted', `Your dealer accepted "${record.title}" and will begin work.`)

  const [updated] = await db
    .select()
    .from(maintenanceRecords)
    .where(eq(maintenanceRecords.id, record.id))
    .limit(1)
  return { status: 200 as const, body: mapMaintenanceRecord(updated!) }
}

export async function scheduleDealerMaintenanceRequest(
  dealerId: string,
  recordId: string,
  scheduledAt: Date
) {
  const record = await getDealerMaintenanceRecord(dealerId, recordId)
  if (!record) return { status: 404 as const, body: { error: 'Not found' } }
  if (!['requested', 'open'].includes(record.status)) {
    return { status: 409 as const, body: { error: 'This maintenance record cannot be scheduled' } }
  }

  const [updated] = await db
    .update(maintenanceRecords)
    .set({ status: 'scheduled', scheduledAt })
    .where(eq(maintenanceRecords.id, record.id))
    .returning()

  await notifyCustomerReporter(
    record,
    'Service scheduled',
    `Your service request "${record.title}" is scheduled for ${scheduledAt.toISOString().slice(0, 10)}.`
  )

  return { status: 200 as const, body: mapMaintenanceRecord(updated) }
}

export async function completeDealerMaintenanceRecord(dealerId: string, recordId: string) {
  const record = await getDealerMaintenanceRecord(dealerId, recordId)
  if (!record) return { status: 404 as const, body: { error: 'Not found' } }
  if (record.status === 'completed') {
    return { status: 409 as const, body: { error: 'Already completed' } }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(maintenanceRecords)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(maintenanceRecords.id, record.id))
    const [openRental] = await tx
      .select({ id: rentals.id })
      .from(rentals)
      .where(
        and(
          eq(rentals.vehicleId, record.vehicleId),
          inArray(rentals.status, [...ACTIVE_RENTAL_STATUSES])
        )
      )
      .limit(1)
    if (!openRental) {
      await tx
        .update(vehicles)
        .set({ status: 'available' })
        .where(and(eq(vehicles.id, record.vehicleId), eq(vehicles.status, 'maintenance')))
    }
  })

  await notifyCustomerReporter(
    record,
    'Service completed',
    `Your service request "${record.title}" has been marked complete.`
  )

  return { status: 200 as const, body: { ok: true as const } }
}
