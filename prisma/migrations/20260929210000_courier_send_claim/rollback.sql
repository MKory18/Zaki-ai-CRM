-- Undo the dispatch claim.
--
-- Losing the column loses which orders were mid-send when it was dropped,
-- so anything still in flight has to be checked with the courier by hand.
-- Nothing else reads it.
DROP INDEX IF EXISTS "orders_companyId_courier_send_started_at_idx";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "courier_send_started_at";
