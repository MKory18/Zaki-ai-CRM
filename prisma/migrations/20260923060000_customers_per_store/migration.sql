-- A customer record belongs to the store that serves them.
--
-- The stores are separate businesses. The same person may buy from two of
-- them, and each keeps its own record: its own history, its own notes, its
-- own idea of whether this is a good customer. One shared row would make
-- one store's complaint show up on the other's screen.
--
-- The BLACKLIST stays company-wide on purpose. Blocking a number is a
-- judgement about a person, not about one shop, and a blocked number that
-- can simply order from the store next door blocks nothing.
ALTER TABLE "customers" ADD COLUMN "store_id" TEXT;

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_store_id_fkey"
  FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "customers_companyId_store_id_idx" ON "customers"("companyId", "store_id");

-- The phone was unique per company, so the same person could not be a
-- customer of two stores at once. It identifies them within a store.
DROP INDEX IF EXISTS "customers_companyId_phone_key";
CREATE UNIQUE INDEX "customers_companyId_store_id_phone_key"
  ON "customers"("companyId", "store_id", "phone");
