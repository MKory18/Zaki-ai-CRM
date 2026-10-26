-- A short line the seller writes for a suggested product on the thank-you screen.
-- Additive and nullable: every existing row reads as "no line of my own".
ALTER TABLE "landing_page_recommendations" ADD COLUMN IF NOT EXISTS "blurb" VARCHAR(140);
