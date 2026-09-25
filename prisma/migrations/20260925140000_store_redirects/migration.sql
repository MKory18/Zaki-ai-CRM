-- Old addresses that still arrive.
--
-- A seller renames a landing page's slug while an advertisement is running
-- on the old one. Every click on that ad — already paid for — lands on a
-- 404. So a rename SUGGESTS a redirect (suggested = true) and the seller
-- accepts or dismisses it: a slug changed to get AWAY from a campaign must
-- not forward, and only the seller knows which case it is.
--
-- Additive: one new table, no backfill. Nothing existing is read or written
-- differently.
CREATE TABLE IF NOT EXISTS "store_redirects" (
  "id"        TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "storeId"   TEXT NOT NULL,
  "from"      TEXT NOT NULL,
  "to"        TEXT NOT NULL,
  "kind"      INTEGER NOT NULL DEFAULT 302,
  "hits"      INTEGER NOT NULL DEFAULT 0,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "suggested" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "store_redirects_pkey" PRIMARY KEY ("id")
);

-- One redirect per old address within a shop.
CREATE UNIQUE INDEX IF NOT EXISTS "store_redirects_storeId_from_key" ON "store_redirects" ("storeId", "from");
-- The request-time read: what is live and decided.
CREATE INDEX IF NOT EXISTS "store_redirects_isActive_suggested_idx" ON "store_redirects" ("isActive", "suggested");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_redirects_storeId_fkey') THEN
    ALTER TABLE "store_redirects"
      ADD CONSTRAINT "store_redirects_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
