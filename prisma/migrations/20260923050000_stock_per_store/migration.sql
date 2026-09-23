-- Stock belongs to a store.
--
-- Physical stock lives on production batches; inventory movements are the
-- log of what happened to it; the product is the catalogue entry. All three
-- were company-wide, so two stores sold out of one pile and neither could
-- say what was its own.
--
-- Every column is NULLABLE and nothing reads it yet. The rows have to be
-- placed first, by someone who knows which store each belongs to — a
-- product put in the wrong store is stock the right store cannot sell, and
-- that is not a thing to guess at.
ALTER TABLE "products" ADD COLUMN "store_id" TEXT;
ALTER TABLE "production_batches" ADD COLUMN "store_id" TEXT;
ALTER TABLE "inventory_movements" ADD COLUMN "store_id" TEXT;

ALTER TABLE "products"
  ADD CONSTRAINT "products_store_id_fkey"
  FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_batches"
  ADD CONSTRAINT "production_batches_store_id_fkey"
  FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_store_id_fkey"
  FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "products_companyId_store_id_idx" ON "products"("companyId", "store_id");
CREATE INDEX "production_batches_companyId_store_id_idx" ON "production_batches"("companyId", "store_id");
CREATE INDEX "inventory_movements_companyId_store_id_idx" ON "inventory_movements"("companyId", "store_id");

-- The SKU was unique across the company, so two stores could not carry the
-- same article under the same code. It identifies an article within a store.
DROP INDEX IF EXISTS "products_companyId_sku_key";
CREATE UNIQUE INDEX "products_companyId_store_id_sku_key"
  ON "products"("companyId", "store_id", "sku");
