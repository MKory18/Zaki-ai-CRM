-- «الدراج اند دروب وترتيب الحملات»: the place the seller dragged each campaign to. Additive only; 0 for every row,
-- so the list reads in its old order (status, then newest) until somebody drags it.
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "campaigns_company_id_store_id_sort_order_idx" ON "campaigns" ("company_id", "store_id", "sort_order");
