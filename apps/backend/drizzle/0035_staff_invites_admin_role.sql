-- 0007 created staff_invites with CHECK (role IN ('finance','ops','support')), but the
-- API accepts every ADMIN_PORTAL_ROLE — including 'admin'. bootstrap.sql never had the
-- constraint, so tests passed while production rejected admin invites with a 500.
-- Widening the allowed set: every existing row already satisfies it.
ALTER TABLE staff_invites DROP CONSTRAINT IF EXISTS staff_invites_role_check;
ALTER TABLE staff_invites
  ADD CONSTRAINT staff_invites_role_check CHECK (role IN ('admin', 'finance', 'ops', 'support'));
