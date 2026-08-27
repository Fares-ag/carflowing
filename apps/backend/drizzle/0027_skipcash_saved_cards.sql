-- SkipCash saved-card token storage (provider token only — never PAN).
ALTER TABLE payment_methods
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'reference',
  ADD COLUMN IF NOT EXISTS provider_token_id text,
  ADD COLUMN IF NOT EXISTS token_saved_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS payment_methods_user_provider_token_uidx
  ON payment_methods (user_id, provider, provider_token_id)
  WHERE provider_token_id IS NOT NULL;
