DROP INDEX IF EXISTS "commission_rules_companyId_store_id_idx";
ALTER TABLE "commission_rules" DROP CONSTRAINT IF EXISTS "commission_rules_store_id_fkey";
ALTER TABLE "commission_rules" DROP COLUMN IF EXISTS "store_id";
