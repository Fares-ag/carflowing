-- CarFlow bootstrap schema (Postgres / Neon)

DO $$ BEGIN CREATE TYPE user_role AS ENUM ('admin', 'dealer', 'customer', 'finance', 'ops', 'support'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE user_status AS ENUM ('active', 'suspended', 'pending'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE customer_status AS ENUM ('active', 'suspended', 'verified', 'unverified'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE vehicle_status AS ENUM ('available', 'rented', 'maintenance', 'inactive'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE vehicle_category AS ENUM ('sedan', 'suv', 'truck', 'luxury', 'ev', 'other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE transmission_type AS ENUM ('automatic', 'manual'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE fuel_type AS ENUM ('gas', 'diesel', 'electric', 'hybrid'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE rental_status AS ENUM ('reserved', 'active', 'past_due', 'completed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'refunded', 'failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE payment_type AS ENUM ('rental', 'subscription', 'refund'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE payment_method_type AS ENUM ('card', 'bank', 'wallet'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE plan_status AS ENUM ('draft', 'active', 'archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE plan_tier AS ENUM ('starter', 'professional', 'enterprise'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE complaint_priority AS ENUM ('low', 'medium', 'high', 'urgent'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE complaint_status AS ENUM ('open', 'in_progress', 'resolved'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE message_folder AS ENUM ('inbox', 'sent', 'starred', 'archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE notification_type AS ENUM ('info', 'warning', 'success', 'error'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE lead_stage AS ENUM ('new', 'contacted', 'qualified', 'converted', 'closed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE subscription_status AS ENUM ('trial', 'active', 'past_due', 'canceled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE subscription_owner_type AS ENUM ('dealer', 'customer'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE invoice_status AS ENUM ('paid', 'due', 'overdue', 'refunded', 'void'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE booking_request_status AS ENUM ('pending', 'approved', 'declined'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  role user_role NOT NULL DEFAULT 'customer',
  phone text,
  avatar_url text,
  status user_status NOT NULL DEFAULT 'active',
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status customer_status NOT NULL DEFAULT 'unverified',
  join_date timestamptz NOT NULL DEFAULT now(),
  rentals_count integer NOT NULL DEFAULT 0,
  total_spent numeric NOT NULL DEFAULT 0,
  qid_document_path text,
  drivers_license_path text
);

CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tier plan_tier NOT NULL,
  status plan_status NOT NULL DEFAULT 'draft',
  price_monthly numeric NOT NULL DEFAULT 0,
  price_yearly numeric NOT NULL DEFAULT 0,
  features text[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS dealers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status user_status NOT NULL DEFAULT 'pending',
  plan_id uuid REFERENCES plans(id),
  rating numeric NOT NULL DEFAULT 0,
  total_revenue numeric NOT NULL DEFAULT 0,
  active_rentals integer NOT NULL DEFAULT 0,
  vehicles_count integer NOT NULL DEFAULT 0,
  contact_email text NOT NULL,
  contact_phone text,
  website text,
  address text,
  description text,
  license_number text,
  business_hours jsonb NOT NULL DEFAULT '[]',
  logo_url text,
  bank_account_name text,
  bank_name text,
  bank_iban text,
  bank_details_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  name text NOT NULL,
  make text NOT NULL,
  model text NOT NULL,
  year integer NOT NULL,
  category vehicle_category NOT NULL,
  status vehicle_status NOT NULL DEFAULT 'available',
  price_per_day numeric NOT NULL DEFAULT 0,
  mileage integer NOT NULL DEFAULT 0,
  transmission transmission_type NOT NULL,
  fuel_type fuel_type NOT NULL,
  seats integer NOT NULL DEFAULT 4,
  image_url text
);

CREATE TABLE IF NOT EXISTS booking_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  status booking_request_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  note text,
  decline_reason text
);

CREATE TABLE IF NOT EXISTS rentals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  dealer_id uuid NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  booking_request_id uuid REFERENCES booking_requests(id) ON DELETE SET NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status rental_status NOT NULL DEFAULT 'reserved',
  total_amount numeric NOT NULL DEFAULT 0,
  payment_status payment_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_id uuid REFERENCES rentals(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  dealer_id uuid REFERENCES dealers(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  status payment_status NOT NULL DEFAULT 'pending',
  type payment_type NOT NULL,
  method payment_method_type NOT NULL DEFAULT 'card',
  provider text NOT NULL DEFAULT 'manual',
  external_transaction_id text,
  vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  booking_request_id uuid REFERENCES booking_requests(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  owner_type subscription_owner_type NOT NULL,
  plan_id uuid REFERENCES plans(id),
  status subscription_status NOT NULL DEFAULT 'trial',
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  usage jsonb NOT NULL DEFAULT '{"rentals":0,"listings":0,"messages":0}'
);

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  owner_type subscription_owner_type NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  status invoice_status NOT NULL DEFAULT 'due',
  date date NOT NULL DEFAULT CURRENT_DATE,
  description text NOT NULL
);

CREATE TABLE IF NOT EXISTS favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category text NOT NULL,
  priority complaint_priority NOT NULL DEFAULT 'low',
  status complaint_status NOT NULL DEFAULT 'open',
  subject text NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  assigned_to uuid REFERENCES profiles(id)
);

CREATE TABLE IF NOT EXISTS complaint_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject text NOT NULL,
  body text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  folder message_folder NOT NULL DEFAULT 'inbox',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type notification_type NOT NULL DEFAULT 'info',
  title text NOT NULL,
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  source text NOT NULL,
  stage lead_stage NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  brand text NOT NULL,
  last4 text NOT NULL,
  expiry_month integer NOT NULL,
  expiry_year integer NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  method_type payment_method_type NOT NULL DEFAULT 'card'
);

-- Idempotent column additions for pre-existing databases created before
-- booking idempotency / SkipCash support was added.
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS booking_request_id uuid REFERENCES booking_requests(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'manual';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS external_transaction_id text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS booking_request_id uuid REFERENCES booking_requests(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS needs_refund boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refresh_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  jti_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS two_fa_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  jti_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS license_plate text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS image_urls text[] NOT NULL DEFAULT '{}';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS mileage_cap_km integer;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS location_city text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS location_area text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS latitude numeric;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS longitude numeric;
CREATE INDEX IF NOT EXISTS vehicles_location_city_idx ON vehicles (location_city);
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS pickup_location text;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS pickup_date date;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS pickup_time text;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS pickup_fulfilment_status text;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS return_location text;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS return_date date;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS return_time text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes text;

-- At most one pending booking request per vehicle at a time. Enforced at the
-- DB level (rather than a check-then-insert) so concurrent requests for the
-- same vehicle can't both succeed.
CREATE UNIQUE INDEX IF NOT EXISTS booking_requests_pending_vehicle_idx
  ON booking_requests (vehicle_id)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL DEFAULT 'CarFlow',
  support_email text NOT NULL DEFAULT 'support@carflow.dev',
  support_phone text,
  default_tax_rate numeric NOT NULL DEFAULT 0,
  platform_commission_rate numeric NOT NULL DEFAULT 0.1,
  billing_grace_days integer NOT NULL DEFAULT 3,
  payment_hold_ttl_minutes integer NOT NULL DEFAULT 45,
  cancel_notice_days integer NOT NULL DEFAULT 30,
  swap_eligible_days integer NOT NULL DEFAULT 30,
  signups_enabled boolean NOT NULL DEFAULT true,
  online_payments_enabled boolean NOT NULL DEFAULT true,
  new_bookings_enabled boolean NOT NULL DEFAULT true,
  last_jobs_sweep_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ===========================================================================
-- 0001: Subscriptions (monthly billing), lifecycle events, swaps, audit log
-- (kept in sync with drizzle/0001_subscriptions_ops.sql)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- New enums / enum values
-- ---------------------------------------------------------------------------
-- New value must not be referenced by any DDL in this same migration.
ALTER TYPE rental_status ADD VALUE IF NOT EXISTS 'past_due';
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'void';

DO $$ BEGIN CREATE TYPE rental_event_type AS ENUM ('pickup','return','swap_out','swap_in','inspection','note'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE swap_request_status AS ENUM ('pending','approved','declined','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Rentals become subscriptions (monthly billing cycle)
-- ---------------------------------------------------------------------------
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS monthly_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS term_months integer NOT NULL DEFAULT 1;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS next_billing_date date;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS cancellation_effective_date date;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS cancel_reason text;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS activated_at timestamptz;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Backfill a plausible monthly amount for pre-existing rows (dev data).
UPDATE rentals
  SET monthly_amount = CASE WHEN term_months > 0 THEN total_amount / GREATEST(term_months, 1) ELSE total_amount END
  WHERE monthly_amount = 0 AND total_amount > 0;

-- ---------------------------------------------------------------------------
-- Invoices: attach to rentals + billing periods (monthly cycle)
-- ---------------------------------------------------------------------------
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS rental_id uuid REFERENCES rentals(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS period_start date;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS period_end date;

-- One invoice per rental billing period (makes invoice generation idempotent).
CREATE UNIQUE INDEX IF NOT EXISTS invoices_rental_period_idx
  ON invoices (rental_id, period_start)
  WHERE rental_id IS NOT NULL AND period_start IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Payments: invoice linkage, refund lineage, provider id uniqueness
-- ---------------------------------------------------------------------------
ALTER TABLE payments ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_of_payment_id uuid REFERENCES payments(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_external_txn_idx
  ON payments (external_transaction_id)
  WHERE external_transaction_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Booking requests: online-payment hold (reserve the car while paying)
-- ---------------------------------------------------------------------------
ALTER TABLE booking_requests ADD COLUMN IF NOT EXISTS awaiting_payment boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- Rental lifecycle events (handover / return / swap / inspection)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rental_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_id uuid NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
  type rental_event_type NOT NULL,
  mileage integer,
  fuel_level text,
  condition_notes text,
  photos jsonb NOT NULL DEFAULT '[]',
  recorded_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rental_events_rental_idx ON rental_events (rental_id);

-- ---------------------------------------------------------------------------
-- Swap requests (invygo-style car swap within the same dealer fleet)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS swap_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_id uuid NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  current_vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  requested_vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  status swap_request_status NOT NULL DEFAULT 'pending',
  note text,
  decline_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS swap_requests_rental_pending_idx
  ON swap_requests (rental_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS swap_requests_requested_vehicle_idx
  ON swap_requests (requested_vehicle_id);

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  actor_role text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  before jsonb,
  after jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs (created_at);

-- ---------------------------------------------------------------------------
-- Financial history can no longer be cascaded away
-- ---------------------------------------------------------------------------
ALTER TABLE rentals DROP CONSTRAINT IF EXISTS rentals_customer_id_fkey;
ALTER TABLE rentals ADD CONSTRAINT rentals_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES profiles(id) ON DELETE RESTRICT;
ALTER TABLE rentals DROP CONSTRAINT IF EXISTS rentals_dealer_id_fkey;
ALTER TABLE rentals ADD CONSTRAINT rentals_dealer_id_fkey
  FOREIGN KEY (dealer_id) REFERENCES dealers(id) ON DELETE RESTRICT;
ALTER TABLE rentals DROP CONSTRAINT IF EXISTS rentals_vehicle_id_fkey;
ALTER TABLE rentals ADD CONSTRAINT rentals_vehicle_id_fkey
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- Inventory invariants
-- ---------------------------------------------------------------------------
-- At most one open (non-terminal) rental per vehicle, enforced by the DB.
-- Predicate deliberately avoids naming enum values added in this migration.
CREATE UNIQUE INDEX IF NOT EXISTS rentals_vehicle_open_idx
  ON rentals (vehicle_id)
  WHERE status <> 'completed' AND status <> 'cancelled';

-- One customer profile row per user (route code assumed this; now enforced).
DELETE FROM customer_profiles a USING customer_profiles b
  WHERE a.user_id = b.user_id AND a.ctid > b.ctid;
CREATE UNIQUE INDEX IF NOT EXISTS customer_profiles_user_idx
  ON customer_profiles (user_id);

-- One dealer per owner account (dealer portal resolves dealer by owner).
CREATE UNIQUE INDEX IF NOT EXISTS dealers_owner_user_idx
  ON dealers (owner_user_id);

-- ---------------------------------------------------------------------------
-- Missing FK/query indexes (Postgres does not index FK columns automatically)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS rentals_customer_idx ON rentals (customer_id);
CREATE INDEX IF NOT EXISTS rentals_dealer_idx ON rentals (dealer_id);
CREATE INDEX IF NOT EXISTS rentals_vehicle_idx ON rentals (vehicle_id);
CREATE INDEX IF NOT EXISTS rentals_billing_idx ON rentals (next_billing_date) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS payments_rental_idx ON payments (rental_id);
CREATE INDEX IF NOT EXISTS payments_customer_idx ON payments (customer_id);
CREATE INDEX IF NOT EXISTS payments_dealer_idx ON payments (dealer_id);
CREATE INDEX IF NOT EXISTS payments_booking_request_idx ON payments (booking_request_id);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments (status);
CREATE INDEX IF NOT EXISTS booking_requests_customer_idx ON booking_requests (customer_id);
CREATE INDEX IF NOT EXISTS booking_requests_vehicle_idx ON booking_requests (vehicle_id);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, read);
CREATE INDEX IF NOT EXISTS invoices_owner_idx ON invoices (owner_id, owner_type);
CREATE INDEX IF NOT EXISTS invoices_rental_idx ON invoices (rental_id);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices (status);
CREATE INDEX IF NOT EXISTS vehicles_dealer_idx ON vehicles (dealer_id);
CREATE INDEX IF NOT EXISTS messages_to_user_idx ON messages (to_user_id);
CREATE INDEX IF NOT EXISTS favorites_customer_idx ON favorites (customer_id);
CREATE INDEX IF NOT EXISTS complaints_customer_idx ON complaints (customer_id);

-- Re-audit hardening: at most ONE in-flight (pending) payment per booking
-- request and per invoice — closes the two-live-payUrls double-charge races.
CREATE UNIQUE INDEX IF NOT EXISTS payments_pending_booking_idx
  ON payments (booking_request_id)
  WHERE status = 'pending' AND booking_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_pending_invoice_idx
  ON payments (invoice_id)
  WHERE status = 'pending' AND invoice_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Production remediation (0002): FK hardening, tax/deposits, maintenance, payouts
-- ---------------------------------------------------------------------------
ALTER TABLE booking_requests DROP CONSTRAINT IF EXISTS booking_requests_vehicle_id_fkey;
ALTER TABLE booking_requests ADD CONSTRAINT booking_requests_vehicle_id_fkey
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subtotal numeric NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_rate numeric NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deposit_amount numeric NOT NULL DEFAULT 0;

ALTER TABLE rentals ADD COLUMN IF NOT EXISTS deposit_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS deposit_refundable boolean NOT NULL DEFAULT true;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS deposit_resolved_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS deposit_withheld_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS deposit_resolution_note text;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS deposit_resolved_at timestamptz;

CREATE TABLE IF NOT EXISTS maintenance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  dealer_id uuid NOT NULL REFERENCES dealers(id) ON DELETE RESTRICT,
  rental_id uuid REFERENCES rentals(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open',
  title text NOT NULL,
  description text,
  reported_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commission_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES dealers(id) ON DELETE RESTRICT,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  gross_amount numeric NOT NULL DEFAULT 0,
  commission_rate numeric NOT NULL DEFAULT 0.10,
  commission_amount numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES dealers(id) ON DELETE RESTRICT,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  period_start date,
  period_end date,
  paid_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE commission_ledger ADD COLUMN IF NOT EXISTS payout_id uuid REFERENCES payouts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS maintenance_records_vehicle_idx ON maintenance_records(vehicle_id);
CREATE INDEX IF NOT EXISTS maintenance_records_dealer_idx ON maintenance_records(dealer_id);
CREATE INDEX IF NOT EXISTS commission_ledger_dealer_idx ON commission_ledger(dealer_id);
CREATE INDEX IF NOT EXISTS commission_ledger_payout_idx ON commission_ledger(payout_id);
CREATE INDEX IF NOT EXISTS payouts_dealer_idx ON payouts(dealer_id);
CREATE INDEX IF NOT EXISTS payments_created_at_idx ON payments(created_at);
CREATE INDEX IF NOT EXISTS rentals_created_at_idx ON rentals(created_at);
CREATE INDEX IF NOT EXISTS rentals_dealer_status_idx ON rentals(dealer_id, status);
CREATE INDEX IF NOT EXISTS vehicles_dealer_status_idx ON vehicles(dealer_id, status);

-- Money discipline CHECK constraints (mirrors drizzle/0002_production_hardening.sql)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rentals_total_amount_nonneg') THEN
    ALTER TABLE rentals ADD CONSTRAINT rentals_total_amount_nonneg CHECK (total_amount >= 0);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rentals_monthly_amount_nonneg') THEN
    ALTER TABLE rentals ADD CONSTRAINT rentals_monthly_amount_nonneg CHECK (monthly_amount >= 0);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rentals_end_after_start') THEN
    ALTER TABLE rentals ADD CONSTRAINT rentals_end_after_start CHECK (end_date >= start_date);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_amount_nonneg') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_amount_nonneg CHECK (amount >= 0);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_refunded_amount_nonneg') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_refunded_amount_nonneg CHECK (refunded_amount >= 0);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_amount_nonneg') THEN
    ALTER TABLE invoices ADD CONSTRAINT invoices_amount_nonneg CHECK (amount >= 0);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_profiles_total_spent_nonneg') THEN
    ALTER TABLE customer_profiles ADD CONSTRAINT customer_profiles_total_spent_nonneg CHECK (total_spent >= 0);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dealers_total_revenue_nonneg') THEN
    ALTER TABLE dealers ADD CONSTRAINT dealers_total_revenue_nonneg CHECK (total_revenue >= 0);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Remove tax (0003): Qatar all-inclusive pricing, drop dealer tax_id
-- ---------------------------------------------------------------------------
ALTER TABLE app_settings ALTER COLUMN default_tax_rate SET DEFAULT 0;
UPDATE app_settings SET default_tax_rate = 0 WHERE default_tax_rate <> 0;
ALTER TABLE dealers DROP COLUMN IF EXISTS tax_id;

-- ---------------------------------------------------------------------------
-- 0006: Invoice payment reminder idempotency
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_reminder_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  stage text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_reminder_sends_invoice_stage_key UNIQUE (invoice_id, stage)
);
CREATE INDEX IF NOT EXISTS invoice_reminder_sends_invoice_idx ON invoice_reminder_sends (invoice_id);

-- 0007: Feature gaps (reviews, promos, prefs, security, jobs, disputes, staff, rollups)
ALTER TABLE customer_profiles
  ADD COLUMN IF NOT EXISTS billing_address_line1 text,
  ADD COLUMN IF NOT EXISTS billing_address_line2 text,
  ADD COLUMN IF NOT EXISTS billing_city text,
  ADD COLUMN IF NOT EXISTS billing_country text,
  ADD COLUMN IF NOT EXISTS billing_postal_code text;

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  email_notifications boolean NOT NULL DEFAULT true,
  push_notifications boolean NOT NULL DEFAULT true,
  sms_notifications boolean NOT NULL DEFAULT false,
  marketing_emails boolean NOT NULL DEFAULT false,
  locale text NOT NULL DEFAULT 'en',
  theme text NOT NULL DEFAULT 'system',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_security (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  totp_secret text,
  totp_enabled boolean NOT NULL DEFAULT false,
  sms_phone text,
  sms_verified_at timestamptz,
  sms_code_hash text,
  sms_code_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rental_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_id uuid NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  dealer_id uuid NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_reviews_rental_unique UNIQUE (rental_id)
);

CREATE TABLE IF NOT EXISTS rental_extensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_id uuid NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
  months integer NOT NULL CHECK (months >= 1 AND months <= 12),
  previous_end_date date NOT NULL,
  new_end_date date NOT NULL,
  previous_term_months integer NOT NULL,
  new_term_months integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  discount_type text NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value numeric NOT NULL CHECK (discount_value > 0),
  min_term_months integer NOT NULL DEFAULT 1,
  max_uses integer,
  used_count integer NOT NULL DEFAULT 0,
  valid_from date,
  valid_until date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promo_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id uuid NOT NULL REFERENCES promo_codes(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rental_id uuid REFERENCES rentals(id) ON DELETE SET NULL,
  booking_request_id uuid REFERENCES booking_requests(id) ON DELETE SET NULL,
  discount_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  invoices integer NOT NULL DEFAULT 0,
  overdue integer NOT NULL DEFAULT 0,
  reminders integer NOT NULL DEFAULT 0,
  reconciled integer NOT NULL DEFAULT 0,
  holds_released integer NOT NULL DEFAULT 0,
  payouts integer NOT NULL DEFAULT 0,
  error text
);

CREATE TABLE IF NOT EXISTS payment_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  customer_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  dealer_id uuid REFERENCES dealers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open',
  reason text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  provider_reference text,
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS staff_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL,
  token_hash text NOT NULL,
  invited_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analytics_rollups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rollup_date date NOT NULL,
  metric_key text NOT NULL,
  metric_value numeric NOT NULL DEFAULT 0,
  dimensions jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analytics_rollups_unique UNIQUE (rollup_date, metric_key, dimensions)
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  entity_type text,
  entity_id uuid,
  properties jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_events_type_occurred_idx
  ON analytics_events (event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_entity_idx
  ON analytics_events (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS rental_reviews_dealer_idx ON rental_reviews(dealer_id);
CREATE INDEX IF NOT EXISTS rental_extensions_rental_idx ON rental_extensions(rental_id);
CREATE INDEX IF NOT EXISTS promo_redemptions_customer_idx ON promo_redemptions(customer_id);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'promo_redemptions_promo_customer_unique'
  ) THEN
    ALTER TABLE promo_redemptions
      ADD CONSTRAINT promo_redemptions_promo_customer_unique UNIQUE (promo_code_id, customer_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS job_runs_started_at_idx ON job_runs(started_at DESC);

-- ---------------------------------------------------------------------------
-- 0011: Transactional email outbox (retry + dead-letter)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'email_outbox_status') THEN
    CREATE TYPE email_outbox_status AS ENUM ('pending', 'sent', 'failed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "to" text NOT NULL,
  subject text NOT NULL,
  html text NOT NULL,
  status email_outbox_status NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_outbox_status_attempts_idx ON email_outbox (status, attempts);

-- ---------------------------------------------------------------------------
-- 0012: Per-account login lockout tracking
-- ---------------------------------------------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS failed_login_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;

CREATE INDEX IF NOT EXISTS payment_disputes_status_idx ON payment_disputes(status);
CREATE INDEX IF NOT EXISTS staff_invites_email_idx ON staff_invites(email);
CREATE INDEX IF NOT EXISTS analytics_rollups_date_idx ON analytics_rollups(rollup_date DESC);

-- ---------------------------------------------------------------------------
-- 0015: Runtime business knobs and feature flags
-- ---------------------------------------------------------------------------
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS platform_commission_rate numeric NOT NULL DEFAULT 0.1,
  ADD COLUMN IF NOT EXISTS billing_grace_days integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS payment_hold_ttl_minutes integer NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS cancel_notice_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS swap_eligible_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS signups_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS online_payments_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS new_bookings_enabled boolean NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- 0016: Deposit resolution on rental return
-- ---------------------------------------------------------------------------
ALTER TABLE rentals
  ADD COLUMN IF NOT EXISTS deposit_resolved_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_withheld_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_resolution_note text,
  ADD COLUMN IF NOT EXISTS deposit_resolved_at timestamptz;

-- ---------------------------------------------------------------------------
-- 0018: Customer maintenance requests
-- ---------------------------------------------------------------------------
ALTER TABLE maintenance_records
  ADD COLUMN IF NOT EXISTS photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'dealer';

-- ---------------------------------------------------------------------------
-- 0019: Business settings overrides (NULL = inherit from env)
-- ---------------------------------------------------------------------------
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS subscription_deposit_amount numeric;

ALTER TABLE app_settings
  ALTER COLUMN platform_commission_rate DROP NOT NULL,
  ALTER COLUMN platform_commission_rate DROP DEFAULT,
  ALTER COLUMN billing_grace_days DROP NOT NULL,
  ALTER COLUMN billing_grace_days DROP DEFAULT,
  ALTER COLUMN payment_hold_ttl_minutes DROP NOT NULL,
  ALTER COLUMN payment_hold_ttl_minutes DROP DEFAULT,
  ALTER COLUMN cancel_notice_days DROP NOT NULL,
  ALTER COLUMN cancel_notice_days DROP DEFAULT,
  ALTER COLUMN swap_eligible_days DROP NOT NULL,
  ALTER COLUMN swap_eligible_days DROP DEFAULT;

-- ---------------------------------------------------------------------------
-- 0020: Promo admin fields
-- ---------------------------------------------------------------------------
ALTER TABLE promo_codes
  ADD COLUMN IF NOT EXISTS per_customer_limit integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS first_invoice_only boolean NOT NULL DEFAULT true;

ALTER TABLE promo_redemptions DROP CONSTRAINT IF EXISTS promo_redemptions_promo_customer_unique;

-- ---------------------------------------------------------------------------
-- 0021: Dealer signup kill switch
-- ---------------------------------------------------------------------------
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS dealer_signups_enabled boolean NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- 0022: Admin broadcasts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  channels jsonb NOT NULL DEFAULT '{"inApp": true, "email": false}'::jsonb,
  sent_count integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS broadcasts_created_at_idx ON broadcasts(created_at DESC);

-- 0025: Subscription pause / hold
ALTER TYPE rental_status ADD VALUE IF NOT EXISTS 'paused';
ALTER TABLE rentals
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_until date,
  ADD COLUMN IF NOT EXISTS pause_reason text;
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS max_pause_days integer;

-- 0026: Dealer responses on rental reviews
ALTER TABLE rental_reviews
  ADD COLUMN IF NOT EXISTS dealer_response text,
  ADD COLUMN IF NOT EXISTS dealer_responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS dealer_responded_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
