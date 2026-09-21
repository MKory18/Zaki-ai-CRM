-- Rollback: drop the builder columns. Raw HTML pages are untouched by this
-- migration, so they survive the rollback unchanged; block-built pages lose
-- their blocks, which is the whole of what is being rolled back.
ALTER TABLE "landing_pages" DROP COLUMN IF EXISTS "sections";
ALTER TABLE "landing_pages" DROP COLUMN IF EXISTS "theme";
ALTER TABLE "landing_pages" DROP COLUMN IF EXISTS "builderMode";
