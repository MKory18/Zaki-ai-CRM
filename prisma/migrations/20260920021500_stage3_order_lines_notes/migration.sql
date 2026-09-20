-- Stage 3: order lines, immutable notes, merchant reference.
-- Additive only.

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "merchantRef" TEXT,
ADD COLUMN     "priceIncludesDelivery" BOOLEAN NOT NULL DEFAULT false;





-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "freeQuantity" INTEGER NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "discountShare" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "reservedQty" INTEGER NOT NULL DEFAULT 0,
    "addedById" TEXT,
    "addedStage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_notes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'internal',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE INDEX "order_items_companyId_productId_idx" ON "order_items"("companyId", "productId");

-- CreateIndex
CREATE INDEX "order_notes_orderId_createdAt_idx" ON "order_notes"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "order_notes_companyId_kind_idx" ON "order_notes"("companyId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "orders_companyId_merchantRef_key" ON "orders"("companyId", "merchantRef");

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_notes" ADD CONSTRAINT "order_notes_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────
-- Backfill: every existing order becomes a single line.
--
-- CAREFUL: in the legacy model Order.sellingPrice is the TOTAL for the whole
-- quantity (an offer price), not a unit price — see api/orders POST, where
-- totalAmount = sellingPrice. The line's unitPrice is therefore derived as
-- totalAmount / quantity, and lineTotal = totalAmount - discount.
--
-- Reservation stays 0: reserving live orders is an operational decision, not
-- a data migration. merchantRef starts as the existing order number.
-- ─────────────────────────────────────────────────────────────
INSERT INTO "order_items" (
  "id", "companyId", "orderId", "productId", "productName", "quantity",
  "freeQuantity", "unitPrice", "discountShare", "lineTotal", "reservedQty", "addedStage", "updatedAt"
)
SELECT gen_random_uuid(), o."companyId", o.id, o."productId",
       COALESCE(NULLIF(o."productNameSnapshot", ''), p.name),
       GREATEST(o.quantity, 1),
       COALESCE(o."freeQuantity", 0),
       ROUND((COALESCE(NULLIF(o."totalAmount", 0), o."sellingPrice") / GREATEST(o.quantity, 1))::numeric, 2),
       ROUND(COALESCE(o."discountAmount", 0)::numeric, 2),
       ROUND((COALESCE(NULLIF(o."totalAmount", 0), o."sellingPrice") - COALESCE(o."discountAmount", 0))::numeric, 2),
       0,
       'INTAKE',
       CURRENT_TIMESTAMP
FROM "orders" o
JOIN "products" p ON p.id = o."productId"
WHERE NOT EXISTS (SELECT 1 FROM "order_items" i WHERE i."orderId" = o.id);

UPDATE "orders" SET "merchantRef" = "orderNumber" WHERE "merchantRef" IS NULL;

-- Orders created from an offer that includes delivery keep that policy.
UPDATE "orders" o SET "priceIncludesDelivery" = true
FROM "offers" f WHERE f.id = o."offerId" AND f."deliveryIncluded" = true;
