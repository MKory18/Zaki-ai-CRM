-- Additive-only migration: Landing Page Offers, Recommendations, Order Add-Ons
-- No DROP / TRUNCATE / destructive changes. Backward compatible.

-- CreateTable
CREATE TABLE "landing_page_offers" (
    "id" TEXT NOT NULL,
    "landingPageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "freeQuantity" INTEGER NOT NULL DEFAULT 0,
    "price" DOUBLE PRECISION NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "landing_page_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "landing_page_recommendations" (
    "id" TEXT NOT NULL,
    "landingPageId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "landing_page_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_add_ons" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "landingPageId" TEXT,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_add_ons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "landing_page_offers_landingPageId_isActive_idx" ON "landing_page_offers"("landingPageId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "landing_page_recommendations_landingPageId_productId_key" ON "landing_page_recommendations"("landingPageId", "productId");

-- CreateIndex
CREATE INDEX "landing_page_recommendations_landingPageId_isActive_sortOrder_idx" ON "landing_page_recommendations"("landingPageId", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "order_add_ons_orderId_idx" ON "order_add_ons"("orderId");

-- CreateIndex
CREATE INDEX "order_add_ons_companyId_orderId_idx" ON "order_add_ons"("companyId", "orderId");

-- AddForeignKey
ALTER TABLE "landing_page_offers" ADD CONSTRAINT "landing_page_offers_landingPageId_fkey" FOREIGN KEY ("landingPageId") REFERENCES "landing_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landing_page_recommendations" ADD CONSTRAINT "landing_page_recommendations_landingPageId_fkey" FOREIGN KEY ("landingPageId") REFERENCES "landing_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landing_page_recommendations" ADD CONSTRAINT "landing_page_recommendations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_add_ons" ADD CONSTRAINT "order_add_ons_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_add_ons" ADD CONSTRAINT "order_add_ons_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_add_ons" ADD CONSTRAINT "order_add_ons_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_add_ons" ADD CONSTRAINT "order_add_ons_landingPageId_fkey" FOREIGN KEY ("landingPageId") REFERENCES "landing_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Orders: link to the landing-page offer + gift quantity (nullable, additive)
-- AlterTable
ALTER TABLE "orders" ADD COLUMN "landingPageOfferId" TEXT;
ALTER TABLE "orders" ADD COLUMN "freeQuantity" INTEGER NOT NULL DEFAULT 0;

-- LandingPage: upsell analytics counters (nullable, additive)
ALTER TABLE "landing_pages" ADD COLUMN "upsellAddsCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "landing_pages" ADD COLUMN "upsellRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "orders_companyId_landingPageOfferId_idx" ON "orders"("companyId", "landingPageOfferId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_landingPageOfferId_fkey" FOREIGN KEY ("landingPageOfferId") REFERENCES "landing_page_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;