-- The shop's home page, built from the SAME blocks a landing page is built
-- from. There is one page builder in this system; a second one would be two
-- block libraries to keep in step, and they would drift.
--
-- Two columns because the contract asks for three separate acts — save,
-- preview, publish. The seller saves and previews the DRAFT as often as they
-- like; publishing copies it to LIVE, and LIVE is the only one a shopper
-- ever sees. One column would make every save a publish.
--
-- Additive: three nullable columns. A store with neither set renders the
-- product list it always did.
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "homeDraft" TEXT;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "homeLive" TEXT;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "homePublishedAt" TIMESTAMP(3);
