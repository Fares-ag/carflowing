-- Immutable record of a customer accepting a versioned legal document
-- (signup terms/privacy, checkout rental agreement). One row per acceptance:
-- re-accepting a newer version appends, it never updates in place.
CREATE TABLE IF NOT EXISTS consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  document_kind text NOT NULL,
  document_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text
);

CREATE INDEX IF NOT EXISTS consent_records_profile_kind_idx
  ON consent_records (profile_id, document_kind);
