-- Paid campaigns: what was spent, and what came back.
--
-- The platforms will not report spend without an ad account's API keys, and
-- a seller reading their own ads manager can type the number in ten
-- seconds. So spend is entered here and everything else is MEASURED — the
-- orders, confirmations, deliveries and collected money all come from this
-- system's own records, through the same attribution engine the moderator
-- and channel reports already use.
CREATE TABLE IF NOT EXISTS "campaigns" (
    "id"              TEXT NOT NULL,
    "company_id"      TEXT NOT NULL,
    "store_id"        TEXT NOT NULL,
    "name"            TEXT NOT NULL,
    "platform"        TEXT NOT NULL DEFAULT 'META',
    "code"            TEXT NOT NULL,
    "landing_page_id" TEXT,
    "status"          TEXT NOT NULL DEFAULT 'ACTIVE',
    "start_date"      TIMESTAMP(3) NOT NULL,
    "end_date"        TIMESTAMP(3),
    "spend"           DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes"           TEXT,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL,
    "created_by_id"   TEXT,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- The code appears in the ad's link. Unique per store and never reused: an
-- order carries the campaign it resolved to, and a recycled code would move
-- last month's orders onto this month's spend.
CREATE UNIQUE INDEX IF NOT EXISTS "campaigns_company_store_code_key"
    ON "campaigns" ("company_id", "store_id", "code");

CREATE INDEX IF NOT EXISTS "campaigns_company_store_status_idx"
    ON "campaigns" ("company_id", "store_id", "status");

ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_landing_page_id_fkey"
    FOREIGN KEY ("landing_page_id") REFERENCES "landing_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The campaign that brought an order. SET NULL and not CASCADE: deleting a
-- campaign must never delete the orders it brought — the money was real.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "campaignId" TEXT;

ALTER TABLE "orders" ADD CONSTRAINT "orders_campaign_id_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "orders_company_store_campaign_idx"
    ON "orders" ("companyId", "storeId", "campaignId");
