-- Product analytics lifecycle events (distinct from audit_logs)
CREATE TABLE IF NOT EXISTS analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  entity_type text,
  entity_id uuid,
  properties jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_events_type_occurred_idx
  ON analytics_events (event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_entity_idx
  ON analytics_events (entity_type, entity_id);
