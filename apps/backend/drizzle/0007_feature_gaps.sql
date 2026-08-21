-- Feature gaps: reviews, promos, prefs, security, jobs, disputes, staff invites, rollups

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
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'won', 'lost', 'closed')),
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
  role text NOT NULL CHECK (role IN ('finance', 'ops', 'support')),
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

CREATE INDEX IF NOT EXISTS rental_reviews_dealer_idx ON rental_reviews(dealer_id);
CREATE INDEX IF NOT EXISTS rental_extensions_rental_idx ON rental_extensions(rental_id);
CREATE INDEX IF NOT EXISTS promo_redemptions_customer_idx ON promo_redemptions(customer_id);
CREATE INDEX IF NOT EXISTS job_runs_started_at_idx ON job_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS payment_disputes_status_idx ON payment_disputes(status);
CREATE INDEX IF NOT EXISTS staff_invites_email_idx ON staff_invites(email);
CREATE INDEX IF NOT EXISTS analytics_rollups_date_idx ON analytics_rollups(rollup_date DESC);
