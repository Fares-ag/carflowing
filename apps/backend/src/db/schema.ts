import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const userRoleEnum = pgEnum('user_role', ['admin', 'dealer', 'customer'])
export const userStatusEnum = pgEnum('user_status', ['active', 'suspended', 'pending'])
export const customerStatusEnum = pgEnum('customer_status', [
  'active',
  'suspended',
  'verified',
  'unverified',
])
export const vehicleStatusEnum = pgEnum('vehicle_status', [
  'available',
  'rented',
  'maintenance',
  'inactive',
])
export const vehicleCategoryEnum = pgEnum('vehicle_category', [
  'sedan',
  'suv',
  'truck',
  'luxury',
  'ev',
  'other',
])
export const transmissionTypeEnum = pgEnum('transmission_type', ['automatic', 'manual'])
export const fuelTypeEnum = pgEnum('fuel_type', ['gas', 'diesel', 'electric', 'hybrid'])
export const rentalStatusEnum = pgEnum('rental_status', [
  'reserved',
  'active',
  'completed',
  'cancelled',
])
export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'completed',
  'refunded',
  'failed',
])
export const paymentTypeEnum = pgEnum('payment_type', ['rental', 'subscription', 'refund'])
export const paymentMethodTypeEnum = pgEnum('payment_method_type', ['card', 'bank', 'wallet'])
export const planStatusEnum = pgEnum('plan_status', ['draft', 'active', 'archived'])
export const planTierEnum = pgEnum('plan_tier', ['starter', 'professional', 'enterprise'])
export const complaintPriorityEnum = pgEnum('complaint_priority', [
  'low',
  'medium',
  'high',
  'urgent',
])
export const complaintStatusEnum = pgEnum('complaint_status', [
  'open',
  'in_progress',
  'resolved',
])
export const messageFolderEnum = pgEnum('message_folder', [
  'inbox',
  'sent',
  'starred',
  'archived',
])
export const notificationTypeEnum = pgEnum('notification_type', [
  'info',
  'warning',
  'success',
  'error',
])
export const leadStageEnum = pgEnum('lead_stage', [
  'new',
  'contacted',
  'qualified',
  'converted',
  'closed',
])
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trial',
  'active',
  'past_due',
  'canceled',
])
export const subscriptionOwnerTypeEnum = pgEnum('subscription_owner_type', [
  'dealer',
  'customer',
])
export const invoiceStatusEnum = pgEnum('invoice_status', [
  'paid',
  'due',
  'overdue',
  'refunded',
])
export const bookingRequestStatusEnum = pgEnum('booking_request_status', [
  'pending',
  'approved',
  'declined',
])

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: userRoleEnum('role').notNull().default('customer'),
  phone: text('phone'),
  avatarUrl: text('avatar_url'),
  status: userStatusEnum('status').notNull().default('active'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const emailVerificationTokens = pgTable('email_verification_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const refreshSessions = pgTable('refresh_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  jtiHash: text('jti_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const customerProfiles = pgTable('customer_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  status: customerStatusEnum('status').notNull().default('unverified'),
  joinDate: timestamp('join_date', { withTimezone: true }).notNull().defaultNow(),
  rentalsCount: integer('rentals_count').notNull().default(0),
  totalSpent: numeric('total_spent').notNull().default('0'),
  qidDocumentPath: text('qid_document_path'),
  driversLicensePath: text('drivers_license_path'),
})

export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  tier: planTierEnum('tier').notNull(),
  status: planStatusEnum('status').notNull().default('draft'),
  priceMonthly: numeric('price_monthly').notNull().default('0'),
  priceYearly: numeric('price_yearly').notNull().default('0'),
  features: text('features').array().notNull().default([]),
})

export const dealers = pgTable('dealers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  status: userStatusEnum('status').notNull().default('pending'),
  planId: uuid('plan_id').references(() => plans.id),
  rating: numeric('rating').notNull().default('0'),
  totalRevenue: numeric('total_revenue').notNull().default('0'),
  activeRentals: integer('active_rentals').notNull().default(0),
  vehiclesCount: integer('vehicles_count').notNull().default(0),
  contactEmail: text('contact_email').notNull(),
  contactPhone: text('contact_phone'),
  website: text('website'),
  address: text('address'),
  description: text('description'),
  licenseNumber: text('license_number'),
  taxId: text('tax_id'),
  businessHours: jsonb('business_hours').notNull().default([]),
  logoUrl: text('logo_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const vehicles = pgTable('vehicles', {
  id: uuid('id').primaryKey().defaultRandom(),
  dealerId: uuid('dealer_id')
    .notNull()
    .references(() => dealers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  make: text('make').notNull(),
  model: text('model').notNull(),
  year: integer('year').notNull(),
  category: vehicleCategoryEnum('category').notNull(),
  status: vehicleStatusEnum('status').notNull().default('available'),
  pricePerDay: numeric('price_per_day').notNull().default('0'),
  mileage: integer('mileage').notNull().default(0),
  transmission: transmissionTypeEnum('transmission').notNull(),
  fuelType: fuelTypeEnum('fuel_type').notNull(),
  seats: integer('seats').notNull().default(4),
  imageUrl: text('image_url'),
  color: text('color'),
  licensePlate: text('license_plate'),
})

export const bookingRequests = pgTable('booking_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  vehicleId: uuid('vehicle_id')
    .notNull()
    .references(() => vehicles.id, { onDelete: 'cascade' }),
  status: bookingRequestStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  note: text('note'),
  declineReason: text('decline_reason'),
})

