-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "confirmedById" TEXT,
ADD COLUMN     "followUpReason" TEXT,
ADD COLUMN     "followUpResolvedAt" TIMESTAMP(3),
ADD COLUMN     "followUpResolvedById" TEXT,
ADD COLUMN     "followUpStatus" TEXT,
ADD COLUMN     "nextFollowUpAt" TIMESTAMP(3),
ADD COLUMN     "rejectionNote" TEXT,
ADD COLUMN     "rejectionReason" TEXT;

-- CreateTable
CREATE TABLE "order_contact_attempts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeRole" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "contactMethod" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "note" TEXT,
    "nextFollowUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_contact_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_contact_attempts_companyId_orderId_createdAt_idx" ON "order_contact_attempts"("companyId", "orderId", "createdAt");

-- CreateIndex
CREATE INDEX "order_contact_attempts_companyId_employeeId_idx" ON "order_contact_attempts"("companyId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "order_contact_attempts_orderId_attemptNumber_key" ON "order_contact_attempts"("orderId", "attemptNumber");

-- CreateIndex
CREATE INDEX "orders_companyId_confirmationStatus_claimedById_idx" ON "orders"("companyId", "confirmationStatus", "claimedById");

-- CreateIndex
CREATE INDEX "orders_companyId_nextFollowUpAt_idx" ON "orders"("companyId", "nextFollowUpAt");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_followUpResolvedById_fkey" FOREIGN KEY ("followUpResolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_contact_attempts" ADD CONSTRAINT "order_contact_attempts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_contact_attempts" ADD CONSTRAINT "order_contact_attempts_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
