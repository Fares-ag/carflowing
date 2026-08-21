CREATE TABLE IF NOT EXISTS broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  channels jsonb NOT NULL DEFAULT '{"inApp": true, "email": false}'::jsonb,
  sent_count integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS broadcasts_created_at_idx ON broadcasts(created_at DESC);
