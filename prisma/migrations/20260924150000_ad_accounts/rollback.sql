-- Disconnects every ad account and returns all spend to manual entry. The
-- numbers already pulled stay on the campaigns: they were real spend, and a
-- rollback of the plumbing is not a reason to forget what was paid.
ALTER TABLE "campaigns" DROP CONSTRAINT IF EXISTS "campaigns_ad_account_id_fkey";
ALTER TABLE "campaigns" DROP COLUMN IF EXISTS "last_sync_at";
ALTER TABLE "campaigns" DROP COLUMN IF EXISTS "external_id";
ALTER TABLE "campaigns" DROP COLUMN IF EXISTS "ad_account_id";
ALTER TABLE "campaigns" DROP COLUMN IF EXISTS "spend_source";
DROP TABLE IF EXISTS "ad_accounts";
