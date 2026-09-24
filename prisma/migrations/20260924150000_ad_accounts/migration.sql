-- Connected advertising accounts, and the link from a campaign to the
-- campaign it mirrors on the platform.
--
-- Per store, like everything a store owns: an ad account belongs to one
-- brand, its token is scoped to that account, and a spend figure pulled
-- into the wrong shop is worse than no figure at all.
CREATE TABLE IF NOT EXISTS "ad_accounts" (
    "id"              TEXT NOT NULL,
    "company_id"      TEXT NOT NULL,
    "store_id"        TEXT NOT NULL,
    "platform"        TEXT NOT NULL DEFAULT 'META',
    "account_id"      TEXT NOT NULL,
    "account_name"    TEXT,
    -- Encrypted before it is written, never returned by any endpoint, never
    -- in an audit entry. Only a four-character hint comes back.
    "token_encrypted" TEXT NOT NULL,
    "token_hint"      TEXT,
    "status"          TEXT NOT NULL DEFAULT 'CONNECTED',
    "last_error"      TEXT,
    "last_sync_at"    TIMESTAMP(3),
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL,
    "created_by_id"   TEXT,

    CONSTRAINT "ad_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ad_accounts_company_store_platform_account_key"
    ON "ad_accounts" ("company_id", "store_id", "platform", "account_id");

CREATE INDEX IF NOT EXISTS "ad_accounts_company_store_idx"
    ON "ad_accounts" ("company_id", "store_id");

ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Where a campaign's spend comes from, and which remote campaign feeds it.
--
-- Matching by NAME would break the first time somebody renamed a campaign
-- in Ads Manager, which is a thing people do constantly. The platform's own
-- id does not change.
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "spend_source" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "ad_account_id" TEXT;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "external_id" TEXT;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "last_sync_at" TIMESTAMP(3);

-- SET NULL, not CASCADE: disconnecting an ad account must never delete the
-- campaigns whose money it reported. The spend was real.
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_ad_account_id_fkey"
    FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
