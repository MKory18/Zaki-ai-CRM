DROP INDEX IF EXISTS "delivery_providers_companyId_code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "delivery_providers_code_key" ON "delivery_providers"("code");
DROP INDEX IF EXISTS "delivery_providers_companyId_store_id_idx";
ALTER TABLE "delivery_providers" DROP CONSTRAINT IF EXISTS "delivery_providers_store_id_fkey";
ALTER TABLE "delivery_providers" DROP COLUMN IF EXISTS "store_id";
