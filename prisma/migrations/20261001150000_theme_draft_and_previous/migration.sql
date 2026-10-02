-- THE LOOK GETS WHAT THE HOME PAGE ALREADY HAD.
--
-- `theme` is what every live storefront page paints from, and until now
-- every save in the theme editor wrote it directly: a seller adjusting a
-- colour repainted the shop for every customer standing in it. The home
-- page beside it has had a draft, a publish and a confirmation since the
-- day it was written.
--
-- These are the same three columns under the same names, plus one step
-- back for each — not a history: `*Previous` holds what was live before
-- the last publish and nothing older. A seller who regrets a publish wants
-- the thing they had a minute ago, in one press; a version list is a
-- different feature and would be a different column.
--
-- CAMEL CASE, QUOTED. This table's columns are "homeDraft", not
-- "home_draft" — Prisma declares no @map here, so the identifier is the
-- field name and Postgres folds an unquoted one to lower case. A migration
-- written in snake_case adds four columns nothing reads, and the failure
-- shows up as a null, not as an error.
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "homePrevious" TEXT;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "themeDraft" TEXT;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "themePublishedAt" TIMESTAMP(3);
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "themePrevious" TEXT;
