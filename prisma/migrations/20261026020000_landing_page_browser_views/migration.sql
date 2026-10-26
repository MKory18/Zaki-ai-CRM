-- Landing page visits counted FROM THE BROWSER, beside the server's count, for one week of comparison before the page
-- is cached (a cached page is no longer built per visit, so the server cannot count it). Additive: a new table with the
-- exact shape of "landing_page_views"; nothing existing is read differently or changed.
CREATE TABLE IF NOT EXISTS "landing_page_browser_views" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "storeId" TEXT,
  "landingPageId" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "device" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL DEFAULT '',
  "count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "landing_page_browser_views_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "landing_page_browser_views_landingPageId_day_device_campaignId_key"
  ON "landing_page_browser_views"("landingPageId", "day", "device", "campaignId");
CREATE INDEX IF NOT EXISTS "landing_page_browser_views_companyId_storeId_day_idx"
  ON "landing_page_browser_views"("companyId", "storeId", "day");
DO $$ BEGIN
  ALTER TABLE "landing_page_browser_views" ADD CONSTRAINT "landing_page_browser_views_landingPageId_fkey"
    FOREIGN KEY ("landingPageId") REFERENCES "landing_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
