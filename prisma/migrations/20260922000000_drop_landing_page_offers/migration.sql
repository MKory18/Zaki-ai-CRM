-- Drop the per-landing-page offers table.
--
-- There were two offer systems, both referenced by orders: `offers` on the
-- product and `landing_page_offers` on the page. A price raised in the
-- catalogue never reached the page selling it, and nothing in the system
-- noticed the two disagreeing. Offers now live on the product alone; every
-- code path that read this table is gone.
--
-- SAFETY: this refuses to run if the table holds a row or any order points
-- at one. It raises rather than warns, and the migration runs inside a
-- transaction, so a refusal leaves everything exactly as it was. An order
-- that cannot say what was sold on it is not recoverable.

DO $$
DECLARE
  offers  BIGINT := 0;
  linked  BIGINT := 0;
BEGIN
  IF to_regclass('public.landing_page_offers') IS NULL THEN
    RETURN; -- already dropped
  END IF;

  SELECT count(*) INTO offers FROM "landing_page_offers";
  SELECT count(*) INTO linked FROM "orders" WHERE "landingPageOfferId" IS NOT NULL;

  IF offers > 0 OR linked > 0 THEN
    RAISE EXCEPTION
      'REFUSING to drop landing_page_offers: % offer row(s) and % order(s) still reference it. Move them onto the product''s offers first.',
      offers, linked;
  END IF;
END $$;

ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_landingPageOfferId_fkey";
DROP INDEX IF EXISTS "orders_companyId_landingPageOfferId_idx";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "landingPageOfferId";
DROP TABLE IF EXISTS "landing_page_offers";
