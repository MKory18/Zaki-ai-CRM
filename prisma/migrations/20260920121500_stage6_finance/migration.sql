-- Stage 6: wallets, courier statements, receipts, matching, daily closing,
-- commission rules and entries. Additive only.





-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "openingBalance" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_movements" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amount" DECIMAL(14,3) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "party" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "reversalOfId" TEXT,
    "reversalReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transfers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fromWalletId" TEXT NOT NULL,
    "toWalletId" TEXT NOT NULL,
    "amountOut" DECIMAL(14,3) NOT NULL,
    "amountIn" DECIMAL(14,3) NOT NULL,
    "exchangeRate" DECIMAL(14,6) NOT NULL,
    "note" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_closings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "bookBalance" DECIMAL(14,3) NOT NULL,
    "actualBalance" DECIMAL(14,3) NOT NULL,
    "difference" DECIMAL(14,3) NOT NULL,
    "explanation" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "recordedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_closings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courier_statements" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "deliveryProviderId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "totalAmount" DECIMAL(14,3) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IMPORTED',
    "gapExplanation" TEXT,
    "uploadedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courier_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "statement_lines" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "merchantRef" TEXT,
    "barcode" TEXT,
    "amount" DECIMAL(14,3) NOT NULL,
    "status" TEXT,
    "rawRow" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "statement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "statement_receipts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "amount" DECIMAL(14,3) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "exchangeRate" DECIMAL(14,6),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "statement_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_matches" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "statementLineId" TEXT,
    "orderId" TEXT,
    "result" TEXT NOT NULL,
    "matchedBy" TEXT,
    "expectedAmount" DECIMAL(14,3),
    "statementAmount" DECIMAL(14,3),
    "difference" DECIMAL(14,3),
    "note" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlement_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_rules" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "appliesToRole" TEXT,
    "appliesToUserId" TEXT,
    "basis" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" DECIMAL(12,4) NOT NULL,
    "minSampleOrders" INTEGER NOT NULL DEFAULT 30,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_entries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "ruleId" TEXT,
    "amount" DECIMAL(14,3) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACCRUED',
    "periodMonth" TEXT NOT NULL,
    "reversalOfId" TEXT,
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_periods" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodMonth" TEXT NOT NULL,
    "totalAmount" DECIMAL(14,3) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wallets_companyId_countryId_isActive_idx" ON "wallets"("companyId", "countryId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_companyId_name_key" ON "wallets"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_movements_reversalOfId_key" ON "wallet_movements"("reversalOfId");

-- CreateIndex
CREATE INDEX "wallet_movements_companyId_walletId_createdAt_idx" ON "wallet_movements"("companyId", "walletId", "createdAt");

-- CreateIndex
CREATE INDEX "wallet_movements_companyId_category_idx" ON "wallet_movements"("companyId", "category");

-- CreateIndex
CREATE INDEX "wallet_movements_referenceType_referenceId_idx" ON "wallet_movements"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "wallet_transfers_companyId_createdAt_idx" ON "wallet_transfers"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "daily_closings_companyId_status_date_idx" ON "daily_closings"("companyId", "status", "date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_closings_walletId_date_key" ON "daily_closings"("walletId", "date");

-- CreateIndex
CREATE INDEX "courier_statements_companyId_status_createdAt_idx" ON "courier_statements"("companyId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "courier_statements_companyId_fileHash_key" ON "courier_statements"("companyId", "fileHash");

-- CreateIndex
CREATE INDEX "statement_lines_statementId_idx" ON "statement_lines"("statementId");

-- CreateIndex
CREATE INDEX "statement_lines_merchantRef_idx" ON "statement_lines"("merchantRef");

-- CreateIndex
CREATE INDEX "statement_receipts_companyId_statementId_idx" ON "statement_receipts"("companyId", "statementId");

-- CreateIndex
CREATE INDEX "settlement_matches_companyId_statementId_result_idx" ON "settlement_matches"("companyId", "statementId", "result");

-- CreateIndex
CREATE INDEX "settlement_matches_orderId_idx" ON "settlement_matches"("orderId");

-- CreateIndex
CREATE INDEX "commission_rules_companyId_isActive_effectiveFrom_idx" ON "commission_rules"("companyId", "isActive", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "commission_entries_reversalOfId_key" ON "commission_entries"("reversalOfId");

-- CreateIndex
CREATE INDEX "commission_entries_companyId_periodMonth_status_idx" ON "commission_entries"("companyId", "periodMonth", "status");

-- CreateIndex
CREATE INDEX "commission_entries_userId_periodMonth_idx" ON "commission_entries"("userId", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "commission_entries_orderId_userId_status_key" ON "commission_entries"("orderId", "userId", "status");

-- CreateIndex
CREATE INDEX "commission_periods_companyId_status_idx" ON "commission_periods"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "commission_periods_companyId_userId_periodMonth_key" ON "commission_periods"("companyId", "userId", "periodMonth");

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_movements" ADD CONSTRAINT "wallet_movements_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_movements" ADD CONSTRAINT "wallet_movements_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "wallet_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_closings" ADD CONSTRAINT "daily_closings_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statement_lines" ADD CONSTRAINT "statement_lines_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "courier_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statement_receipts" ADD CONSTRAINT "statement_receipts_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "courier_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statement_receipts" ADD CONSTRAINT "statement_receipts_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_matches" ADD CONSTRAINT "settlement_matches_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "courier_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_matches" ADD CONSTRAINT "settlement_matches_statementLineId_fkey" FOREIGN KEY ("statementLineId") REFERENCES "statement_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_matches" ADD CONSTRAINT "settlement_matches_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "commission_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "commission_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

