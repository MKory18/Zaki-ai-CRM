-- Rollback for 20260920034000_stage4_change_requests_issues.
-- Run manually: psql -v ON_ERROR_STOP=1 -f rollback.sql

BEGIN;

DROP TABLE IF EXISTS "order_issues";
DROP TABLE IF EXISTS "order_change_requests";

ALTER TABLE "orders" DROP COLUMN IF EXISTS "postponeCount";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "postponePreferredTime";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260920034000_stage4_change_requests_issues';

COMMIT;
