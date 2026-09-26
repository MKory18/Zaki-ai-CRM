-- The signed physical count of stock a store started from, at cutover.
--
-- A physical count already existed (the «الجرد» door on /api/inventory) and is
-- not rebuilt. This adds who counted, and the fact that one particular count
-- is the opening one. One row per store, ever.
--
-- The count's LINES are its batches: `production_batches.openingCountId`
-- points back, so quantity and unit cost live in one place only.
CREATE TABLE "stock_opening_counts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "countedByName" TEXT NOT NULL,
    "countedAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_opening_counts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stock_opening_counts_storeId_key" ON "stock_opening_counts"("storeId");
CREATE INDEX "stock_opening_counts_companyId_countedAt_idx" ON "stock_opening_counts"("companyId", "countedAt");

ALTER TABLE "stock_opening_counts"
  ADD CONSTRAINT "stock_opening_counts_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "production_batches" ADD COLUMN "openingCountId" TEXT;

ALTER TABLE "production_batches"
  ADD CONSTRAINT "production_batches_openingCountId_fkey"
  FOREIGN KEY ("openingCountId") REFERENCES "stock_opening_counts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
