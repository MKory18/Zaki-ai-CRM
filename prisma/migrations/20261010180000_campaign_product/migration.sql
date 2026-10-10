-- WHICH PRODUCT A CAMPAIGN ADVERTISES — «اقدر احدد كل حملة لاي منتج».
--
-- One nullable column and one foreign key. MEASURED BEFORE WRITING THIS:
-- `campaigns` holds ZERO rows, and 44 of 44 landing pages name a product.
--
-- So for every campaign that points at a page, the product is already
-- KNOWN — and this column is NOT that answer repeated. It is for the case
-- derivation cannot reach: a campaign with no landing page at all, which
-- `landing_page_id` being nullable makes a real and reachable state.
--
-- ON DELETE SET NULL, like `landing_page_id` beside it. Deleting a product
-- must not delete the campaign: the spend recorded on it was real money
-- that left for Meta, and a cascade would erase the record of it.

ALTER TABLE "campaigns"
  ADD COLUMN "product_id" TEXT;

ALTER TABLE "campaigns"
  ADD CONSTRAINT "campaigns_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "campaigns_company_id_product_id_idx"
  ON "campaigns"("company_id", "product_id");
