-- Stage 4: confirmation centre — change requests, entry issues,
-- postpone details. Additive only.

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "postponeCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "postponePreferredTime" TEXT;





-- CreateTable
CREATE TABLE "order_change_requests" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requestedRole" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "blocking" BOOLEAN NOT NULL DEFAULT true,
    "slaDueAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "changedDuringReview" BOOLEAN NOT NULL DEFAULT false,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_issues" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "raisedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_change_requests_companyId_status_createdAt_idx" ON "order_change_requests"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "order_change_requests_orderId_status_idx" ON "order_change_requests"("orderId", "status");

-- CreateIndex
CREATE INDEX "order_issues_companyId_status_createdAt_idx" ON "order_issues"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "order_issues_orderId_idx" ON "order_issues"("orderId");

-- AddForeignKey
ALTER TABLE "order_change_requests" ADD CONSTRAINT "order_change_requests_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_issues" ADD CONSTRAINT "order_issues_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

