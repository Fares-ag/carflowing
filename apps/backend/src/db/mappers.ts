import type {
  AuditLog,
  BookingRequest,
  Complaint,
  Dealer,
  Favorite,
  Invoice,
  Lead,
  Message,
  Notification,
  Payment,
  PaymentMethod,
  Plan,
  Rental,
  RentalEvent,
  Subscription,
  SwapRequest,
  User,
  Vehicle,
} from '@carflow/shared/types'
import { parseVehicleFeatures, vehicleGalleryUrls } from '@carflow/shared/vehicleFeatures'

function num(v: unknown): number {
  if (v == null) return 0
  return typeof v === 'number' ? v : Number(v)
}

function iso(v: unknown): string {
  if (v instanceof Date) return v.toISOString()
  return String(v ?? '')
}

function dateOnly(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v ?? '').slice(0, 10)
}

export function mapProfileToUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    phone: row.phone ?? undefined,
    avatarUrl: row.avatarUrl ?? row.avatar_url ?? undefined,
    status: row.status ?? undefined,
    createdAt: iso(row.createdAt ?? row.created_at),
  }
}

export function mapDealer(row: any): Dealer {
  return {
    id: row.id,
    name: row.name,
    ownerUserId: row.ownerUserId ?? row.owner_user_id,
    status: row.status,
    planId: row.planId ?? row.plan_id,
    rating: num(row.rating),
    totalRevenue: num(row.totalRevenue ?? row.total_revenue),
    activeRentals: num(row.activeRentals ?? row.active_rentals),
    vehiclesCount: num(row.vehiclesCount ?? row.vehicles_count),
    contactEmail: row.contactEmail ?? row.contact_email,
    contactPhone: row.contactPhone ?? row.contact_phone ?? undefined,
    address: row.address ?? undefined,
    logoUrl: row.logoUrl ?? row.logo_url ?? undefined,
    bankAccountName: row.bankAccountName ?? row.bank_account_name ?? undefined,
    bankName: row.bankName ?? row.bank_name ?? undefined,
    bankIban: row.bankIban ?? row.bank_iban ?? undefined,
    bankDetailsVerifiedAt:
      row.bankDetailsVerifiedAt ?? row.bank_details_verified_at
        ? iso(row.bankDetailsVerifiedAt ?? row.bank_details_verified_at)
        : undefined,
    createdAt: iso(row.createdAt ?? row.created_at),
  }
}

export function mapVehicle(row: any): Vehicle {
  const gallery = vehicleGalleryUrls({
    imageUrl: row.imageUrl ?? row.image_url,
    imageUrls: row.imageUrls ?? row.image_urls,
  })
  const features = parseVehicleFeatures(row.features)
  return {
    id: row.id,
    dealerId: row.dealerId ?? row.dealer_id,
    name: row.name,
    make: row.make,
    model: row.model,
    year: row.year,
    category: row.category,
    status: row.status,
    pricePerDay: num(row.pricePerDay ?? row.price_per_day),
    mileage: row.mileage,
    transmission: row.transmission,
    fuelType: row.fuelType ?? row.fuel_type,
    seats: row.seats,
    imageUrl: gallery[0] ?? undefined,
    imageUrls: gallery.length ? gallery : undefined,
    description: row.description ?? undefined,
    color: row.color ?? undefined,
    mileageCapKm:
      row.mileageCapKm ?? row.mileage_cap_km ?? undefined,
    features: features.length ? features : undefined,
    licensePlate: row.licensePlate ?? row.license_plate ?? undefined,
    locationCity: row.locationCity ?? row.location_city ?? undefined,
    locationArea: row.locationArea ?? row.location_area ?? undefined,
    latitude:
      row.latitude != null && row.latitude !== ''
        ? num(row.latitude)
        : undefined,
    longitude:
      row.longitude != null && row.longitude !== ''
        ? num(row.longitude)
        : undefined,
  }
}

