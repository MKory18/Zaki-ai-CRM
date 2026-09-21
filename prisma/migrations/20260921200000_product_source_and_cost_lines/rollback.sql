-- Rollback: drop the cost lines and the product's source flag.
-- The four legacy cost columns were never touched, so every existing
-- batch keeps its costs and its unit cost unchanged.
DROP TABLE IF EXISTS "production_batch_costs";
ALTER TABLE "products" DROP COLUMN IF EXISTS "sourceType";
