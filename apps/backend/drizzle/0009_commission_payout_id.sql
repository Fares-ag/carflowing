ALTER TABLE commission_ledger ADD COLUMN IF NOT EXISTS payout_id uuid REFERENCES payouts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS commission_ledger_payout_idx ON commission_ledger(payout_id);
