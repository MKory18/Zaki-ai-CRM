-- Undo 20260925000000_store_front_page. Single Product stores lose the page
-- they were showing and fall back to their one product's page.
ALTER TABLE "stores" DROP CONSTRAINT IF EXISTS "stores_landingPageId_fkey";
DROP INDEX IF EXISTS "stores_landingPageId_key";
ALTER TABLE "stores" DROP COLUMN IF EXISTS "landingPageId";
