-- There is no honest reverse of 20260927000000_adopt_orphan_employees.
--
-- Setting those accounts back to `companyId = NULL` would restore the defect —
-- employees invisible to every company-scoped screen — and there is no record
-- of which rows the UPDATE touched, because before it they were
-- indistinguishable from any other company-less row.
--
-- If a row was adopted in error, move that ONE account by hand:
--   UPDATE "users" SET "companyId" = NULL WHERE email = '...';
SELECT 'no automatic rollback: see the comment in this file' AS note;
