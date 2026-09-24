-- Undo 20260924200000_change_request_applied.
-- Loses the record of which approved requests were carried out, and by
-- whom. The order edits themselves remain, and stay in the audit log.
DROP INDEX IF EXISTS "order_change_requests_status_applied_idx";
ALTER TABLE "order_change_requests" DROP COLUMN IF EXISTS "appliedById";
ALTER TABLE "order_change_requests" DROP COLUMN IF EXISTS "appliedAt";
