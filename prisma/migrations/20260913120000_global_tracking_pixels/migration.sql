-- Global multi-platform tracking pixels (additive, safe).
-- Adds a centralized TrackingPixel table; migrates existing per-landing-page
-- Meta Pixel IDs into it (scope = LANDING_PAGES). Old landing_pages columns
-- are intentionally KEPT (removal deferred to a future migration).

CREATE TABLE "tracking_pixels" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pixelId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracking_pixels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tracking_pixels_companyId_platform_pixelId_key"
  ON "tracking_pixels"("companyId", "platform", "pixelId");
CREATE INDEX "tracking_pixels_companyId_enabled_scope_idx"
  ON "tracking_pixels"("companyId", "enabled", "scope");
CREATE INDEX "tracking_pixels_companyId_platform_enabled_idx"
  ON "tracking_pixels"("companyId", "platform", "enabled");

ALTER TABLE "tracking_pixels"
  ADD CONSTRAINT "tracking_pixels_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Data migration: existing valid+enabled landing-page Meta Pixels
-- → TrackingPixel (scope = LANDING_PAGES, one per landing page,
--   deduplicated via ON CONFLICT DO NOTHING). Meta Pixel IDs are
--   digits-only, 15-16 chars — same validation as the app.
INSERT INTO "tracking_pixels" ("id", "companyId", "platform", "name", "pixelId", "enabled", "scope", "updatedAt")
SELECT
  md5(random()::text || lp.id)::varchar || 'tp' AS id,
  lp."companyId",
  'META',
  left(lp.name, 80),
  lp."metaPixelId",
  true,
  'LANDING_PAGES',
  now()
FROM "landing_pages" lp
WHERE lp."metaPixelEnabled" = true
  AND lp."metaPixelId" ~ '^\d{15,16}$'
ON CONFLICT ("companyId", "platform", "pixelId") DO NOTHING;
