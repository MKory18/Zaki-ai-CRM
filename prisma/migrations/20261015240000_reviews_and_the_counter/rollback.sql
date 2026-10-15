-- Rollback for 20261015240000_reviews_and_the_counter.
-- Run manually: psql -v ON_ERROR_STOP=1 -f rollback.sql
-- Drops only what this migration added. No pre-existing table or column is touched.
-- Also removes the migration's history row so `prisma migrate deploy` can re-apply it.
--
-- WHAT COMES BACK AND WHAT DOES NOT. `products.review_mode` returns to not
-- existing, which reads as 'manual' — the mode nobody loses anything by
-- falling back to. The reviews themselves are gone, verified ones included,
-- so this is a rollback for a release that failed on the day, not a way to
-- turn the feature off later: by then the table holds words customers wrote.

BEGIN;

ALTER TABLE "products" DROP COLUMN IF EXISTS "review_mode";

ALTER TABLE "product_reviews" DROP CONSTRAINT IF EXISTS "product_reviews_hidden_by_id_fkey";
ALTER TABLE "product_reviews" DROP CONSTRAINT IF EXISTS "product_reviews_created_by_id_fkey";
ALTER TABLE "product_reviews" DROP CONSTRAINT IF EXISTS "product_reviews_order_id_fkey";
ALTER TABLE "product_reviews" DROP CONSTRAINT IF EXISTS "product_reviews_product_id_fkey";
ALTER TABLE "product_reviews" DROP CONSTRAINT IF EXISTS "product_reviews_store_id_fkey";
ALTER TABLE "product_reviews" DROP CONSTRAINT IF EXISTS "product_reviews_companyId_fkey";

DROP INDEX IF EXISTS "product_reviews_store_idx";
DROP INDEX IF EXISTS "product_reviews_company_status_idx";
DROP INDEX IF EXISTS "product_reviews_product_status_idx";
DROP INDEX IF EXISTS "product_reviews_order_key";

DROP TABLE IF EXISTS "product_reviews";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261015240000_reviews_and_the_counter';

COMMIT;
