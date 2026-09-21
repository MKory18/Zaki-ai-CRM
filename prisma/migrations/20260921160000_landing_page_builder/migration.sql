-- LANDING PAGE BUILDER (additive)
--
-- A landing page could only be authored as raw HTML. That stays — a seller
-- who has a page already keeps it, byte for byte — but it is now ONE of two
-- modes, and the new one assembles the page from themed blocks instead.
--
-- Three additive nullable columns. No existing row changes meaning: NULL
-- builder_mode reads as 'HTML', which is exactly what every existing page is.

ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "builderMode" TEXT;
ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "theme" TEXT;
ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "sections" TEXT;

-- Existing pages are HTML pages. Say so explicitly rather than relying on the
-- NULL reading, so a later NOT NULL is a one-line change and not a data hunt.
UPDATE "landing_pages" SET "builderMode" = 'HTML' WHERE "builderMode" IS NULL;
