-- Append-only audit log: strip mutation privileges from runtime role(s).
-- Role name comes from session setting carflow.app_role (set by db/migrate.ts),
-- falling back to the conventional local dev role "carflow".
REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;

DO $$
DECLARE
  app_role name := coalesce(nullif(current_setting('carflow.app_role', true), ''), 'carflow');
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    EXECUTE format('REVOKE UPDATE, DELETE ON TABLE audit_logs FROM %I', app_role);
    EXECUTE format('GRANT INSERT, SELECT ON TABLE audit_logs TO %I', app_role);
  END IF;
END $$;
