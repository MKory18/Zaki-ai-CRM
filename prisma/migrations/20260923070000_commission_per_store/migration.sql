-- A commission rule belongs to a store.
--
-- The rules were the company's, so one store's agreement with its agents
-- paid out on another store's deliveries. The stores are separate
-- businesses; what one pays for a sale is not the other's to inherit.
--
-- Nullable, and placed by a script before anything reads it: a rule applied
-- to the wrong store is money paid out of the wrong books, and nobody
-- notices until the month closes.
ALTER TABLE "commission_rules" ADD COLUMN "store_id" TEXT;

ALTER TABLE "commission_rules"
  ADD CONSTRAINT "commission_rules_store_id_fkey"
  FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "commission_rules_companyId_store_id_idx"
  ON "commission_rules"("companyId", "store_id");
