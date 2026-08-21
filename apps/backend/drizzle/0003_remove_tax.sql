-- Qatar: no sales tax on subscriptions; remove dealer tax_id and zero default rate
ALTER TABLE app_settings ALTER COLUMN default_tax_rate SET DEFAULT 0;
UPDATE app_settings SET default_tax_rate = 0 WHERE default_tax_rate <> 0;
ALTER TABLE dealers DROP COLUMN IF EXISTS tax_id;
