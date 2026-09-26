-- The signed physical count behind a wallet's opening balance.
--
-- `wallets.opening_balance` already existed and was already immutable after
-- creation. What was missing is who counted the money and when — the audit
-- log records who CREATED the wallet, which is the person who typed.
--
-- One row per wallet, ever. A wallet that has started moving is reconciled by
-- the daily closing, not by a second count.
CREATE TABLE "wallet_opening_counts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "countedAmount" DECIMAL(14,3) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "countedByName" TEXT NOT NULL,
    "countedAt" TIMESTAMP(3) NOT NULL,
    "previousOpening" DECIMAL(14,3) NOT NULL,
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_opening_counts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wallet_opening_counts_walletId_key" ON "wallet_opening_counts"("walletId");
CREATE INDEX "wallet_opening_counts_companyId_countedAt_idx" ON "wallet_opening_counts"("companyId", "countedAt");

ALTER TABLE "wallet_opening_counts"
  ADD CONSTRAINT "wallet_opening_counts_walletId_fkey"
  FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
