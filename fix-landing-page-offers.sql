-- fix-landing-page-offers.sql
-- يحفظ البيانات: ينقل عروض صفحات الهبوط إلى عروض المنتجات (offers)
-- ثم يعيد ربط الطلبات ويحذف الجدول القديم.
-- شغّله مرة واحدة على قاعدة بيانات Coolify ثم أعد النشر.

BEGIN;

-- 1) نقل العروض إلى جدول offers (نحتفظ بنفس الـ id لسهولة إعادة ربط الطلبات)
INSERT INTO "offers" (
  "id", "companyId", "productId", "name", "quantity", "freeQuantity",
  "sellingPrice", "isDefault", "sortOrder", "status", "createdAt", "updatedAt"
)
SELECT
  lpo."id",
  lp."companyId",
  lp."productId",
  lpo."name",
  lpo."quantity",
  lpo."freeQuantity",
  lpo."price",
  lpo."isDefault",
  lpo."sortOrder",
  CASE WHEN lpo."isActive" THEN 'ACTIVE' ELSE 'INACTIVE' END,
  lpo."createdAt",
  lpo."updatedAt"
FROM "landing_page_offers" lpo
JOIN "landing_pages" lp ON lp."id" = lpo."landingPageId"
WHERE lp."productId" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

-- صفحات بلا منتج مرتبط: نتركها (لن تُحذف لأن الطلبات ستُفكّ ارتباطها)
-- 2) إعادة ربط الطلبات: أي طلب كان يشير إلى عرض صفحة هبوط يشير الآن إلى العرض المنقول
UPDATE "orders" o
SET "offerId" = o."landingPageOfferId"
WHERE o."landingPageOfferId" IS NOT NULL
  AND o."offerId" IS NULL
  AND EXISTS (SELECT 1 FROM "offers" f WHERE f."id" = o."landingPageOfferId");

-- 3) فك ارتباط الطلبات المتبقية (صفحات بلا منتج) حتى يمر الترحيل
UPDATE "orders"
SET "landingPageOfferId" = NULL
WHERE "landingPageOfferId" IS NOT NULL;

-- 4) الآن يمكن الحذف بأمان
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_landingPageOfferId_fkey";
DROP INDEX IF EXISTS "orders_companyId_landingPageOfferId_idx";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "landingPageOfferId";
DROP TABLE IF EXISTS "landing_page_offers";

COMMIT;

-- 5) علّم الترحيل كمطبق حتى لا يعيد Coolify محاولته:
--    شغّل داخل حاوية التطبيق في Coolify:
--    npx prisma migrate resolve --applied 20260922000000_drop_landing_page_offers