-- Dealer SaaS billing: catalogue of dealer plans, the dealer's current
-- subscription to one of them, and the invoices that subscription generates.
-- Persistence only — routes and the billing job live elsewhere.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dealer_subscription_status') THEN
    CREATE TYPE dealer_subscription_status AS ENUM ('active', 'past_due', 'cancelled');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dealer_invoice_status') THEN
    CREATE TYPE dealer_invoice_status AS ENUM ('open', 'paid', 'past_due', 'void');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS dealer_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  price_qar numeric NOT NULL DEFAULT 0,
  -- NULL means unlimited listings.
  vehicle_limit integer,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dealer_plans_price_qar_nonneg CHECK (price_qar >= 0)
);

CREATE TABLE IF NOT EXISTS dealer_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES dealers(id) ON DELETE RESTRICT,
  plan_id uuid NOT NULL REFERENCES dealer_plans(id) ON DELETE RESTRICT,
  status dealer_subscription_status NOT NULL DEFAULT 'active',
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL,
  cancel_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- A dealer may only carry one billable subscription at a time.
CREATE UNIQUE INDEX IF NOT EXISTS dealer_subscriptions_dealer_open_uidx
  ON dealer_subscriptions (dealer_id)
  WHERE status <> 'cancelled';

CREATE TABLE IF NOT EXISTS dealer_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES dealers(id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL REFERENCES dealer_subscriptions(id) ON DELETE RESTRICT,
  amount numeric NOT NULL DEFAULT 0,
  status dealer_invoice_status NOT NULL DEFAULT 'open',
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  due_date timestamptz NOT NULL,
  paid_at timestamptz,
  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dealer_invoices_amount_nonneg CHECK (amount >= 0)
);

-- One invoice per subscription period; makes the billing job idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS dealer_invoices_subscription_period_uidx
  ON dealer_invoices (subscription_id, period_start);

CREATE INDEX IF NOT EXISTS dealer_invoices_dealer_status_idx
  ON dealer_invoices (dealer_id, status);
