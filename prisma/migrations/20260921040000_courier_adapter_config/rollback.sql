-- Rollback for 20260921040000_courier_adapter_config.
-- Run manually: psql -v ON_ERROR_STOP=1 -f rollback.sql
--
-- Couriers lose which integration they run on and their account ids, so
-- every one of them falls back to manual handling. No shipment data is
-- affected; re-applying and re-entering the ids restores it.

BEGIN;

ALTER TABLE "delivery_providers" DROP COLUMN IF EXISTS "apiConfig";
ALTER TABLE "delivery_providers" DROP COLUMN IF EXISTS "adapterCode";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260921040000_courier_adapter_config';

COMMIT;
