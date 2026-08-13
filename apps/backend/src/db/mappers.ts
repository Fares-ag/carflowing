import type {
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
  Subscription,
  User,
  Vehicle,
} from '@carflow/shared'

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
    createdAt: iso(row.createdAt ?? row.created_at),
  }
}

export function mapVehicle(row: any): Vehicle {
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
    imageUrl: row.imageUrl ?? row.image_url ?? undefined,
    color: row.color ?? undefined,
    licensePlate: row.licensePlate ?? row.license_plate ?? undefined,
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
