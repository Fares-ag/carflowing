-- Retention sweeps: give the "delete rows older than N" purge job an index to
-- range-scan instead of sequential-scanning these unbounded tables.
-- Short-lived credentials are swept by expiry; log/outbox tables by created_at.
CREATE INDEX IF NOT EXISTS refresh_sessions_expires_at_idx ON refresh_sessions (expires_at);
CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_at_idx ON password_reset_tokens (expires_at);
CREATE INDEX IF NOT EXISTS email_verification_tokens_expires_at_idx ON email_verification_tokens (expires_at);
CREATE INDEX IF NOT EXISTS two_fa_challenges_expires_at_idx ON two_fa_challenges (expires_at);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at);
CREATE INDEX IF NOT EXISTS analytics_events_created_at_idx ON analytics_events (created_at);
CREATE INDEX IF NOT EXISTS email_outbox_created_at_idx ON email_outbox (created_at);
