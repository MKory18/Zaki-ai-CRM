-- The stock ledger is now read per store, and had no index for it.
--
-- The column existed and was filled from the day stores did; only the
-- queries ignored it, so this index was never needed and never noticed.
-- Adding the filter without it turns every ledger page into a full scan of
-- the company's movements — the leak fixed and a slow screen in its place.
--
-- The column names here are the table's own: this table predates the
-- snake_case convention, so it is "companyId" and "createdAt" beside a
-- "store_id" added later. Matching the table beats matching the style.
CREATE INDEX IF NOT EXISTS "inventory_movements_company_store_created_idx"
    ON "inventory_movements" ("companyId", "store_id", "createdAt" DESC);
