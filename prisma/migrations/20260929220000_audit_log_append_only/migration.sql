-- THE AUDIT TRAIL IS APPEND-ONLY, ENFORCED WHERE IT CANNOT BE ARGUED WITH.
--
-- Nothing in the application updates or deletes an audit row — but «nothing
-- in the application» is not the threat. The threat is a valid session, a
-- database console and an hour on somebody's last day, and against that a
-- rule written in TypeScript is a comment. The record of who did what has
-- to outlive the person who wishes it did not.
--
-- A trigger, not a REVOKE, because this deployment connects as the owner of
-- its own schema: a grant it can hand back to itself protects nothing. The
-- stronger form is a second database role for the application with no
-- UPDATE or DELETE on this table, and it belongs to the deployment rather
-- than to a migration.
--
-- Removing the trigger is still possible for whoever holds the owner role,
-- and that is the point: it can no longer happen by accident, by an ORM
-- call, or by a cascade nobody meant to write, and taking it off is an act
-- somebody has to perform deliberately and can be asked about.
CREATE OR REPLACE FUNCTION audit_logs_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'audit_logs is append-only: % is not allowed on this table', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_no_update ON "audit_logs";
CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();

DROP TRIGGER IF EXISTS audit_logs_no_delete ON "audit_logs";
CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();
