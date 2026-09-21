-- Rollback: pages return to /lp/<slug> only. Any domain pointed at the app
-- will stop resolving, so change the DNS before running this.
DROP INDEX IF EXISTS "landing_pages_domain_key";
ALTER TABLE "landing_pages" DROP COLUMN IF EXISTS "domainVerifiedAt";
ALTER TABLE "landing_pages" DROP COLUMN IF EXISTS "domain";
