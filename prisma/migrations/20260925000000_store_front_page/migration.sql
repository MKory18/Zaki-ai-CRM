-- A Single Product store's front is one of its landing pages.
-- Additive: a nullable column, a unique index (a page fronts one store at
-- most) and a foreign key that lets go of the page if it is ever deleted.
ALTER TABLE "stores" ADD COLUMN "landingPageId" TEXT;
CREATE UNIQUE INDEX "stores_landingPageId_key" ON "stores"("landingPageId");
ALTER TABLE "stores" ADD CONSTRAINT "stores_landingPageId_fkey"
  FOREIGN KEY ("landingPageId") REFERENCES "landing_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
