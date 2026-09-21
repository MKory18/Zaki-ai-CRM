-- Rollback for 20260920061500_stage5_delivery_fees_returns.
-- Run manually: psql -v ON_ERROR_STOP=1 -f rollback.sql

BEGIN;

DROP TABLE IF EXISTS "return_receipts";
DROP TABLE IF EXISTS "delivery_fees";

ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_regionId_fkey";
DROP INDEX IF EXISTS "orders_regionId_idx";
DROP INDEX IF EXISTS "orders_companyId_labelPrintedAt_idx";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "regionId";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "deliveryFeeOverrideReason";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "labelPrintedAt";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260920061500_stage5_delivery_fees_returns';

COMMIT;
