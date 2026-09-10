-- Additive-only migration: Landing Pages (public marketing pages -> real CRM orders)
-- No DROP / TRUNCATE / destructive changes.

-- CreateTable
CREATE TABLE "landing_pages" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "htmlContent" TEXT,
    "productId" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "ordersCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "landing_pages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "landing_pages_companyId_slug_key" ON "landing_pages"("companyId", "slug");

-- CreateIndex
CREATE INDEX "landing_pages_companyId_idx" ON "landing_pages"("companyId");

-- CreateIndex
CREATE INDEX "landing_pages_companyId_isPublished_idx" ON "landing_pages"("companyId", "isPublished");

-- AddForeignKey
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Orders: link to the landing page that sourced the order (nullable, additive)
-- AlterTable
ALTER TABLE "orders" ADD COLUMN "landingPageId" TEXT;

-- CreateIndex
CREATE INDEX "orders_companyId_landingPageId_idx" ON "orders"("companyId", "landingPageId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_landingPageId_fkey" FOREIGN KEY ("landingPageId") REFERENCES "landing_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;