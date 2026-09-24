-- Removes campaigns. Orders are untouched apart from losing the column that
-- named which campaign brought them: an order is a real sale whatever we
-- later decide about how we attribute it.
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_campaign_id_fkey";
DROP INDEX IF EXISTS "orders_company_store_campaign_idx";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "campaignId";
DROP TABLE IF EXISTS "campaigns";
