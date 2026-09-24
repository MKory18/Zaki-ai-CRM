-- Undo 20260925010000_landing_page_views. The windowed views, device and
-- campaign breakdowns lose their data, and lifetime viewsCount is untouched.
ALTER TABLE "orders" DROP COLUMN IF EXISTS "deviceClass";
DROP TABLE IF EXISTS "landing_page_views";
