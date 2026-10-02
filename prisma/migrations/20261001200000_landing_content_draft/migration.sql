-- A LANDING PAGE GETS WHAT THE STOREFRONT ALREADY HAD: A DRAFT.
--
-- Until now a landing page held ONE copy of its content, and
-- `PUT /api/landing-pages/[id]/content` wrote it directly. So pressing
-- «حفظ كمسودة» on a PUBLISHED page was publishing: the half-finished
-- headline went in front of every visitor the advert was sending, and the
-- word «مسودة» on the button was simply untrue.
--
-- ONE BLOB, NOT TWELVE COLUMNS. The store's home page and its theme each
-- got their own draft column because they are two things a seller edits
-- separately. A landing page is not: the editor saves html, css, settings,
-- builderMode, theme and sections in ONE act (`contentPayload()`), and
-- publishing promotes that one act. Six draft columns would be six ways for
-- half an act to be promoted.
--
-- `contentPrevious` is ONE STEP BACK, not a history — what was live before
-- the last publish and nothing older. A seller who regrets a publish wants
-- the thing they had a minute ago, in one press; a version list is a
-- different feature and would be a different table.
--
-- CAMEL CASE, QUOTED: this table's columns are "htmlContent", not
-- "html_content". Prisma declares no @map here, so the identifier is the
-- field name and Postgres folds an unquoted one to lower case — a
-- snake_case migration adds columns nothing reads, and the failure shows up
-- as a null rather than as an error.
ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "contentDraft" TEXT;
ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "contentPrevious" TEXT;
ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "contentPublishedAt" TIMESTAMP(3);
