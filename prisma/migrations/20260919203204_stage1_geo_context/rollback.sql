-- Rollback for 20260919203204_stage1_geo_context.
-- Run manually: psql -v ON_ERROR_STOP=1 -f rollback.sql
-- Drops only what this migration added. No pre-existing table or column is touched.
-- Also removes the migration's history row so `prisma migrate deploy` can re-apply it.

BEGIN;

DELETE FROM "role_permissions" WHERE "permission" IN ('geo.view', 'geo.manage');

ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_countryId_fkey";
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_storeId_fkey";
DROP INDEX IF EXISTS "orders_storeId_createdAt_idx";
DROP INDEX IF EXISTS "orders_countryId_idx";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "countryId", DROP COLUMN IF EXISTS "storeId";

DROP TABLE IF EXISTS "user_store_access";
DROP TABLE IF EXISTS "user_country_access";
DROP TABLE IF EXISTS "stores";
DROP TABLE IF EXISTS "regions";
DROP TABLE IF EXISTS "countries";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260919203204_stage1_geo_context';

COMMIT;
