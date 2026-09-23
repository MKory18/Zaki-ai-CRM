-- A courier that can PUSH a status instead of us polling for it.
--
-- We store only the SHA-256 of the token, never the token. The endpoint
-- hashes what it is given and looks up the provider by that. A stolen
-- database therefore yields no working webhook URL, and the token is shown
-- to the person exactly once, at the moment it is generated.
ALTER TABLE "delivery_providers" ADD COLUMN "webhook_secret_hash" TEXT;
ALTER TABLE "delivery_providers" ADD COLUMN "webhook_secret_set_at" TIMESTAMP(3);
ALTER TABLE "delivery_providers" ADD COLUMN "webhook_last_seen_at" TIMESTAMP(3);

-- The lookup the endpoint does on every call, on a value that is unique.
CREATE UNIQUE INDEX "delivery_providers_webhook_secret_hash_key"
  ON "delivery_providers"("webhook_secret_hash");
