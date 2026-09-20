-- Rollback for 20260921060000_prune_dead_permissions.
-- Run manually: psql -v ON_ERROR_STOP=1 -f rollback.sql
--
-- These grants cannot be restored: which role held which dead permission is
-- not recorded anywhere else, and re-inventing it would be a guess. Nothing
-- is lost operationally — every removed key was enforced by nothing — but
-- the rows themselves are gone for good.
--
-- This file exists to say that plainly rather than to pretend otherwise.

BEGIN;

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260921060000_prune_dead_permissions';

COMMIT;
