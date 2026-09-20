-- Rollback for 20260920210000_settlement_fee_check.
-- Run manually: psql -v ON_ERROR_STOP=1 -f rollback.sql
--
-- Drops the fee comparison columns. Statement lines and matches survive; only
-- the courier's stated fee and its comparison are lost. Re-run matching after
-- re-applying to rebuild them.

BEGIN;

ALTER TABLE "settlement_matches" DROP COLUMN IF EXISTS "feeDifference";
ALTER TABLE "settlement_matches" DROP COLUMN IF EXISTS "statementFee";
ALTER TABLE "settlement_matches" DROP COLUMN IF EXISTS "expectedFee";
ALTER TABLE "statement_lines" DROP COLUMN IF EXISTS "fee";
ALTER TABLE "statement_lines" DROP COLUMN IF EXISTS "collected";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260920210000_settlement_fee_check';

COMMIT;
