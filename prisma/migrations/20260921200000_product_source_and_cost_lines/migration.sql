-- PRODUCT SOURCE + FREE-FORM COST LINES (additive)
--
-- 1. A product is either made or bought, and nothing said which. Both doors
--    write the same stock ledger, but the forms differ — one wants a cost
--    breakdown, the other one unit price — so the product has to say which
--    door is its own. Existing products are read from their own batches:
--    a batch numbered RCV- came in through receiving.
--
-- 2. A production batch had exactly four cost buckets (manufacturing,
--    packaging, raw material, other). Real batches have as many lines as the
--    work had: a mould, a courier, a day of labour. The four columns stay —
--    104 live batches carry their costs there — and free-form lines are
--    added beside them. A batch's total is the four plus the lines.

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "sourceType" TEXT;

UPDATE "products" p SET "sourceType" = 'PURCHASED'
WHERE "sourceType" IS NULL AND EXISTS (
  SELECT 1 FROM "production_batches" b
  WHERE b."productId" = p."id" AND b."batchNumber" LIKE 'RCV-%'
);
UPDATE "products" SET "sourceType" = 'MANUFACTURED' WHERE "sourceType" IS NULL;

CREATE TABLE IF NOT EXISTS "production_batch_costs" (
  "id"        TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "batchId"   TEXT NOT NULL,
  "label"     TEXT NOT NULL,
  "amount"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "production_batch_costs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "production_batch_costs_batchId_idx"
  ON "production_batch_costs" ("batchId");

DO $$ BEGIN
  ALTER TABLE "production_batch_costs"
    ADD CONSTRAINT "production_batch_costs_batchId_fkey"
    FOREIGN KEY ("batchId") REFERENCES "production_batches"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "production_batch_costs"
    ADD CONSTRAINT "production_batch_costs_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
