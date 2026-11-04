-- ── WHERE A WEB ORDER CAME FROM ──
--
-- The media buyer (its INTEGRATIONS §4.1 item 5): a landing page kept only
-- `?c=CODE`, so a web order could be tied to a campaign and never to an ad.
-- Eight columns let the page keep what the ad's link and the browser's Meta
-- cookies carry:
--
--   adsetId        the ad set id from the ad's URL parameters (`adId`, which
--                  already exists, takes the ad id the same way)
--   fbcEnc/fbpEnc  the `_fbc` / `_fbp` cookies, ENCRYPTED by the application
--                  (AES-256-GCM, `src/lib/secrets.ts`) exactly as
--                  `ctwaClidEnc` is: `_fbc` holds the click id
--   utm*           the campaign's own labels
--
-- ── NOT ONE EXISTING ROW IS TOUCHED ──
--
-- Every column is NULLABLE WITH NO DEFAULT, so this writes nothing into the
-- orders already there. Nothing is dropped, renamed or retyped, and the
-- migration is reversible by dropping the eight columns.
--
-- FOR REVIEW. Hand-written; NOT run against any database by the session that
-- wrote it. To apply (the owner's rule: never `prisma migrate dev`, which
-- offers to reset):
--   prisma db execute --file prisma/migrations/20261104000000_web_order_ad_attribution/migration.sql
--   prisma migrate resolve --applied 20261104000000_web_order_ad_attribution
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "adsetId"     TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "fbcEnc"      TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "fbpEnc"      TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "utmSource"   TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "utmMedium"   TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "utmCampaign" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "utmContent"  TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "utmTerm"     TEXT;
