-- A store's favicon — the small icon in the browser tab of its pages.
--
-- The public pages had no icon of their own: they showed the framework's
-- default one (the dashboard's file), so every seller's shop and landing
-- page carried someone else's mark in the tab. A store now has its own,
-- set beside its logo in the store's settings.
--
-- Additive: one nullable column; no row is read differently.
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "favicon" TEXT;
