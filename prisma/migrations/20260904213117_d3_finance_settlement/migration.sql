-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "advertisingCost" DECIMAL(12,2),
ADD COLUMN     "discount" DECIMAL(12,2),
ADD COLUMN     "financeFinalizedAt" TIMESTAMP(3),
ADD COLUMN     "financeFinalizedById" TEXT,
ADD COLUMN     "grossProfit" DECIMAL(12,2),
ADD COLUMN     "netProfit" DECIMAL(12,2),
ADD COLUMN     "otherCost" DECIMAL(12,2),
ADD COLUMN     "packagingCost" DECIMAL(12,2),
ADD COLUMN     "productCost" DECIMAL(12,2),
ADD COLUMN     "refundAmount" DECIMAL(12,2),
ADD COLUMN     "shippingRevenue" DECIMAL(12,2),
ADD COLUMN     "subtotal" DECIMAL(12,2),
ADD COLUMN     "totalRevenue" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "financial_transactions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_transactions_companyId_createdAt_idx" ON "financial_transactions"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "financial_transactions_companyId_type_idx" ON "financial_transactions"("companyId", "type");

-- CreateIndex
CREATE INDEX "financial_transactions_orderId_idx" ON "financial_transactions"("orderId");

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
