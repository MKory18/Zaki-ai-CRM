-- A courier belongs to a store, or to all of them.
--
-- The owner runs several stores that are separate businesses and holds a
-- separate account with the same courier for each. One row per company
-- could hold one account, so every store's parcels would have been created
-- under whichever login was saved last, and the collections and statements
-- would all have come back against it.
--
-- NULL means "every store", which is exactly what the rows already mean
-- today. Nothing existing changes, and no order, batch or statement is
-- touched — they keep pointing at the same courier they always did.
ALTER TABLE "delivery_providers" ADD COLUMN "store_id" TEXT;

ALTER TABLE "delivery_providers"
  ADD CONSTRAINT "delivery_providers_store_id_fkey"
  FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "delivery_providers_companyId_store_id_idx"
  ON "delivery_providers"("companyId", "store_id");

-- The code was unique across every company on the platform, which made
-- "BASHA" a name only one store anywhere could ever use. It is an
-- identifier within a company, so that is where it is unique now.
DROP INDEX IF EXISTS "delivery_providers_code_key";
CREATE UNIQUE INDEX "delivery_providers_companyId_code_key"
  ON "delivery_providers"("companyId", "code");
