DROP INDEX IF EXISTS "customers_companyId_store_id_phone_key";
CREATE UNIQUE INDEX IF NOT EXISTS "customers_companyId_phone_key" ON "customers"("companyId", "phone");
DROP INDEX IF EXISTS "customers_companyId_store_id_idx";
ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "customers_store_id_fkey";
ALTER TABLE "customers" DROP COLUMN IF EXISTS "store_id";
