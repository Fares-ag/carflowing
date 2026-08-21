-- Runtime business knobs and feature flags (env vars remain as fallback in app code).
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS platform_commission_rate numeric NOT NULL DEFAULT 0.1,
  ADD COLUMN IF NOT EXISTS billing_grace_days integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS payment_hold_ttl_minutes integer NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS cancel_notice_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS swap_eligible_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS signups_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS online_payments_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS new_bookings_enabled boolean NOT NULL DEFAULT true;
