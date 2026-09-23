-- A wallet belongs to a store, and a transfer says which of three it is.
--
-- Wallets were per country, so two stores in one country drew on the same
-- drawer and the daily closing of neither was theirs alone. A store here is
-- a separate business: its own cash, its own bank account, its own books.
ALTER TABLE "wallets" ADD COLUMN "store_id" TEXT;

ALTER TABLE "wallets"
  ADD CONSTRAINT "wallets_store_id_fkey"
  FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "wallets_companyId_store_id_idx" ON "wallets"("companyId", "store_id");

-- The name was unique across the company, so only one store could ever have
-- a "الصندوق النقدي". Every store has one; it is unique within the store.
DROP INDEX IF EXISTS "wallets_companyId_name_key";
CREATE UNIQUE INDEX "wallets_companyId_store_id_name_key"
  ON "wallets"("companyId", "store_id", "name");

-- WHAT THIS TRANSFER WAS, recorded when it happened.
--
-- It can be derived from the two wallets — and is, to label the screen
-- before you commit. But a wallet moved to another store later would
-- rewrite what every past transfer meant, and a transfer is a thing that
-- happened. So the answer at the time is kept, the way an order keeps the
-- cost it was created with.
--
--   INTERNAL          both wallets in one store
--   BETWEEN_STORES    two stores, one country
--   BETWEEN_COUNTRIES two countries — the only one that crosses currencies
ALTER TABLE "wallet_transfers" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'INTERNAL';
CREATE INDEX "wallet_transfers_companyId_kind_idx" ON "wallet_transfers"("companyId", "kind");
