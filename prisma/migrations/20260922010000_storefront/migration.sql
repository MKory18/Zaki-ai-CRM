-- A PUBLIC FACE FOR A STORE (additive)
--
-- `stores` already carried `type` (SINGLE_PRODUCT | MULTI_PRODUCT) and was
-- purely an internal boundary: orders belong to it, users get access to it,
-- landing pages sit inside it. It had no public face at all.
--
-- These columns give it one, reusing the landing page's theme engine rather
-- than growing a second one: the same accent colour, the same derived
-- palette, the same stylesheet.

ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "storefrontEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "theme" TEXT;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "tagline" TEXT;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "about" TEXT;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "supportPhone" TEXT;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "domain" TEXT;

-- A hostname belongs to whoever proved it in DNS. Unique across every store
-- AND checked against landing pages when one is claimed, so the proxy can
-- never find two answers for one host.
CREATE UNIQUE INDEX IF NOT EXISTS "stores_domain_key"
  ON "stores" ("domain") WHERE "domain" IS NOT NULL;
