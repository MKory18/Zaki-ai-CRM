-- Rollback for 20260920230000_stage7_job_runs.
-- Run manually: psql -v ON_ERROR_STOP=1 -f rollback.sql
--
-- Drops the scheduler's run history. No operational data lives here — only
-- the record of when each job ran — so nothing else is affected.

BEGIN;

DROP TABLE IF EXISTS "job_runs";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260920230000_stage7_job_runs';

COMMIT;
