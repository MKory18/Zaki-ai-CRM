-- Rollback: drop the four merged columns. `offers` returns to what it was;
-- `landing_page_offers` was never touched, so it is already intact.
DROP INDEX IF EXISTS "offers_productId_status_sortOrder_idx";
ALTER TABLE "offers" DROP COLUMN IF EXISTS "sortOrder";
ALTER TABLE "offers" DROP COLUMN IF EXISTS "isDefault";
ALTER TABLE "offers" DROP COLUMN IF EXISTS "compareAtPrice";
ALTER TABLE "offers" DROP COLUMN IF EXISTS "freeQuantity";
