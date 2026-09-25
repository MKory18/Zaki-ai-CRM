-- Undo 20260925150000_store_domain_verification. Domains go back to being
-- unchecked; the domain itself and its routing are untouched.
ALTER TABLE "stores" DROP COLUMN IF EXISTS "domainVerifiedAt";
ALTER TABLE "stores" DROP COLUMN IF EXISTS "domainCheck";
