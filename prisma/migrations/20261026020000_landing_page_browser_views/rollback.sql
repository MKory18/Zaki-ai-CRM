-- Undo 20261026020000_landing_page_browser_views. Only the browser's comparison count is lost; the server's
-- "landing_page_views" and the lifetime viewsCount are untouched.
DROP TABLE IF EXISTS "landing_page_browser_views";
