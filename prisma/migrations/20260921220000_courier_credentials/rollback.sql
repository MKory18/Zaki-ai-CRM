-- Rollback: drop the stored credentials. Couriers fall back to the
-- environment, which is where they were read from before this migration.
ALTER TABLE "delivery_providers" DROP COLUMN IF EXISTS "credentialsUpdatedById";
ALTER TABLE "delivery_providers" DROP COLUMN IF EXISTS "credentialsUpdatedAt";
ALTER TABLE "delivery_providers" DROP COLUMN IF EXISTS "apiCredentials";
