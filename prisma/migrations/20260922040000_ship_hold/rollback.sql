-- Undo the shipping hold. Additive columns; dropping them returns the
-- schema exactly to where it was. Any hold in force is simply forgotten —
-- the orders go back to being ordinary candidates.
DROP INDEX IF EXISTS "orders_shipHoldUntil_idx";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "shipHoldReason";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "shipHoldUntil";
