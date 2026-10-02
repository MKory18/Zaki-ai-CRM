-- A readable address for a product and a category, and the addresses a
-- product used to have.
--
-- All nullable with no default: a row saved before this has none, and every
-- page falls back to what it used today. Additive only — nothing is dropped
-- and no stored value is rewritten.
--
-- The index is on "store_id", which is what the column is really called:
-- `Product.storeId` carries `@map("store_id")`. Writing the Prisma name here
-- is how the first attempt at this migration failed.
ALTER TABLE "products" ADD COLUMN "slug" TEXT;
ALTER TABLE "products" ADD COLUMN "previousSlugs" TEXT;
ALTER TABLE "categories" ADD COLUMN "slug" TEXT;
CREATE INDEX "products_store_id_slug_idx" ON "products"("store_id", "slug");
CREATE INDEX "categories_companyId_slug_idx" ON "categories"("companyId", "slug");
