ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "expenses_wallet_id_fkey";
ALTER TABLE "expenses" DROP COLUMN IF EXISTS "wallet_id";
ALTER TABLE "expenses" DROP COLUMN IF EXISTS "movement_id";
