-- ─── Landing Page Meta Pixel (additive only) ───
-- Per-page Meta/Facebook Pixel configuration. Pixel ID is the ONLY stored
-- value (digits, validated server-side) — no JavaScript or HTML is stored.
-- disabled/empty → the Pixel script is never loaded.

ALTER TABLE "landing_pages" ADD COLUMN "metaPixelId" TEXT;
ALTER TABLE "landing_pages" ADD COLUMN "metaPixelEnabled" BOOLEAN NOT NULL DEFAULT false;