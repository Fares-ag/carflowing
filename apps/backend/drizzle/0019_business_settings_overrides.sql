-- Business knobs: NULL in DB means "inherit from env"; admin PATCH stores explicit overrides.
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

-- Existing rows used schema defaults; clear so env vars remain authoritative until admin override.
UPDATE app_settings SET
  platform_commission_rate = NULL,
  billing_grace_days = NULL,
  payment_hold_ttl_minutes = NULL,
  cancel_notice_days = NULL,
  swap_eligible_days = NULL,
  subscription_deposit_amount = NULL;
