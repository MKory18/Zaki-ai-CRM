-- Reverses 20260926050000_stock_opening_count.
--
-- It drops the COUNTS and the link, never the batches: the units and their
-- costs live in `production_batches` and are untouched, so stock on hand is
-- the same before and after. What is lost is the record of who counted, which
-- cannot be recovered — export the table first if a count has been taken.
ALTER TABLE "production_batches" DROP CONSTRAINT IF EXISTS "production_batches_openingCountId_fkey";
ALTER TABLE "production_batches" DROP COLUMN IF EXISTS "openingCountId";
DROP TABLE IF EXISTS "stock_opening_counts";
