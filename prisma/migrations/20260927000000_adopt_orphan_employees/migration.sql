-- Employees who were hired and never put in the company.
--
-- Self-registration creates an account with no company on purpose («no
-- permissions, no company, awaiting admin approval»), and giving that account
-- a role was supposed to adopt it. The adoption was written as
-- `admin.companyId && admin.role !== 'SUPER_ADMIN'` — and the person who
-- actually approves new staff is the owner, a PLATFORM SUPER_ADMIN with no
-- company of their own. Both halves of that condition were false for them, so
-- the employee got a role, an ACTIVE account and a working login, and kept
-- `companyId = NULL` for ever.
--
-- Every screen looks a person up with `{ id, companyId }`, so such an employee
-- was invisible to all of them at once: their own page, their access, a
-- commission rule for them. Only the users list showed them, because it alone
-- reads `companyId IS NULL` as well — which is how it survived.
--
-- SUPER_ADMIN rows are left alone: a platform administrator has no company by
-- design, and this must never quietly make one of them a member.
--
-- It runs only where the single-company rule the application already relies on
-- (`resolveSingleCompanyId`) actually holds. With none or several, it does
-- nothing rather than guess which company somebody belongs to.
UPDATE "users" u
   SET "companyId" = (SELECT c.id FROM "companies" c)
 WHERE u."companyId" IS NULL
   AND u.role <> 'SUPER_ADMIN'
   AND (SELECT COUNT(*) FROM "companies") = 1;
