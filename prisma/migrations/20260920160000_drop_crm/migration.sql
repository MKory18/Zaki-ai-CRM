-- Drop the CRM module.
--
-- The screens and APIs were removed in Stage 2; these eight tables are all
-- that was left. Nothing outside the CRM points at them — every foreign key
-- is CRM→CRM or CRM→(companies|users) — so the drop is self-contained.
--
-- SAFETY: this migration REFUSES to run if any CRM table holds a single row.
-- It is not a warning; it raises, and because the migration runs inside a
-- transaction the whole thing rolls back and nothing is dropped. Deleting a
-- customer record that someone still needs is not recoverable, so the check
-- is part of the migration rather than a note in a runbook.

DO $$
DECLARE
  t   TEXT;
  n   BIGINT;
  hits TEXT := '';
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'crm_activities', 'crm_notes', 'crm_tasks', 'crm_invoices',
    'crm_deals', 'crm_leads', 'crm_contacts', 'crm_companies'
  ] LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
      CONTINUE; -- already dropped
    END IF;
    EXECUTE format('SELECT count(*) FROM %I', t) INTO n;
    IF n > 0 THEN
      hits := hits || format('%s: %s rows, ', t, n);
    END IF;
  END LOOP;

  IF hits <> '' THEN
    RAISE EXCEPTION
      'REFUSING to drop the CRM module: it still holds data (%). Export or clear it first, then re-run.',
      rtrim(hits, ', ');
  END IF;
END $$;

-- DropForeignKey
ALTER TABLE "crm_activities" DROP CONSTRAINT "crm_activities_companyId_fkey";
ALTER TABLE "crm_activities" DROP CONSTRAINT "crm_activities_crmContactId_fkey";
ALTER TABLE "crm_activities" DROP CONSTRAINT "crm_activities_crmDealId_fkey";
ALTER TABLE "crm_activities" DROP CONSTRAINT "crm_activities_crmLeadId_fkey";
ALTER TABLE "crm_activities" DROP CONSTRAINT "crm_activities_userId_fkey";
ALTER TABLE "crm_companies" DROP CONSTRAINT "crm_companies_companyId_fkey";
ALTER TABLE "crm_contacts" DROP CONSTRAINT "crm_contacts_companyId_fkey";
ALTER TABLE "crm_contacts" DROP CONSTRAINT "crm_contacts_crmCompanyId_fkey";
ALTER TABLE "crm_contacts" DROP CONSTRAINT "crm_contacts_ownerId_fkey";
ALTER TABLE "crm_deals" DROP CONSTRAINT "crm_deals_assignedToId_fkey";
ALTER TABLE "crm_deals" DROP CONSTRAINT "crm_deals_companyId_fkey";
ALTER TABLE "crm_deals" DROP CONSTRAINT "crm_deals_crmCompanyId_fkey";
ALTER TABLE "crm_deals" DROP CONSTRAINT "crm_deals_crmContactId_fkey";
ALTER TABLE "crm_invoices" DROP CONSTRAINT "crm_invoices_companyId_fkey";
ALTER TABLE "crm_invoices" DROP CONSTRAINT "crm_invoices_crmCompanyId_fkey";
ALTER TABLE "crm_invoices" DROP CONSTRAINT "crm_invoices_crmContactId_fkey";
ALTER TABLE "crm_invoices" DROP CONSTRAINT "crm_invoices_crmDealId_fkey";
ALTER TABLE "crm_leads" DROP CONSTRAINT "crm_leads_assignedToId_fkey";
ALTER TABLE "crm_leads" DROP CONSTRAINT "crm_leads_companyId_fkey";
ALTER TABLE "crm_notes" DROP CONSTRAINT "crm_notes_companyId_fkey";
ALTER TABLE "crm_notes" DROP CONSTRAINT "crm_notes_crmCompanyId_fkey";
ALTER TABLE "crm_notes" DROP CONSTRAINT "crm_notes_crmContactId_fkey";
ALTER TABLE "crm_notes" DROP CONSTRAINT "crm_notes_crmDealId_fkey";
ALTER TABLE "crm_notes" DROP CONSTRAINT "crm_notes_crmLeadId_fkey";
ALTER TABLE "crm_notes" DROP CONSTRAINT "crm_notes_userId_fkey";
ALTER TABLE "crm_tasks" DROP CONSTRAINT "crm_tasks_assignedToId_fkey";
ALTER TABLE "crm_tasks" DROP CONSTRAINT "crm_tasks_companyId_fkey";
ALTER TABLE "crm_tasks" DROP CONSTRAINT "crm_tasks_crmContactId_fkey";
ALTER TABLE "crm_tasks" DROP CONSTRAINT "crm_tasks_crmDealId_fkey";

-- DropTable
DROP TABLE "crm_activities";
DROP TABLE "crm_notes";
DROP TABLE "crm_tasks";
DROP TABLE "crm_invoices";
DROP TABLE "crm_deals";
DROP TABLE "crm_leads";
DROP TABLE "crm_contacts";
DROP TABLE "crm_companies";
