-- Rollback for 20260920190000_courier_agents_transfer.
-- Run manually: psql -v ON_ERROR_STOP=1 -f rollback.sql
--
-- Dropping replacesOrderId loses the link between a withdrawn order and the
-- replacement raised for it. Both orders survive; only the pairing is lost.

BEGIN;

ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_replacesOrderId_fkey";
DROP INDEX IF EXISTS "orders_replacesOrderId_key";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "replacesOrderId";
ALTER TABLE "delivery_providers" DROP COLUMN IF EXISTS "kind";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260920190000_courier_agents_transfer';

COMMIT;
