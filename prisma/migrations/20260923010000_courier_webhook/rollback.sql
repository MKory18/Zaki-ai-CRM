DROP INDEX IF EXISTS "delivery_providers_webhook_secret_hash_key";
ALTER TABLE "delivery_providers" DROP COLUMN IF EXISTS "webhook_last_seen_at";
ALTER TABLE "delivery_providers" DROP COLUMN IF EXISTS "webhook_secret_set_at";
ALTER TABLE "delivery_providers" DROP COLUMN IF EXISTS "webhook_secret_hash";
