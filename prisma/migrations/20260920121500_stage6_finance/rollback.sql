-- Rollback for 20260920121500_stage6_finance.
-- Run manually: psql -v ON_ERROR_STOP=1 -f rollback.sql
-- Drops only the Stage 6 tables; no pre-existing table or column is touched.

BEGIN;

DROP TABLE IF EXISTS "commission_periods";
DROP TABLE IF EXISTS "commission_entries";
DROP TABLE IF EXISTS "commission_rules";
DROP TABLE IF EXISTS "settlement_matches";
DROP TABLE IF EXISTS "statement_receipts";
DROP TABLE IF EXISTS "statement_lines";
DROP TABLE IF EXISTS "courier_statements";
DROP TABLE IF EXISTS "daily_closings";
DROP TABLE IF EXISTS "wallet_transfers";
DROP TABLE IF EXISTS "wallet_movements";
DROP TABLE IF EXISTS "wallets";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260920121500_stage6_finance';

COMMIT;
