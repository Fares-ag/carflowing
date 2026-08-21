-- Subscription pause / hold (travel hold for expat customers)
ALTER TYPE rental_status ADD VALUE IF NOT EXISTS 'paused';

ALTER TABLE rentals
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_until date,
  ADD COLUMN IF NOT EXISTS pause_reason text;

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS max_pause_days integer;
