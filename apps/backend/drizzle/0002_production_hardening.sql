-- Phase 0–3 production remediation: FK hardening, tax/deposits, maintenance, payouts, money checks

-- 0.3: pending booking history must not vanish when a vehicle is removed
ALTER TABLE booking_requests DROP CONSTRAINT IF EXISTS booking_requests_vehicle_id_fkey;
ALTER TABLE booking_requests
  ADD CONSTRAINT booking_requests_vehicle_id_fkey
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT;

-- 1.3: tax breakdown on invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subtotal numeric NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_rate numeric NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_amount numeric NOT NULL DEFAULT 0;

-- 2.2: refundable deposit on subscription rentals / first invoice
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS deposit_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS deposit_refundable boolean NOT NULL DEFAULT true;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deposit_amount numeric NOT NULL DEFAULT 0;

-- 2.1: maintenance records for fleet ops
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

CREATE INDEX IF NOT EXISTS maintenance_records_vehicle_idx ON maintenance_records(vehicle_id);
CREATE INDEX IF NOT EXISTS maintenance_records_dealer_idx ON maintenance_records(dealer_id);

-- 3.1: dealer payouts + platform commission ledger
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

CREATE INDEX IF NOT EXISTS commission_ledger_dealer_idx ON commission_ledger(dealer_id);
CREATE INDEX IF NOT EXISTS payouts_dealer_idx ON payouts(dealer_id);

-- 3.2: split ops roles (finance / ops / support retain admin portal access)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'finance';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'ops';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'support';

-- 2.4: money discipline — non-negative amounts and valid rental windows
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

-- Dashboard query indexes
CREATE INDEX IF NOT EXISTS payments_created_at_idx ON payments(created_at);
CREATE INDEX IF NOT EXISTS rentals_created_at_idx ON rentals(created_at);
CREATE INDEX IF NOT EXISTS rentals_dealer_status_idx ON rentals(dealer_id, status);
CREATE INDEX IF NOT EXISTS vehicles_dealer_status_idx ON vehicles(dealer_id, status);
