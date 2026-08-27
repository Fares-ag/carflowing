-- Complaint reply thread. Present in bootstrap.sql since the feature shipped but
-- never added to the migration chain, so migration-provisioned databases (production)
-- were missing the table entirely and GET /customer/complaints failed with
-- 'relation "complaint_replies" does not exist'.
CREATE TABLE IF NOT EXISTS complaint_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS complaint_replies_complaint_idx ON complaint_replies (complaint_id);
