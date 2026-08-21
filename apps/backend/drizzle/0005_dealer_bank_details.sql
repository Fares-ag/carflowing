ALTER TABLE dealers ADD COLUMN IF NOT EXISTS bank_account_name text;
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS bank_iban text;
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS bank_details_verified_at timestamptz;
