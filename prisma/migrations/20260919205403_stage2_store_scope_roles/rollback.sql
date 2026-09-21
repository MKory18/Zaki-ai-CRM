-- Rollback for 20260919205403_stage2_store_scope_roles.
-- Run manually: psql -v ON_ERROR_STOP=1 -f rollback.sql
-- Removes only what this migration added, plus its history row.

BEGIN;

DELETE FROM "role_permissions" WHERE "permission" IN (
  'confirmation.pull', 'confirmation.work', 'confirmation.supervise', 'confirmation.issues',
  'ops.prepare', 'ops.ship', 'ops.labels', 'ops.track', 'ops.returns',
  'control.change_requests', 'control.discount_alerts', 'control.blacklist',
  'growth.intelligence', 'apps.view', 'apps.manage'
);
DELETE FROM "role_permissions" rp USING "roles" r
WHERE rp."roleId" = r.id AND r."companyId" IS NULL
  AND ((r.name IN ('ACCOUNTANT', 'SETTLEMENT_OFFICER') AND rp.permission = 'audit.view')
    OR r.name IN ('WAREHOUSE', 'CONFIRMATION_SUPERVISOR'));
-- Users moved onto the new roles fall back to their legacy role string.
UPDATE "users" SET "roleId" = NULL
WHERE "roleId" IN (SELECT id FROM "roles" WHERE "companyId" IS NULL AND name IN ('WAREHOUSE', 'CONFIRMATION_SUPERVISOR'));
DELETE FROM "roles" WHERE "companyId" IS NULL AND name IN ('WAREHOUSE', 'CONFIRMATION_SUPERVISOR');

ALTER TABLE "landing_pages" DROP CONSTRAINT IF EXISTS "landing_pages_storeId_fkey";
ALTER TABLE "shipping_batches" DROP CONSTRAINT IF EXISTS "shipping_batches_storeId_fkey";
ALTER TABLE "telegram_sources" DROP CONSTRAINT IF EXISTS "telegram_sources_storeId_fkey";
DROP INDEX IF EXISTS "landing_pages_storeId_idx";
DROP INDEX IF EXISTS "shipping_batches_storeId_status_idx";
ALTER TABLE "landing_pages" DROP COLUMN IF EXISTS "storeId";
ALTER TABLE "shipping_batches" DROP COLUMN IF EXISTS "storeId";
ALTER TABLE "telegram_sources" DROP COLUMN IF EXISTS "storeId";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260919205403_stage2_store_scope_roles';

COMMIT;