export function mapRental(row: any): Rental {
  return {
    id: row.id,
    customerId: row.customerId ?? row.customer_id,
    dealerId: row.dealerId ?? row.dealer_id,
    vehicleId: row.vehicleId ?? row.vehicle_id,
    bookingRequestId: row.bookingRequestId ?? row.booking_request_id ?? undefined,
    startDate: dateOnly(row.startDate ?? row.start_date),
    endDate: dateOnly(row.endDate ?? row.end_date),
    status: row.status,
    totalAmount: num(row.totalAmount ?? row.total_amount),
    paymentStatus: row.paymentStatus ?? row.payment_status,
    pickupLocation: row.pickupLocation ?? row.pickup_location ?? undefined,
    pickupDate: row.pickupDate ?? row.pickup_date ? dateOnly(row.pickupDate ?? row.pickup_date) : undefined,
    pickupTime: row.pickupTime ?? row.pickup_time ?? undefined,
    pickupFulfilmentStatus: row.pickupFulfilmentStatus ?? row.pickup_fulfilment_status ?? undefined,
    returnLocation: row.returnLocation ?? row.return_location ?? undefined,
    returnDate:
      (row.returnDate ?? row.return_date) ? dateOnly(row.returnDate ?? row.return_date) : undefined,
    returnTime: row.returnTime ?? row.return_time ?? undefined,
    createdAt: iso(row.createdAt ?? row.created_at),
    monthlyAmount: num(row.monthlyAmount ?? row.monthly_amount),
    termMonths: num(row.termMonths ?? row.term_months) || 1,
    nextBillingDate:
      (row.nextBillingDate ?? row.next_billing_date)
        ? dateOnly(row.nextBillingDate ?? row.next_billing_date)
        : undefined,
    cancelRequestedAt:
      (row.cancelRequestedAt ?? row.cancel_requested_at)
        ? iso(row.cancelRequestedAt ?? row.cancel_requested_at)
        : undefined,
    cancellationEffectiveDate:
      (row.cancellationEffectiveDate ?? row.cancellation_effective_date)
        ? dateOnly(row.cancellationEffectiveDate ?? row.cancellation_effective_date)
        : undefined,
    cancelReason: row.cancelReason ?? row.cancel_reason ?? undefined,
    activatedAt:
      (row.activatedAt ?? row.activated_at) ? iso(row.activatedAt ?? row.activated_at) : undefined,
    completedAt:
      (row.completedAt ?? row.completed_at) ? iso(row.completedAt ?? row.completed_at) : undefined,
    depositAmount: num(row.depositAmount ?? row.deposit_amount),
    depositRefundable: row.depositRefundable ?? row.deposit_refundable ?? true,
    depositResolvedAmount: num(row.depositResolvedAmount ?? row.deposit_resolved_amount),
    depositWithheldAmount: num(row.depositWithheldAmount ?? row.deposit_withheld_amount),
    depositResolutionNote: row.depositResolutionNote ?? row.deposit_resolution_note ?? undefined,
    depositResolvedAt:
      (row.depositResolvedAt ?? row.deposit_resolved_at)
        ? iso(row.depositResolvedAt ?? row.deposit_resolved_at)
        : undefined,
    pausedAt: (row.pausedAt ?? row.paused_at) ? iso(row.pausedAt ?? row.paused_at) : undefined,
    pausedUntil:
      (row.pausedUntil ?? row.paused_until)
        ? dateOnly(row.pausedUntil ?? row.paused_until)
        : undefined,
    pauseReason: row.pauseReason ?? row.pause_reason ?? undefined,
  }
}

export function mapRentalEvent(row: any): RentalEvent {
  return {
    id: row.id,
    rentalId: row.rentalId ?? row.rental_id,
    type: row.type,
    mileage: row.mileage ?? undefined,
    fuelLevel: row.fuelLevel ?? row.fuel_level ?? undefined,
    conditionNotes: row.conditionNotes ?? row.condition_notes ?? undefined,
    photos: Array.isArray(row.photos) ? row.photos.map(String) : [],
    recordedBy: row.recordedBy ?? row.recorded_by ?? undefined,
    createdAt: iso(row.createdAt ?? row.created_at),
  }
}

