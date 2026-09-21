-- Rollback for 20260921000000_customer_blocks.
-- Run manually: psql -v ON_ERROR_STOP=1 -f rollback.sql
--
-- Drops the blacklist. Every block and its history is lost, and blocked
-- customers can order again immediately — export the table first if the
-- list is being rebuilt elsewhere.

BEGIN;

DROP TABLE IF EXISTS "customer_blocks";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260921000000_customer_blocks';

COMMIT;
