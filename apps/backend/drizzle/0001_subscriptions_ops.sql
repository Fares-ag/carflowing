-- 0001: Subscription model (invygo/FINN-style monthly billing), rental
-- lifecycle events, swaps, audit log, and integrity hardening.
--
-- This migration is fully idempotent. It also (re)creates objects that were
-- missing from 0000_initial.sql but present in bootstrap.sql (schema drift
-- fix): refresh_sessions, email_verification_tokens, payments.needs_refund.

-- ---------------------------------------------------------------------------
-- Drift fix: objects bootstrap.sql had but 0000_initial.sql lacked
-- ---------------------------------------------------------------------------
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

ALTER TABLE payments ADD COLUMN IF NOT EXISTS needs_refund boolean NOT NULL DEFAULT false;

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

-- ---------------------------------------------------------------------------
-- Re-audit hardening: at most ONE in-flight (pending) payment per booking
-- request and per invoice — closes the two-live-payUrls double-charge races.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS payments_pending_booking_idx
  ON payments (booking_request_id)
  WHERE status = 'pending' AND booking_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_pending_invoice_idx
  ON payments (invoice_id)
  WHERE status = 'pending' AND invoice_id IS NOT NULL;
