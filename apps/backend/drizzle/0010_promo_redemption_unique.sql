-- One redemption per customer per promo code.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'promo_redemptions_promo_customer_unique'
  ) THEN
    ALTER TABLE promo_redemptions
      ADD CONSTRAINT promo_redemptions_promo_customer_unique UNIQUE (promo_code_id, customer_id);
  END IF;
END $$;
