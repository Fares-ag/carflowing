-- Customer maintenance requests: photos, scheduling, source tracking
ALTER TABLE maintenance_records
  ADD COLUMN IF NOT EXISTS photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'dealer';
