import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

export const userRoleEnum = pgEnum('user_role', [
  'admin',
  'dealer',
  'customer',
  'finance',
  'ops',
  'support',
])
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
  'paused',
  'past_due',
  'completed',
  'cancelled',
])
export const rentalEventTypeEnum = pgEnum('rental_event_type', [
  'pickup',
  'return',
  'swap_out',
  'swap_in',
  'inspection',
  'note',
])
export const swapRequestStatusEnum = pgEnum('swap_request_status', [
  'pending',
  'approved',
  'declined',
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
  'void',
])
export const bookingRequestStatusEnum = pgEnum('booking_request_status', [
  'pending',
  'approved',
  'declined',
])
export const dealerSubscriptionStatusEnum = pgEnum('dealer_subscription_status', [
  'active',
  'past_due',
  'cancelled',
])
export const dealerInvoiceStatusEnum = pgEnum('dealer_invoice_status', [
  'open',
  'paid',
  'past_due',
  'void',
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
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
},
  (table) => ({
    // Range scan for the retention sweep that purges spent/expired tokens.
    expiresAtIdx: index('password_reset_tokens_expires_at_idx').on(table.expiresAt),
  })
)

export const emailVerificationTokens = pgTable(
  'email_verification_tokens',
  {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
},
  (table) => ({
    expiresAtIdx: index('email_verification_tokens_expires_at_idx').on(table.expiresAt),
  })
)

export const refreshSessions = pgTable(
  'refresh_sessions',
  {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  jtiHash: text('jti_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
},
  (table) => ({
    expiresAtIdx: index('refresh_sessions_expires_at_idx').on(table.expiresAt),
  })
)

export const twoFaChallenges = pgTable(
  'two_fa_challenges',
  {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  jtiHash: text('jti_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
},
  (table) => ({
    expiresAtIdx: index('two_fa_challenges_expires_at_idx').on(table.expiresAt),
  })
)

export const customerProfiles = pgTable(
  'customer_profiles',
  {
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
  billingAddressLine1: text('billing_address_line1'),
  billingAddressLine2: text('billing_address_line2'),
  billingCity: text('billing_city'),
  billingCountry: text('billing_country'),
  billingPostalCode: text('billing_postal_code'),
},
  (table) => ({
    userUnique: uniqueIndex('customer_profiles_user_idx').on(table.userId),
    spentNonneg: check('customer_profiles_total_spent_nonneg', sql`${table.totalSpent} >= 0`),
  })
)

export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  tier: planTierEnum('tier').notNull(),
  status: planStatusEnum('status').notNull().default('draft'),
  priceMonthly: numeric('price_monthly').notNull().default('0'),
  priceYearly: numeric('price_yearly').notNull().default('0'),
  features: text('features').array().notNull().default([]),
})

export const dealers = pgTable(
  'dealers',
  {
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
  businessHours: jsonb('business_hours').notNull().default([]),
  logoUrl: text('logo_url'),
  bankAccountName: text('bank_account_name'),
  bankName: text('bank_name'),
  bankIban: text('bank_iban'),
  bankDetailsVerifiedAt: timestamp('bank_details_verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
},
  (table) => ({
    ownerUnique: uniqueIndex('dealers_owner_user_idx').on(table.ownerUserId),
    revenueNonneg: check('dealers_total_revenue_nonneg', sql`${table.totalRevenue} >= 0`),
  })
)

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
  imageUrls: text('image_urls').array().notNull().default([]),
  description: text('description'),
  color: text('color'),
  mileageCapKm: integer('mileage_cap_km'),
  features: jsonb('features').$type<string[]>().notNull().default([]),
  licensePlate: text('license_plate'),
  locationCity: text('location_city'),
  locationArea: text('location_area'),
  latitude: numeric('latitude'),
  longitude: numeric('longitude'),
})

export const bookingRequests = pgTable(
  'booking_requests',
  {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  vehicleId: uuid('vehicle_id')
    .notNull()
    .references(() => vehicles.id, { onDelete: 'restrict' }),
  status: bookingRequestStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  note: text('note'),
  declineReason: text('decline_reason'),
  /** True while an online payment holds this vehicle; hidden from dealers until paid. */
  awaitingPayment: boolean('awaiting_payment').notNull().default(false),
},
  (table) => ({
    pendingVehicle: uniqueIndex('booking_requests_pending_vehicle_idx')
      .on(table.vehicleId)
      .where(sql`${table.status} = 'pending'`),
  })
)

