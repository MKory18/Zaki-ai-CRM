DROP INDEX IF EXISTS "wallet_transfers_companyId_kind_idx";
ALTER TABLE "wallet_transfers" DROP COLUMN IF EXISTS "kind";
DROP INDEX IF EXISTS "wallets_companyId_store_id_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "wallets_companyId_name_key" ON "wallets"("companyId", "name");
DROP INDEX IF EXISTS "wallets_companyId_store_id_idx";
ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "wallets_store_id_fkey";
ALTER TABLE "wallets" DROP COLUMN IF EXISTS "store_id";
