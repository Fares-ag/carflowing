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
} from './types'

export function mapProfileToUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    phone: row.phone ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    createdAt: row.created_at,
  }
}

export function mapDealer(row: any): Dealer {
  return {
    id: row.id,
    name: row.name,
    ownerUserId: row.owner_user_id,
    status: row.status,
    planId: row.plan_id,
    rating: row.rating,
    totalRevenue: row.total_revenue,
    activeRentals: row.active_rentals,
    vehiclesCount: row.vehicles_count,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone ?? undefined,
    createdAt: row.created_at,
  }
}

export function mapVehicle(row: any): Vehicle {
  return {
    id: row.id,
    dealerId: row.dealer_id,
    name: row.name,
    make: row.make,
    model: row.model,
    year: row.year,
    category: row.category,
    status: row.status,
    pricePerDay: row.price_per_day,
    mileage: row.mileage,
    transmission: row.transmission,
    fuelType: row.fuel_type,
    seats: row.seats,
    imageUrl: row.image_url ?? undefined,
  }
}

export function mapRental(row: any): Rental {
  return {
    id: row.id,
    customerId: row.customer_id,
    dealerId: row.dealer_id,
    vehicleId: row.vehicle_id,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    totalAmount: row.total_amount,
    paymentStatus: row.payment_status,
    createdAt: row.created_at,
  }
}

export function mapPayment(row: any): Payment {
  return {
    id: row.id,
    rentalId: row.rental_id ?? undefined,
    customerId: row.customer_id ?? undefined,
    dealerId: row.dealer_id ?? undefined,
    amount: row.amount,
    status: row.status,
    type: row.type,
    method: row.method,
    createdAt: row.created_at,
  }
}

export function mapPlan(row: any): Plan {
  return {
    id: row.id,
    name: row.name,
    tier: row.tier,
    status: row.status,
    priceMonthly: row.price_monthly,
    priceYearly: row.price_yearly,
    features: row.features ?? [],
  }
}

export function mapComplaint(row: any): Complaint {
  return {
    id: row.id,
    customerId: row.customer_id,
    category: row.category,
    priority: row.priority,
    status: row.status,
    subject: row.subject,
    description: row.description,
    createdAt: row.created_at,
    assignedTo: row.assigned_to ?? undefined,
  }
}

export function mapMessage(row: any): Message {
  return {
    id: row.id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    subject: row.subject,
    body: row.body,
    read: row.read,
    folder: row.folder,
    createdAt: row.created_at,
  }
}

export function mapNotification(row: any): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    message: row.message,
    read: row.read,
    createdAt: row.created_at,
  }
}

export function mapLead(row: any): Lead {
  return {
    id: row.id,
    dealerId: row.dealer_id,
    name: row.name,
    email: row.email,
    phone: row.phone ?? undefined,
    source: row.source,
    stage: row.stage,
    createdAt: row.created_at,
  }
}

export function mapSubscription(row: any): Subscription {
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerType: row.owner_type,
    planId: row.plan_id,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date ?? undefined,
    usage: row.usage ?? { rentals: 0, listings: 0, messages: 0 },
  }
}

export function mapPaymentMethod(row: any): PaymentMethod {
  return {
    id: row.id,
    brand: row.brand,
    last4: row.last4,
    expiryMonth: row.expiry_month,
    expiryYear: row.expiry_year,
    isDefault: row.is_default,
    methodType: row.method_type,
  }
}

export function mapInvoice(row: any): Invoice {
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerType: row.owner_type,
    amount: row.amount,
    status: row.status,
    date: row.date,
    description: row.description,
  }
}

export function mapBookingRequest(row: any): BookingRequest {
  return {
    id: row.id,
    customerId: row.customer_id,
    vehicleId: row.vehicle_id,
    status: row.status,
    createdAt: row.created_at,
    note: row.note ?? undefined,
  }
}

export function mapFavorite(row: any): Favorite {
  return {
    id: row.id,
    customerId: row.customer_id,
    vehicleId: row.vehicle_id,
    createdAt: row.created_at,
  }
}
