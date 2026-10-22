-- THE TOUR THAT RUNS ONCE, AND ONLY ONCE — ROLLBACK
--
-- Reverses exactly what migration 20261022000000_the_tour_once added:
-- drops the nullable tour_done_at column on users. Nothing else was added,
-- so nothing else is removed. No data was rewritten on the way in.

ALTER TABLE "users" DROP COLUMN "tour_done_at";