export const rentals = pgTable('rentals', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'restrict' }),
  dealerId: uuid('dealer_id')
    .notNull()
    .references(() => dealers.id, { onDelete: 'restrict' }),
  vehicleId: uuid('vehicle_id')
    .notNull()
    .references(() => vehicles.id, { onDelete: 'restrict' }),
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
  // --- Subscription fields (invygo/FINN-style monthly cycle) ---
  /** Recurring monthly price captured at approval (pricePerDay × 30). */
  monthlyAmount: numeric('monthly_amount').notNull().default('0'),
  /** Minimum term chosen at checkout; subscription rolls monthly afterwards. */
  termMonths: integer('term_months').notNull().default(1),
  /** Start of the next unbilled period; null once billing has stopped. */
  nextBillingDate: date('next_billing_date'),
  cancelRequestedAt: timestamp('cancel_requested_at', { withTimezone: true }),
  /** Billing-boundary date the subscription ends after a cancel request. */
  cancellationEffectiveDate: date('cancellation_effective_date'),
  cancelReason: text('cancel_reason'),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  /** Refundable deposit collected on first invoice when configured. */
  depositAmount: numeric('deposit_amount').notNull().default('0'),
  depositRefundable: boolean('deposit_refundable').notNull().default(true),
  /** Amount returned to the customer when the subscription ends. */
  depositResolvedAmount: numeric('deposit_resolved_amount').notNull().default('0'),
  /** Amount kept by the dealer/platform for damages or fees. */
  depositWithheldAmount: numeric('deposit_withheld_amount').notNull().default('0'),
  depositResolutionNote: text('deposit_resolution_note'),
  depositResolvedAt: timestamp('deposit_resolved_at', { withTimezone: true }),
  /** Dealer workflow: scheduled | delivered for pickup/delivery handover. */
  pickupFulfilmentStatus: text('pickup_fulfilment_status'),
  /** Customer-requested vehicle collection when cancelling an active subscription. */
  returnLocation: text('return_location'),
  returnDate: date('return_date'),
  returnTime: text('return_time'),
  /** When the subscription was paused (travel hold). */
  pausedAt: timestamp('paused_at', { withTimezone: true }),
  /** Latest calendar date the pause may run (inclusive). */
  pausedUntil: date('paused_until'),
  pauseReason: text('pause_reason'),
},
  (table) => ({
    vehicleOpen: uniqueIndex('rentals_vehicle_open_idx')
      .on(table.vehicleId)
      .where(sql`${table.status} <> 'completed' AND ${table.status} <> 'cancelled'`),
    totalNonneg: check('rentals_total_amount_nonneg', sql`${table.totalAmount} >= 0`),
    monthlyNonneg: check('rentals_monthly_amount_nonneg', sql`${table.monthlyAmount} >= 0`),
    endAfterStart: check('rentals_end_after_start', sql`${table.endDate} >= ${table.startDate}`),
  })
)

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
  /** Subscription invoice this payment settles, when applicable. */
  invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'set null' }),
  /** Total amount refunded against this payment (partial refunds supported). */
  refundedAmount: numeric('refunded_amount').notNull().default('0'),
  /** For type='refund' rows: the original payment being refunded. */
  refundOfPaymentId: uuid('refund_of_payment_id').references((): AnyPgColumn => payments.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
},
  (table) => ({
    pendingBooking: uniqueIndex('payments_pending_booking_idx')
      .on(table.bookingRequestId)
      .where(sql`${table.status} = 'pending' AND ${table.bookingRequestId} IS NOT NULL`),
    pendingInvoice: uniqueIndex('payments_pending_invoice_idx')
      .on(table.invoiceId)
      .where(sql`${table.status} = 'pending' AND ${table.invoiceId} IS NOT NULL`),
    externalTxn: uniqueIndex('payments_external_txn_idx')
      .on(table.externalTransactionId)
      .where(sql`${table.externalTransactionId} IS NOT NULL`),
    amountNonneg: check('payments_amount_nonneg', sql`${table.amount} >= 0`),
    refundedNonneg: check('payments_refunded_amount_nonneg', sql`${table.refundedAmount} >= 0`),
  })
)

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
  subtotal: numeric('subtotal').notNull().default('0'),
  taxRate: numeric('tax_rate').notNull().default('0'),
  taxAmount: numeric('tax_amount').notNull().default('0'),
  status: invoiceStatusEnum('status').notNull().default('due'),
  date: date('date').notNull().defaultNow(),
  description: text('description').notNull(),
  depositAmount: numeric('deposit_amount').notNull().default('0'),
  /** Store credit applied to this invoice (referrals, etc.). */
  creditApplied: numeric('credit_applied').notNull().default('0'),
  /** Subscription (rental) this invoice bills, for monthly-cycle invoices. */
  rentalId: uuid('rental_id').references(() => rentals.id, { onDelete: 'set null' }),
  dueDate: date('due_date'),
  periodStart: date('period_start'),
  periodEnd: date('period_end'),
},
  (table) => ({
    rentalPeriod: uniqueIndex('invoices_rental_period_idx')
      .on(table.rentalId, table.periodStart)
      .where(sql`${table.rentalId} IS NOT NULL AND ${table.periodStart} IS NOT NULL`),
    amountNonneg: check('invoices_amount_nonneg', sql`${table.amount} >= 0`),
  })
)

