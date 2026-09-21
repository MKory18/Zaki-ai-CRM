-- COURIER CREDENTIALS (additive)
--
-- A courier account was configurable only through environment variables,
-- which meant adding a second shipping company required a deploy, and the
-- person who owns the account could not enter it themselves.
--
-- The credentials are stored encrypted (AES-256-GCM, key in the environment
-- only) as a single blob: an id, a login and a password are useless apart,
-- so encrypting them together makes a half-saved account impossible.
--
-- The environment remains the fallback, so nothing already deployed changes
-- behaviour until an account is entered through the screen.

ALTER TABLE "delivery_providers" ADD COLUMN IF NOT EXISTS "apiCredentials" TEXT;
ALTER TABLE "delivery_providers" ADD COLUMN IF NOT EXISTS "credentialsUpdatedAt" TIMESTAMP(3);
ALTER TABLE "delivery_providers" ADD COLUMN IF NOT EXISTS "credentialsUpdatedById" TEXT;
