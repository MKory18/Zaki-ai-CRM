-- Landing page views per day, device and campaign; and the device an order
-- came from. Both additive: a new table, and a nullable column.
CREATE TABLE "landing_page_views" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "storeId" TEXT,
  "landingPageId" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "device" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL DEFAULT '',
  "count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "landing_page_views_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "landing_page_views_landingPageId_day_device_campaignId_key"
  ON "landing_page_views"("landingPageId", "day", "device", "campaignId");
CREATE INDEX "landing_page_views_companyId_storeId_day_idx"
  ON "landing_page_views"("companyId", "storeId", "day");
ALTER TABLE "landing_page_views" ADD CONSTRAINT "landing_page_views_landingPageId_fkey"
  FOREIGN KEY ("landingPageId") REFERENCES "landing_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "orders" ADD COLUMN "deviceClass" TEXT;
