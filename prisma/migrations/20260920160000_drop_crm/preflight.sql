-- READ ONLY. Changes nothing. Run this against PRODUCTION before deploying
-- the drop, to see what is there:
--
--   psql "$DATABASE_URL" -f preflight.sql
--
-- Every row must read 0. If any does not, export that table first — the
-- migration will refuse to run anyway, but you want to know before a deploy
-- stops half way, not during one.

SELECT 'crm_companies'  AS "الجدول", count(*) AS "عدد الصفوف" FROM "crm_companies"
UNION ALL SELECT 'crm_contacts',   count(*) FROM "crm_contacts"
UNION ALL SELECT 'crm_leads',      count(*) FROM "crm_leads"
UNION ALL SELECT 'crm_deals',      count(*) FROM "crm_deals"
UNION ALL SELECT 'crm_tasks',      count(*) FROM "crm_tasks"
UNION ALL SELECT 'crm_activities', count(*) FROM "crm_activities"
UNION ALL SELECT 'crm_notes',      count(*) FROM "crm_notes"
UNION ALL SELECT 'crm_invoices',   count(*) FROM "crm_invoices"
ORDER BY 1;
