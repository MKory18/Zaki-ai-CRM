-- Undo 20260925020000_store_favicon. Stores fall back to their logo (or no
-- icon) in the browser tab.
ALTER TABLE "stores" DROP COLUMN IF EXISTS "favicon";