export function mapSwapRequest(row: any): SwapRequest {
  return {
    id: row.id,
    rentalId: row.rentalId ?? row.rental_id,
    customerId: row.customerId ?? row.customer_id,
    currentVehicleId: row.currentVehicleId ?? row.current_vehicle_id,
    requestedVehicleId: row.requestedVehicleId ?? row.requested_vehicle_id,
    status: row.status,
    note: row.note ?? undefined,
    declineReason: row.declineReason ?? row.decline_reason ?? undefined,
    createdAt: iso(row.createdAt ?? row.created_at),
    resolvedAt:
      (row.resolvedAt ?? row.resolved_at) ? iso(row.resolvedAt ?? row.resolved_at) : undefined,
  }
}

export function mapAuditLog(row: any): AuditLog {
  return {
    id: row.id,
    actorId: row.actorId ?? row.actor_id ?? undefined,
    actorRole: row.actorRole ?? row.actor_role ?? undefined,
    action: row.action,
    entityType: row.entityType ?? row.entity_type,
    entityId: row.entityId ?? row.entity_id ?? undefined,
    before: row.before ?? undefined,
    after: row.after ?? undefined,
    note: row.note ?? undefined,
    createdAt: iso(row.createdAt ?? row.created_at),
  }
}

export function mapPayment(row: any): Payment {
  return {
    id: row.id,
    rentalId: row.rentalId ?? row.rental_id ?? undefined,
    customerId: row.customerId ?? row.customer_id ?? undefined,
    dealerId: row.dealerId ?? row.dealer_id ?? undefined,
    amount: num(row.amount),
    status: row.status,
    type: row.type,
    method: row.method,
    provider: row.provider ?? 'manual',
    externalTransactionId: row.externalTransactionId ?? row.external_transaction_id ?? undefined,
    vehicleId: row.vehicleId ?? row.vehicle_id ?? undefined,
    bookingRequestId: row.bookingRequestId ?? row.booking_request_id ?? undefined,
    note: row.note ?? undefined,
    needsRefund: row.needsRefund ?? row.needs_refund ?? false,
    invoiceId: row.invoiceId ?? row.invoice_id ?? undefined,
    refundedAmount: num(row.refundedAmount ?? row.refunded_amount),
    refundOfPaymentId: row.refundOfPaymentId ?? row.refund_of_payment_id ?? undefined,
    createdAt: iso(row.createdAt ?? row.created_at),
  }
}

export function mapPlan(row: any): Plan {
  return {
    id: row.id,
    name: row.name,
    tier: row.tier,
    status: row.status,
    priceMonthly: num(row.priceMonthly ?? row.price_monthly),
    priceYearly: num(row.priceYearly ?? row.price_yearly),
    features: row.features ?? [],
  }
}

export function mapSubscription(row: any): Subscription {
  return {
    id: row.id,
    ownerId: row.ownerId ?? row.owner_id,
    ownerType: row.ownerType ?? row.owner_type,
    planId: row.planId ?? row.plan_id,
    status: row.status,
    startDate: dateOnly(row.startDate ?? row.start_date),
    endDate: row.endDate || row.end_date ? dateOnly(row.endDate ?? row.end_date) : undefined,
    usage: (row.usage as Subscription['usage']) ?? { rentals: 0, listings: 0, messages: 0 },
  }
}

