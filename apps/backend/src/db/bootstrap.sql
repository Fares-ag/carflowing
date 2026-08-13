-- CarFlow bootstrap schema (Postgres / Neon)

DO $$ BEGIN CREATE TYPE user_role AS ENUM ('admin', 'dealer', 'customer'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE user_status AS ENUM ('active', 'suspended', 'pending'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE customer_status AS ENUM ('active', 'suspended', 'verified', 'unverified'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE vehicle_status AS ENUM ('available', 'rented', 'maintenance', 'inactive'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE vehicle_category AS ENUM ('sedan', 'suv', 'truck', 'luxury', 'ev', 'other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE transmission_type AS ENUM ('automatic', 'manual'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE fuel_type AS ENUM ('gas', 'diesel', 'electric', 'hybrid'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE rental_status AS ENUM ('reserved', 'active', 'completed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
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
DO $$ BEGIN CREATE TYPE invoice_status AS ENUM ('paid', 'due', 'overdue', 'refunded'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
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
  tax_id text,
  business_hours jsonb NOT NULL DEFAULT '[]',
  logo_url text,
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

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS license_plate text;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS pickup_location text;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS pickup_date date;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS pickup_time text;
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
  default_tax_rate numeric NOT NULL DEFAULT 0.05,
  updated_at timestamptz NOT NULL DEFAULT now()
);
