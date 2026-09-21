-- Rollback: recreate the table and the order column, empty.
--
-- The rows themselves are not recoverable from here — the drop only ran
-- because there were none. This restores the shape so an older build can
-- start against this database.
CREATE TABLE IF NOT EXISTS "landing_page_offers" (
  "id"            TEXT NOT NULL,
  "landingPageId" TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "quantity"      INTEGER NOT NULL,
  "freeQuantity"  INTEGER NOT NULL DEFAULT 0,
  "price"         DOUBLE PRECISION NOT NULL,
  "isDefault"     BOOLEAN NOT NULL DEFAULT false,
  "sortOrder"     INTEGER NOT NULL DEFAULT 0,
  "isActive"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "landing_page_offers_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "landing_page_offers_landingPageId_isActive_idx"
  ON "landing_page_offers" ("landingPageId", "isActive");
DO $$ BEGIN
  ALTER TABLE "landing_page_offers" ADD CONSTRAINT "landing_page_offers_landingPageId_fkey"
    FOREIGN KEY ("landingPageId") REFERENCES "landing_pages"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "landingPageOfferId" TEXT;
CREATE INDEX IF NOT EXISTS "orders_companyId_landingPageOfferId_idx"
  ON "orders" ("companyId", "landingPageOfferId");
DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_landingPageOfferId_fkey"
    FOREIGN KEY ("landingPageOfferId") REFERENCES "landing_page_offers"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
