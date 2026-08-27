-- Referral program: codes, attributions, and store-credit ledger (applied to invoices, not cash).
CREATE TABLE IF NOT EXISTS referral_codes (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  referral_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  first_paid_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  credited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referrals_referrer_user_id_idx ON referrals (referrer_user_id);

CREATE TABLE IF NOT EXISTS customer_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  remaining_amount numeric NOT NULL,
  source text NOT NULL,
  referral_id uuid REFERENCES referrals(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_credits_user_remaining_idx ON customer_credits (user_id)
  WHERE remaining_amount > 0;

-- One credit grant per referral beneficiary role (referrer / referred).
CREATE UNIQUE INDEX IF NOT EXISTS customer_credits_referral_grant_uidx
  ON customer_credits (referral_id, user_id, source)
  WHERE referral_id IS NOT NULL;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS credit_applied numeric NOT NULL DEFAULT 0;
