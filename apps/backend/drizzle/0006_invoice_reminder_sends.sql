CREATE TABLE IF NOT EXISTS invoice_reminder_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  stage text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_reminder_sends_invoice_stage_key UNIQUE (invoice_id, stage)
);

CREATE INDEX IF NOT EXISTS invoice_reminder_sends_invoice_idx ON invoice_reminder_sends (invoice_id);
