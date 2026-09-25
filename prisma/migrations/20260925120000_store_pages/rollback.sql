-- Undo 20260925120000_store_pages. Shops lose their own pages; nothing else
-- reads this table, so no other row changes.
DROP TABLE IF EXISTS "store_pages";