export const rentals = pgTable('rentals', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  dealerId: uuid('dealer_id')
    .notNull()
    .references(() => dealers.id, { onDelete: 'cascade' }),
  vehicleId: uuid('vehicle_id')
    .notNull()
    .references(() => vehicles.id, { onDelete: 'cascade' }),
  bookingRequestId: uuid('booking_request_id').references(() => bookingRequests.id, {
    onDelete: 'set null',
  }),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  status: rentalStatusEnum('status').notNull().default('reserved'),
  totalAmount: numeric('total_amount').notNull().default('0'),
  paymentStatus: paymentStatusEnum('payment_status').notNull().default('pending'),
  pickupLocation: text('pickup_location'),
  pickupDate: date('pickup_date'),
  pickupTime: text('pickup_time'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  rentalId: uuid('rental_id').references(() => rentals.id, { onDelete: 'set null' }),
  customerId: uuid('customer_id').references(() => profiles.id, { onDelete: 'set null' }),
  dealerId: uuid('dealer_id').references(() => dealers.id, { onDelete: 'set null' }),
  amount: numeric('amount').notNull().default('0'),
  status: paymentStatusEnum('status').notNull().default('pending'),
  type: paymentTypeEnum('type').notNull(),
  method: paymentMethodTypeEnum('method').notNull().default('card'),
  provider: text('provider').notNull().default('manual'),
  externalTransactionId: text('external_transaction_id'),
  // SkipCash-only fields: an online payment is created before the booking request
  // exists, so the intended vehicle/cart are stashed here until the webhook
  // confirms payment and the booking request gets created.
  vehicleId: uuid('vehicle_id').references(() => vehicles.id, { onDelete: 'set null' }),
  bookingRequestId: uuid('booking_request_id').references(() => bookingRequests.id, {
    onDelete: 'set null',
  }),
  note: text('note'),
  needsRefund: boolean('needs_refund').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull(),
  ownerType: subscriptionOwnerTypeEnum('owner_type').notNull(),
  planId: uuid('plan_id').references(() => plans.id),
  status: subscriptionStatusEnum('status').notNull().default('trial'),
  startDate: date('start_date').notNull().defaultNow(),
  endDate: date('end_date'),
  usage: jsonb('usage').notNull().default({ rentals: 0, listings: 0, messages: 0 }),
})

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull(),
  ownerType: subscriptionOwnerTypeEnum('owner_type').notNull(),
  amount: numeric('amount').notNull().default('0'),
  status: invoiceStatusEnum('status').notNull().default('due'),
  date: date('date').notNull().defaultNow(),
  description: text('description').notNull(),
})

export const favorites = pgTable('favorites', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  vehicleId: uuid('vehicle_id')
    .notNull()
    .references(() => vehicles.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const complaints = pgTable('complaints', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  category: text('category').notNull(),
  priority: complaintPriorityEnum('priority').notNull().default('low'),
  status: complaintStatusEnum('status').notNull().default('open'),
  subject: text('subject').notNull(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  assignedTo: uuid('assigned_to').references(() => profiles.id),
})

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  fromUserId: uuid('from_user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  toUserId: uuid('to_user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  read: boolean('read').notNull().default(false),
  folder: messageFolderEnum('folder').notNull().default('inbox'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  type: notificationTypeEnum('type').notNull().default('info'),
  title: text('title').notNull(),
  message: text('message').notNull(),
  read: boolean('read').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  dealerId: uuid('dealer_id')
    .notNull()
    .references(() => dealers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email').notNull(),
  phone: text('phone'),
  source: text('source').notNull(),
  stage: leadStageEnum('stage').notNull().default('new'),
  priority: text('priority').notNull().default('medium'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const paymentMethods = pgTable('payment_methods', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  brand: text('brand').notNull(),
  last4: text('last4').notNull(),
  expiryMonth: integer('expiry_month').notNull(),
  expiryYear: integer('expiry_year').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  methodType: paymentMethodTypeEnum('method_type').notNull().default('card'),
})

export const appSettings = pgTable('app_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyName: text('company_name').notNull().default('CarFlow'),
  supportEmail: text('support_email').notNull().default('support@carflow.dev'),
  supportPhone: text('support_phone'),
  defaultTaxRate: numeric('default_tax_rate').notNull().default('0.05'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
