-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "deliveryAssignedAt" TIMESTAMP(3),
ADD COLUMN     "deliveryAssignedById" TEXT,
ADD COLUMN     "deliveryFailureReason" TEXT,
ADD COLUMN     "deliveryFee" DOUBLE PRECISION,
ADD COLUMN     "deliveryNote" TEXT,
ADD COLUMN     "deliveryProviderId" TEXT,
ADD COLUMN     "failedAt" TIMESTAMP(3),
ADD COLUMN     "outForDeliveryAt" TIMESTAMP(3),
ADD COLUMN     "returnReason" TEXT,
ADD COLUMN     "returnedAt" TIMESTAMP(3),
ADD COLUMN     "shippingBatchId" TEXT,
ADD COLUMN     "shippingNote" TEXT,
ADD COLUMN     "shippingReference" TEXT,
ADD COLUMN     "trackingNumber" TEXT;

-- CreateTable
CREATE TABLE "delivery_providers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "apiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "apiBaseUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_batches" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "deliveryProviderId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shippedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "shipping_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_attempts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "deliveryProviderId" TEXT,
    "deliveryAgentId" TEXT,
    "attemptNumber" INTEGER NOT NULL,
    "result" TEXT NOT NULL,
    "failureReason" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_providers_code_key" ON "delivery_providers"("code");

-- CreateIndex
CREATE INDEX "delivery_providers_companyId_isActive_idx" ON "delivery_providers"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "shipping_batches_companyId_status_idx" ON "shipping_batches"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "shipping_batches_companyId_batchNumber_key" ON "shipping_batches"("companyId", "batchNumber");

-- CreateIndex
CREATE INDEX "delivery_attempts_companyId_orderId_createdAt_idx" ON "delivery_attempts"("companyId", "orderId", "createdAt");

-- CreateIndex
CREATE INDEX "delivery_attempts_companyId_deliveryProviderId_idx" ON "delivery_attempts"("companyId", "deliveryProviderId");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_attempts_orderId_attemptNumber_key" ON "delivery_attempts"("orderId", "attemptNumber");

-- CreateIndex
CREATE INDEX "orders_companyId_deliveryProviderId_idx" ON "orders"("companyId", "deliveryProviderId");

-- CreateIndex
CREATE INDEX "orders_companyId_trackingNumber_idx" ON "orders"("companyId", "trackingNumber");

-- CreateIndex
CREATE INDEX "orders_companyId_shippingBatchId_idx" ON "orders"("companyId", "shippingBatchId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_deliveryAssignedById_fkey" FOREIGN KEY ("deliveryAssignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_deliveryProviderId_fkey" FOREIGN KEY ("deliveryProviderId") REFERENCES "delivery_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shippingBatchId_fkey" FOREIGN KEY ("shippingBatchId") REFERENCES "shipping_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_providers" ADD CONSTRAINT "delivery_providers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_batches" ADD CONSTRAINT "shipping_batches_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_batches" ADD CONSTRAINT "shipping_batches_deliveryProviderId_fkey" FOREIGN KEY ("deliveryProviderId") REFERENCES "delivery_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_batches" ADD CONSTRAINT "shipping_batches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_deliveryProviderId_fkey" FOREIGN KEY ("deliveryProviderId") REFERENCES "delivery_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_deliveryAgentId_fkey" FOREIGN KEY ("deliveryAgentId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
