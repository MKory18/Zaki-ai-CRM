-- ─── Landing Page Editor (additive only) ───
-- Custom CSS + page settings for the built-in HTML/CSS editor.
-- No existing columns are touched; htmlContent keeps its meaning.

ALTER TABLE "landing_pages" ADD COLUMN "cssContent" TEXT;
ALTER TABLE "landing_pages" ADD COLUMN "pageSettings" TEXT;
