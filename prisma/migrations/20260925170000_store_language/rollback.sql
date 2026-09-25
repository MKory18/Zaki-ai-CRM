-- Undo 20260925170000_store_language. Public pages go back to Arabic and
-- right-to-left for every shop, as they were.
ALTER TABLE "stores" DROP COLUMN IF EXISTS "language";
