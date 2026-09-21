-- CUSTOM DOMAIN FOR A LANDING PAGE (additive)
--
-- Pages were reachable only at /lp/<slug>. An advertiser buying a domain for
-- a campaign had nowhere to point it, and a customer saw somebody else's
-- brand in the address bar of the page they were buying from.
--
-- Stored lowercase and unique ACROSS companies: a hostname belongs to
-- whoever proved it in DNS, and two companies claiming one would make the
-- proxy's answer depend on which row it read first.

ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "domain" TEXT;
ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "domainVerifiedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "landing_pages_domain_key"
  ON "landing_pages" ("domain") WHERE "domain" IS NOT NULL;
