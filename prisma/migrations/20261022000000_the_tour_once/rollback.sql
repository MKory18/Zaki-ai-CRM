-- ROLLBACK of 20261022000000_the_tour_once.
--
-- The column was added nullable with no default and nothing reads it yet
-- once this branch's code is gone, so dropping it loses nothing but the
-- memory of who saw the tour — and re-running the forward migration gives
-- everybody the tour again, which is the correct meaning of "rollback"
-- for a one-time walkthrough.

ALTER TABLE "users" DROP COLUMN IF EXISTS "tour_done_at";
