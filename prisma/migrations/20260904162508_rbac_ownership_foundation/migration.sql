-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "claimedById" TEXT,
ADD COLUMN     "confirmationStatus" TEXT NOT NULL DEFAULT 'NEW',
ADD COLUMN     "currentOwnerId" TEXT,
ADD COLUMN     "lockExpiresAt" TIMESTAMP(3),
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "lockedById" TEXT,
ADD COLUMN     "settlementStatus" TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
ADD COLUMN     "shippingStatus" TEXT NOT NULL DEFAULT 'NOT_READY',
ADD COLUMN     "signatureNote" TEXT,
ADD COLUMN     "signatureStatus" TEXT NOT NULL DEFAULT 'UNSIGNED',
ADD COLUMN     "signedAt" TIMESTAMP(3),
ADD COLUMN     "signedById" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "order_claim_history" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_claim_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "statusType" TEXT NOT NULL,
    "previousValue" TEXT,
    "newValue" TEXT,
    "changedById" TEXT NOT NULL,
    "changedByRole" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_claim_history_orderId_createdAt_idx" ON "order_claim_history"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "order_claim_history_companyId_userId_idx" ON "order_claim_history"("companyId", "userId");

-- CreateIndex
CREATE INDEX "order_status_logs_orderId_createdAt_idx" ON "order_status_logs"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "order_status_logs_companyId_statusType_idx" ON "order_status_logs"("companyId", "statusType");

-- CreateIndex
CREATE INDEX "orders_companyId_assignedToId_idx" ON "orders"("companyId", "assignedToId");

-- CreateIndex
CREATE INDEX "orders_companyId_claimedById_idx" ON "orders"("companyId", "claimedById");

-- CreateIndex
CREATE INDEX "orders_companyId_currentOwnerId_idx" ON "orders"("companyId", "currentOwnerId");

-- CreateIndex
CREATE INDEX "orders_companyId_lockedById_idx" ON "orders"("companyId", "lockedById");

-- CreateIndex
CREATE INDEX "orders_companyId_confirmationStatus_idx" ON "orders"("companyId", "confirmationStatus");

-- CreateIndex
CREATE INDEX "orders_companyId_shippingStatus_idx" ON "orders"("companyId", "shippingStatus");

-- CreateIndex
CREATE INDEX "orders_companyId_settlementStatus_idx" ON "orders"("companyId", "settlementStatus");

-- CreateIndex
CREATE INDEX "orders_lockedById_lockExpiresAt_idx" ON "orders"("lockedById", "lockExpiresAt");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_currentOwnerId_fkey" FOREIGN KEY ("currentOwnerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_claim_history" ADD CONSTRAINT "order_claim_history_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_claim_history" ADD CONSTRAINT "order_claim_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_logs" ADD CONSTRAINT "order_status_logs_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_logs" ADD CONSTRAINT "order_status_logs_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
