-- Rollback: the store returns to being an internal boundary only. Any
-- domain pointed at a storefront stops resolving, so change the DNS first.
DROP INDEX IF EXISTS "stores_domain_key";
ALTER TABLE "stores" DROP COLUMN IF EXISTS "domain";
ALTER TABLE "stores" DROP COLUMN IF EXISTS "supportPhone";
ALTER TABLE "stores" DROP COLUMN IF EXISTS "about";
ALTER TABLE "stores" DROP COLUMN IF EXISTS "tagline";
ALTER TABLE "stores" DROP COLUMN IF EXISTS "theme";
ALTER TABLE "stores" DROP COLUMN IF EXISTS "storefrontEnabled";
