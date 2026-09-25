-- Undo 20260925140000_store_redirects. Old addresses stop forwarding and
-- answer 404 again, as they did before. Nothing else reads this table.
DROP TABLE IF EXISTS "store_redirects";
