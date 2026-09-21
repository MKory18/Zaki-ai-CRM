-- Where orders come from, as the shop defines them.
--
-- `orders.source` was free text: the same channel arrived spelled three
-- ways, the filter offered a list written into a screen while the orders in
-- front of it carried "الشيت" and "اسرار الجمال", and nothing could be
-- counted per channel. A channel becomes a row — named once, picked from a
-- list, and reportable per platform through `kind`.
--
-- Additive. `orders.source` keeps every word it was given, so an order never
-- loses where it said it came from when a channel is renamed or retired.

CREATE TABLE IF NOT EXISTS "order_channels" (
  "id"        TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "kind"      TEXT NOT NULL DEFAULT 'OTHER',
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_channels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "order_channels_companyId_name_key"
  ON "order_channels" ("companyId", "name");
CREATE INDEX IF NOT EXISTS "order_channels_companyId_isActive_idx"
  ON "order_channels" ("companyId", "isActive");

ALTER TABLE "order_channels"
  ADD CONSTRAINT "order_channels_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "channelId" TEXT;

CREATE INDEX IF NOT EXISTS "orders_channelId_idx" ON "orders" ("channelId");

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_channelId_fkey"
  FOREIGN KEY ("channelId") REFERENCES "order_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed each company's channels from what its orders already say, so the list
-- starts as the truth rather than empty. The platform is guessed from the
-- name where it is obvious and left OTHER where it is not — a guess that is
-- visible and editable beats a column nobody filled in.
INSERT INTO "order_channels" ("id", "companyId", "name", "kind", "sortOrder")
SELECT
  gen_random_uuid(),
  o."companyId",
  o."source",
  CASE
    WHEN o."source" ILIKE '%tiktok%' OR o."source" LIKE '%تيكتوك%' THEN 'TIKTOK'
    WHEN o."source" ILIKE '%facebook%' OR o."source" ILIKE '%messenger%' OR o."source" LIKE '%فيس%' THEN 'FACEBOOK'
    WHEN o."source" ILIKE '%instagram%' OR o."source" LIKE '%انستا%' THEN 'INSTAGRAM'
    WHEN o."source" ILIKE '%whatsapp%' OR o."source" LIKE '%واتس%' THEN 'WHATSAPP'
    WHEN o."source" ILIKE '%telegram%' OR o."source" LIKE '%تلجرام%' OR o."source" LIKE '%تليجرام%' THEN 'TELEGRAM'
    WHEN o."source" ILIKE '%landing%' OR o."source" LIKE '%هبوط%' THEN 'LANDING_PAGE'
    WHEN o."source" ILIKE '%website%' OR o."source" LIKE '%موقع%' THEN 'WEBSITE'
    WHEN o."source" LIKE '%شيت%' OR o."source" ILIKE '%sheet%' THEN 'SHEET'
    ELSE 'OTHER'
  END,
  0
FROM "orders" o
WHERE o."source" IS NOT NULL AND btrim(o."source") <> ''
GROUP BY o."companyId", o."source"
ON CONFLICT ("companyId", "name") DO NOTHING;

-- Point every existing order at its channel.
UPDATE "orders" o
SET "channelId" = c."id"
FROM "order_channels" c
WHERE c."companyId" = o."companyId" AND c."name" = o."source" AND o."channelId" IS NULL;
