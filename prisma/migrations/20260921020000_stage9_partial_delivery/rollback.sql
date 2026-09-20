-- Rollback for 20260921020000_stage9_partial_delivery.
-- Run manually: psql -v ON_ERROR_STOP=1 -f rollback.sql
--
-- WARNING: any order settled as PARTIALLY_DELIVERED loses the record of what
-- was actually collected and which lines came back. The orders survive but
-- read as if wholly delivered, which will overstate what the courier owes.
-- Check for partials before running:
--   SELECT count(*) FROM orders WHERE "collectedAmount" IS NOT NULL;

BEGIN;

ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_parentOrderId_fkey";
DROP INDEX IF EXISTS "orders_parentOrderId_idx";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "parentOrderId";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "collectedAmount";
ALTER TABLE "order_items" DROP COLUMN IF EXISTS "returnedQty";
ALTER TABLE "order_items" DROP COLUMN IF EXISTS "deliveredQty";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260921020000_stage9_partial_delivery';

COMMIT;
