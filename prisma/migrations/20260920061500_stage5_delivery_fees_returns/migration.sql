-- Stage 5: delivery fee tables, return receiving, order region.
-- Additive only.

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "deliveryFeeOverrideReason" TEXT,
ADD COLUMN     "labelPrintedAt" TIMESTAMP(3),
ADD COLUMN     "regionId" TEXT;





-- CreateTable
CREATE TABLE "delivery_fees" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "deliveryProviderId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "fee" DECIMAL(12,2) NOT NULL,
    "lateThresholdDays" INTEGER NOT NULL DEFAULT 3,
    "returnFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_receipts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "expectedQty" INTEGER NOT NULL,
    "receivedQty" INTEGER NOT NULL,
    "damagedQty" INTEGER NOT NULL DEFAULT 0,
    "missingQty" INTEGER NOT NULL DEFAULT 0,
    "courierFeeCharged" BOOLEAN NOT NULL DEFAULT false,
    "courierFeeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "inspectedById" TEXT NOT NULL,
    "inspectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "stockRestored" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "delivery_fees_companyId_countryId_idx" ON "delivery_fees"("companyId", "countryId");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_fees_deliveryProviderId_regionId_key" ON "delivery_fees"("deliveryProviderId", "regionId");

-- CreateIndex
CREATE UNIQUE INDEX "return_receipts_orderId_key" ON "return_receipts"("orderId");

-- CreateIndex
CREATE INDEX "return_receipts_companyId_createdAt_idx" ON "return_receipts"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "orders_companyId_labelPrintedAt_idx" ON "orders"("companyId", "labelPrintedAt");

-- CreateIndex
CREATE INDEX "orders_regionId_idx" ON "orders"("regionId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_fees" ADD CONSTRAINT "delivery_fees_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_fees" ADD CONSTRAINT "delivery_fees_deliveryProviderId_fkey" FOREIGN KEY ("deliveryProviderId") REFERENCES "delivery_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_fees" ADD CONSTRAINT "delivery_fees_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_receipts" ADD CONSTRAINT "return_receipts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────
-- Backfill: attach existing orders to a region of their own country by
-- matching the customer's city against the region names. Unmatched orders
-- stay NULL and are resolved when the operator picks a region.
-- ─────────────────────────────────────────────────────────────
UPDATE "orders" o
SET "regionId" = r.id
FROM "customers" c
JOIN "regions" r ON TRUE
WHERE c.id = o."customerId"
  AND o."regionId" IS NULL
  AND r."countryId" = o."countryId"
  AND TRIM(LOWER(c.city)) = TRIM(LOWER(r.name));
