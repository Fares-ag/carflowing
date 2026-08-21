ALTER TABLE rentals ADD COLUMN IF NOT EXISTS deposit_resolved_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS deposit_withheld_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS deposit_resolution_note text;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS deposit_resolved_at timestamptz;
