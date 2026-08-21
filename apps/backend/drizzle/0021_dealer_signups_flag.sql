ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS dealer_signups_enabled boolean NOT NULL DEFAULT true;
