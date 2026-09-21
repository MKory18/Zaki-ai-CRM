-- Rollback for 20260920021500_stage3_order_lines_notes.
-- Run manually: psql -v ON_ERROR_STOP=1 -f rollback.sql
-- Order lines and notes are dropped with their tables; nothing else is touched.

BEGIN;

DROP TABLE IF EXISTS "order_notes";
DROP TABLE IF EXISTS "order_items";

DROP INDEX IF EXISTS "orders_companyId_merchantRef_key";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "merchantRef";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "priceIncludesDelivery";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260920021500_stage3_order_lines_notes';

COMMIT;
