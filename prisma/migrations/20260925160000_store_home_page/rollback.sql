-- Undo 20260925160000_store_home_page. Shops go back to the product list as
-- their home page; nothing else reads these columns.
ALTER TABLE "stores" DROP COLUMN IF EXISTS "homeDraft";
ALTER TABLE "stores" DROP COLUMN IF EXISTS "homeLive";
ALTER TABLE "stores" DROP COLUMN IF EXISTS "homePublishedAt";
