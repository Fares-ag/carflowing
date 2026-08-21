-- Promo admin fields: per-customer limit, first-invoice-only scope
ALTER TABLE promo_codes
  ADD COLUMN IF NOT EXISTS per_customer_limit integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS first_invoice_only boolean NOT NULL DEFAULT true;

-- Allow multiple redemptions per customer when per_customer_limit > 1 (count enforced in app code).
ALTER TABLE promo_redemptions DROP CONSTRAINT IF EXISTS promo_redemptions_promo_customer_unique;
