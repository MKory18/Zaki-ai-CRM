-- AN EXPENSE THAT NEVER LEFT A WALLET.
--
-- Money was recorded as spent on the profit screen and no wallet was
-- touched, so the same money did not exist in the wallet ledger — and the
-- daily closing, which compares the drawer against the book balance, showed
-- a shortfall nobody could explain. Somebody then wrote an explanation for
-- a difference that was really an expense already recorded elsewhere.
--
-- Nullable because the column is new, not because the wallet is optional:
-- the service requires one for every NEW expense. Null means "recorded
-- before this existed", and there are no such rows in any environment today.
ALTER TABLE "expenses" ADD COLUMN "wallet_id" TEXT;
ALTER TABLE "expenses" ADD COLUMN "movement_id" TEXT;

CREATE INDEX "expenses_wallet_id_idx" ON "expenses"("wallet_id");

ALTER TABLE "expenses" ADD CONSTRAINT "expenses_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
