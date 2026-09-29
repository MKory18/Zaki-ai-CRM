-- Undo the append-only guard on the audit trail.
--
-- After this the record of who did what can be edited and deleted again by
-- anything holding a connection. There is no data to restore and none is
-- lost; what goes away is the assurance.
DROP TRIGGER IF EXISTS audit_logs_no_delete ON "audit_logs";
DROP TRIGGER IF EXISTS audit_logs_no_update ON "audit_logs";
DROP FUNCTION IF EXISTS audit_logs_append_only();