export const emailOutboxStatusEnum = pgEnum('email_outbox_status', ['pending', 'sent', 'failed'])

export const emailOutbox = pgTable(
  'email_outbox',
  {
  id: uuid('id').primaryKey().defaultRandom(),
  to: text('to').notNull(),
  subject: text('subject').notNull(),
  html: text('html').notNull(),
  status: emailOutboxStatusEnum('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
},
  (table) => ({
    createdAtIdx: index('email_outbox_created_at_idx').on(table.createdAt),
  })
)

export const invoiceReminderSends = pgTable(
  'invoice_reminder_sends',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    stage: text('stage').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    invoiceStageUnique: uniqueIndex('invoice_reminder_sends_invoice_stage_key').on(
      table.invoiceId,
      table.stage
    ),
  })
)

export const rentalEvents = pgTable('rental_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  rentalId: uuid('rental_id')
    .notNull()
    .references(() => rentals.id, { onDelete: 'cascade' }),
  type: rentalEventTypeEnum('type').notNull(),
  mileage: integer('mileage'),
  fuelLevel: text('fuel_level'),
  conditionNotes: text('condition_notes'),
  photos: jsonb('photos').notNull().default([]),
  recordedBy: uuid('recorded_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const swapRequests = pgTable('swap_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  rentalId: uuid('rental_id')
    .notNull()
    .references(() => rentals.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  currentVehicleId: uuid('current_vehicle_id')
    .notNull()
    .references(() => vehicles.id, { onDelete: 'cascade' }),
  requestedVehicleId: uuid('requested_vehicle_id')
    .notNull()
    .references(() => vehicles.id, { onDelete: 'cascade' }),
  status: swapRequestStatusEnum('status').notNull().default('pending'),
  note: text('note'),
  declineReason: text('decline_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
})

export const auditLogs = pgTable(
  'audit_logs',
  {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').references(() => profiles.id, { onDelete: 'set null' }),
  actorRole: text('actor_role'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  before: jsonb('before'),
  after: jsonb('after'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
},
  (table) => ({
    createdAtIdx: index('audit_logs_created_at_idx').on(table.createdAt),
  })
)

export const favorites = pgTable(
  'favorites',
  {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  vehicleId: uuid('vehicle_id')
    .notNull()
    .references(() => vehicles.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
},
  (table) => ({
    customerVehicle: uniqueIndex('favorites_customer_vehicle_uidx').on(
      table.customerId,
      table.vehicleId
    ),
  })
)

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

export const complaintReplies = pgTable(
  'complaint_replies',
  {
  id: uuid('id').primaryKey().defaultRandom(),
  complaintId: uuid('complaint_id')
    .notNull()
    .references(() => complaints.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
},
  (table) => ({
    complaintIdx: index('complaint_replies_complaint_idx').on(table.complaintId),
  })
)

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
  /** `reference` = customer-entered last4 for display only; `skipcash` = provider token vault. */
  provider: text('provider').notNull().default('reference'),
  /** SkipCash tokenId only — never store PAN or full card number. */
  providerTokenId: text('provider_token_id'),
  tokenSavedAt: timestamp('token_saved_at', { withTimezone: true }),
})

export const maintenanceRecords = pgTable('maintenance_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  vehicleId: uuid('vehicle_id')
    .notNull()
    .references(() => vehicles.id, { onDelete: 'restrict' }),
  dealerId: uuid('dealer_id')
    .notNull()
    .references(() => dealers.id, { onDelete: 'restrict' }),
  rentalId: uuid('rental_id').references(() => rentals.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('open'),
  title: text('title').notNull(),
  description: text('description'),
  reportedBy: uuid('reported_by').references(() => profiles.id, { onDelete: 'set null' }),
  photos: jsonb('photos').notNull().default([]),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  source: text('source').notNull().default('dealer'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const commissionLedger = pgTable('commission_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  dealerId: uuid('dealer_id')
    .notNull()
    .references(() => dealers.id, { onDelete: 'restrict' }),
  invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'set null' }),
  paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'set null' }),
  grossAmount: numeric('gross_amount').notNull().default('0'),
  commissionRate: numeric('commission_rate').notNull().default('0.10'),
  commissionAmount: numeric('commission_amount').notNull().default('0'),
  netAmount: numeric('net_amount').notNull().default('0'),
  status: text('status').notNull().default('pending'),
  payoutId: uuid('payout_id').references(() => payouts.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const payouts = pgTable('payouts', {
  id: uuid('id').primaryKey().defaultRandom(),
  dealerId: uuid('dealer_id')
    .notNull()
    .references(() => dealers.id, { onDelete: 'restrict' }),
  amount: numeric('amount').notNull().default('0'),
  status: text('status').notNull().default('pending'),
  periodStart: date('period_start'),
  periodEnd: date('period_end'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const appSettings = pgTable('app_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyName: text('company_name').notNull().default('CarFlow'),
  supportEmail: text('support_email').notNull().default('support@carflow.dev'),
  supportPhone: text('support_phone'),
  defaultTaxRate: numeric('default_tax_rate').notNull().default('0'),
  platformCommissionRate: numeric('platform_commission_rate'),
  billingGraceDays: integer('billing_grace_days'),
  paymentHoldTtlMinutes: integer('payment_hold_ttl_minutes'),
  cancelNoticeDays: integer('cancel_notice_days'),
  swapEligibleDays: integer('swap_eligible_days'),
  maxPauseDays: integer('max_pause_days'),
  subscriptionDepositAmount: numeric('subscription_deposit_amount'),
  signupsEnabled: boolean('signups_enabled').notNull().default(true),
  dealerSignupsEnabled: boolean('dealer_signups_enabled').notNull().default(true),
  onlinePaymentsEnabled: boolean('online_payments_enabled').notNull().default(true),
  newBookingsEnabled: boolean('new_bookings_enabled').notNull().default(true),
  lastJobsSweepAt: timestamp('last_jobs_sweep_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const userPreferences = pgTable('user_preferences', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  emailNotifications: boolean('email_notifications').notNull().default(true),
  pushNotifications: boolean('push_notifications').notNull().default(true),
  smsNotifications: boolean('sms_notifications').notNull().default(false),
  whatsappNotifications: boolean('whatsapp_notifications').notNull().default(false),
  marketingEmails: boolean('marketing_emails').notNull().default(false),
  locale: text('locale').notNull().default('en'),
  theme: text('theme').notNull().default('system'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const userSecurity = pgTable('user_security', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  totpSecret: text('totp_secret'),
  totpEnabled: boolean('totp_enabled').notNull().default(false),
  smsPhone: text('sms_phone'),
  smsVerifiedAt: timestamp('sms_verified_at', { withTimezone: true }),
  smsCodeHash: text('sms_code_hash'),
  smsCodeExpiresAt: timestamp('sms_code_expires_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const rentalReviews = pgTable(
  'rental_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rentalId: uuid('rental_id')
      .notNull()
      .references(() => rentals.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    dealerId: uuid('dealer_id')
      .notNull()
      .references(() => dealers.id, { onDelete: 'cascade' }),
    vehicleId: uuid('vehicle_id')
      .notNull()
      .references(() => vehicles.id, { onDelete: 'restrict' }),
  rating: integer('rating').notNull(),
  comment: text('comment'),
  dealerResponse: text('dealer_response'),
  dealerRespondedAt: timestamp('dealer_responded_at', { withTimezone: true }),
  dealerRespondedBy: uuid('dealer_responded_by').references(() => profiles.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    rentalUnique: uniqueIndex('rental_reviews_rental_unique').on(table.rentalId),
  })
)

export const rentalExtensions = pgTable('rental_extensions', {
  id: uuid('id').primaryKey().defaultRandom(),
  rentalId: uuid('rental_id')
    .notNull()
    .references(() => rentals.id, { onDelete: 'cascade' }),
  months: integer('months').notNull(),
  previousEndDate: date('previous_end_date').notNull(),
  newEndDate: date('new_end_date').notNull(),
  previousTermMonths: integer('previous_term_months').notNull(),
  newTermMonths: integer('new_term_months').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const promoCodes = pgTable('promo_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  discountType: text('discount_type').notNull(),
  discountValue: numeric('discount_value').notNull(),
  minTermMonths: integer('min_term_months').notNull().default(1),
  maxUses: integer('max_uses'),
  usedCount: integer('used_count').notNull().default(0),
  perCustomerLimit: integer('per_customer_limit').notNull().default(1),
  firstInvoiceOnly: boolean('first_invoice_only').notNull().default(true),
  validFrom: date('valid_from'),
  validUntil: date('valid_until'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const promoRedemptions = pgTable(
  'promo_redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    promoCodeId: uuid('promo_code_id')
      .notNull()
      .references(() => promoCodes.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    rentalId: uuid('rental_id').references(() => rentals.id, { onDelete: 'set null' }),
    bookingRequestId: uuid('booking_request_id').references(() => bookingRequests.id, {
      onDelete: 'set null',
    }),
    discountAmount: numeric('discount_amount').notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    // Per-customer limits > 1 are enforced via redemption counts in application code.
  ]
)

export const jobRuns = pgTable('job_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  invoices: integer('invoices').notNull().default(0),
  overdue: integer('overdue').notNull().default(0),
  reminders: integer('reminders').notNull().default(0),
  reconciled: integer('reconciled').notNull().default(0),
  holdsReleased: integer('holds_released').notNull().default(0),
  payouts: integer('payouts').notNull().default(0),
  error: text('error'),
})

export const paymentDisputes = pgTable('payment_disputes', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentId: uuid('payment_id')
    .notNull()
    .references(() => payments.id, { onDelete: 'restrict' }),
  customerId: uuid('customer_id').references(() => profiles.id, { onDelete: 'set null' }),
  dealerId: uuid('dealer_id').references(() => dealers.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('open'),
  reason: text('reason').notNull(),
  amount: numeric('amount').notNull().default('0'),
  providerReference: text('provider_reference'),
  assignedTo: uuid('assigned_to').references(() => profiles.id, { onDelete: 'set null' }),
  resolution: text('resolution'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
})

export const staffInvites = pgTable('staff_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  tokenHash: text('token_hash').notNull(),
  invitedBy: uuid('invited_by')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const broadcasts = pgTable('broadcasts', {
  id: uuid('id').primaryKey().defaultRandom(),
  segment: text('segment').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  channels: jsonb('channels').notNull().default({ inApp: true, email: false }),
  sentCount: integer('sent_count').notNull().default(0),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => profiles.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const analyticsRollups = pgTable(
  'analytics_rollups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rollupDate: date('rollup_date').notNull(),
    metricKey: text('metric_key').notNull(),
    metricValue: numeric('metric_value').notNull().default('0'),
    dimensions: jsonb('dimensions').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    rollupUnique: uniqueIndex('analytics_rollups_unique').on(
      table.rollupDate,
      table.metricKey,
      table.dimensions
    ),
  })
)

export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventType: text('event_type').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    userId: uuid('user_id').references(() => profiles.id, { onDelete: 'set null' }),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    properties: jsonb('properties').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    typeOccurredIdx: index('analytics_events_type_occurred_idx').on(table.eventType, table.occurredAt),
    entityIdx: index('analytics_events_entity_idx').on(table.entityType, table.entityId),
    createdAtIdx: index('analytics_events_created_at_idx').on(table.createdAt),
  })
)

export const referralCodes = pgTable('referral_codes', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  code: text('code').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const referrals = pgTable('referrals', {
  id: uuid('id').primaryKey().defaultRandom(),
  referrerUserId: uuid('referrer_user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  referredUserId: uuid('referred_user_id')
    .notNull()
    .unique()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  referralCode: text('referral_code').notNull(),
  status: text('status').notNull().default('pending'),
  firstPaidInvoiceId: uuid('first_paid_invoice_id').references(() => invoices.id, {
    onDelete: 'set null',
  }),
  creditedAt: timestamp('credited_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const customerCredits = pgTable(
  'customer_credits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    amount: numeric('amount').notNull(),
    remainingAmount: numeric('remaining_amount').notNull(),
    source: text('source').notNull(),
    referralId: uuid('referral_id').references(() => referrals.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    referralGrantUnique: uniqueIndex('customer_credits_referral_grant_uidx')
      .on(table.referralId, table.userId, table.source)
      .where(sql`${table.referralId} IS NOT NULL`),
  })
)

/**
 * Append-only record of a user accepting a versioned legal document
 * (signup terms/privacy, checkout rental agreement). Re-accepting a newer
 * version inserts another row; rows are never updated.
 */
export const consentRecords = pgTable(
  'consent_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** 'terms' | 'privacy' | 'rental_agreement' — text so new documents need no migration. */
    documentKind: text('document_kind').notNull(),
    documentVersion: text('document_version').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
  },
  (table) => ({
    profileKindIdx: index('consent_records_profile_kind_idx').on(
      table.profileId,
      table.documentKind
    ),
  })
)

export const dealerPlans = pgTable(
  'dealer_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    priceQar: numeric('price_qar').notNull().default('0'),
    /** Null means unlimited listings. */
    vehicleLimit: integer('vehicle_limit'),
    features: jsonb('features').$type<string[]>().notNull().default([]),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    priceNonneg: check('dealer_plans_price_qar_nonneg', sql`${table.priceQar} >= 0`),
  })
)

export const dealerSubscriptions = pgTable(
  'dealer_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dealerId: uuid('dealer_id')
      .notNull()
      .references(() => dealers.id, { onDelete: 'restrict' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => dealerPlans.id, { onDelete: 'restrict' }),
    status: dealerSubscriptionStatusEnum('status').notNull().default('active'),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true })
      .notNull()
      .defaultNow(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
    /** Set when the dealer has asked to stop at the end of the current period. */
    cancelAt: timestamp('cancel_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    dealerOpen: uniqueIndex('dealer_subscriptions_dealer_open_uidx')
      .on(table.dealerId)
      .where(sql`${table.status} <> 'cancelled'`),
  })
)

export const dealerInvoices = pgTable(
  'dealer_invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dealerId: uuid('dealer_id')
      .notNull()
      .references(() => dealers.id, { onDelete: 'restrict' }),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => dealerSubscriptions.id, { onDelete: 'restrict' }),
    amount: numeric('amount').notNull().default('0'),
    status: dealerInvoiceStatusEnum('status').notNull().default('open'),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    subscriptionPeriod: uniqueIndex('dealer_invoices_subscription_period_uidx').on(
      table.subscriptionId,
      table.periodStart
    ),
    dealerStatusIdx: index('dealer_invoices_dealer_status_idx').on(table.dealerId, table.status),
    amountNonneg: check('dealer_invoices_amount_nonneg', sql`${table.amount} >= 0`),
  })
)
