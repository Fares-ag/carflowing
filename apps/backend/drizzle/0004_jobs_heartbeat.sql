ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS last_jobs_sweep_at timestamptz;