export function mapInvoice(row: any): Invoice {
  return {
    id: row.id,
    ownerId: row.ownerId ?? row.owner_id,
    ownerType: row.ownerType ?? row.owner_type,
    amount: num(row.amount),
    status: row.status,
    date: dateOnly(row.date),
    description: row.description,
    rentalId: row.rentalId ?? row.rental_id ?? undefined,
    dueDate: (row.dueDate ?? row.due_date) ? dateOnly(row.dueDate ?? row.due_date) : undefined,
    periodStart:
      (row.periodStart ?? row.period_start) ? dateOnly(row.periodStart ?? row.period_start) : undefined,
    periodEnd:
      (row.periodEnd ?? row.period_end) ? dateOnly(row.periodEnd ?? row.period_end) : undefined,
  }
}

export function mapBookingRequest(row: any): BookingRequest {
  return {
    id: row.id,
    customerId: row.customerId ?? row.customer_id,
    vehicleId: row.vehicleId ?? row.vehicle_id,
    status: row.status,
    createdAt: iso(row.createdAt ?? row.created_at),
    note: row.note ?? undefined,
    declineReason: row.declineReason ?? row.decline_reason ?? undefined,
    awaitingPayment: row.awaitingPayment ?? row.awaiting_payment ?? false,
  }
}

export function mapFavorite(row: any): Favorite {
  return {
    id: row.id,
    customerId: row.customerId ?? row.customer_id,
    vehicleId: row.vehicleId ?? row.vehicle_id,
    createdAt: iso(row.createdAt ?? row.created_at),
  }
}

export function mapComplaint(row: any): Complaint {
  return {
    id: row.id,
    customerId: row.customerId ?? row.customer_id,
    category: row.category,
    priority: row.priority,
    status: row.status,
    subject: row.subject,
    description: row.description,
    createdAt: iso(row.createdAt ?? row.created_at),
    assignedTo: row.assignedTo ?? row.assigned_to ?? undefined,
  }
}

export function mapMessage(row: any): Message {
  return {
    id: row.id,
    fromUserId: row.fromUserId ?? row.from_user_id,
    toUserId: row.toUserId ?? row.to_user_id,
    subject: row.subject,
    body: row.body,
    read: row.read,
    folder: row.folder,
    createdAt: iso(row.createdAt ?? row.created_at),
  }
}

export function mapNotification(row: any): Notification {
  return {
    id: row.id,
    userId: row.userId ?? row.user_id,
    type: row.type,
    title: row.title,
    message: row.message,
    read: row.read,
    createdAt: iso(row.createdAt ?? row.created_at),
  }
}

export function mapLead(row: any): Lead {
  return {
    id: row.id,
    dealerId: row.dealerId ?? row.dealer_id,
    name: row.name,
    email: row.email,
    phone: row.phone ?? undefined,
    source: row.source,
    stage: row.stage,
    priority: row.priority ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: iso(row.createdAt ?? row.created_at),
  }
}

export function mapPaymentMethod(row: any): PaymentMethod {
  return {
    id: row.id,
    brand: row.brand,
    last4: row.last4,
    expiryMonth: row.expiryMonth ?? row.expiry_month,
    expiryYear: row.expiryYear ?? row.expiry_year,
    isDefault: row.isDefault ?? row.is_default,
    methodType: row.methodType ?? row.method_type,
  }
}

export function mapMaintenanceRecord(row: any) {
  const photos = row.photos
  return {
    id: row.id,
    vehicleId: row.vehicleId ?? row.vehicle_id,
    dealerId: row.dealerId ?? row.dealer_id,
    rentalId: row.rentalId ?? row.rental_id ?? null,
    status: row.status,
    title: row.title,
    description: row.description ?? null,
    reportedBy: row.reportedBy ?? row.reported_by ?? null,
    photos: Array.isArray(photos) ? photos : [],
    scheduledAt: row.scheduledAt ?? row.scheduled_at ? iso(row.scheduledAt ?? row.scheduled_at) : null,
    source: row.source ?? 'dealer',
    completedAt: row.completedAt ?? row.completed_at ? iso(row.completedAt ?? row.completed_at) : null,
    createdAt: iso(row.createdAt ?? row.created_at),
    reporterName: row.reporterName ?? row.reporter_name ?? undefined,
  }
}
