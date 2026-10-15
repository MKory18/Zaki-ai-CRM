-- Deciding a change request becomes a permission the owner can withdraw.
--
-- `mayDecide` in src/lib/change-request-routing.ts used to read a list of
-- four ROLE NAMES — SUPER_ADMIN, COMPANY_ADMIN, MANAGER,
-- CONFIRMATION_SUPERVISOR — and grant them authority whatever their
-- permissions. So «طلبات التعديل» on «الصلاحيات» could be unticked for
-- MANAGER and a manager went on deciding. The owner could not keep the
-- final say to himself from the one screen built for keeping it.
--
-- The names decide nothing now; `control.change_requests` decides
-- everything. This file is what makes that change invisible on the morning
-- after: the permission is granted to exactly those four roles, so the same
-- people decide as the night before — and from then on the owner unticks
-- whoever he wants out, and it holds.
--
-- Additive only: two INSERTs, no column, no drop, no row rewritten.
-- `ON CONFLICT DO NOTHING` so re-running it is a no-op.

-- ── The grant ──
-- By role NAME, because the name is what the old rule read. Both the
-- company's own roles and the system-wide templates (companyId IS NULL),
-- since both are what `user.role` resolves against.
INSERT INTO "role_permissions" ("id", "roleId", "permission", "scope")
SELECT gen_random_uuid(), r."id", 'control.change_requests', 'ALL_COMPANY'
FROM "roles" r
WHERE r."name" IN ('SUPER_ADMIN', 'COMPANY_ADMIN', 'MANAGER', 'CONFIRMATION_SUPERVISOR')
ON CONFLICT ("roleId", "permission") DO NOTHING;

-- ── And into the DEFAULTS table ──
-- «إرجاع للافتراضي» reads `role_permission_defaults`. Without these rows,
-- pressing it on a supervisor would silently take the permission away again
-- — and with the name list gone, that supervisor would stop being able to
-- decide anything. A button that undoes a migration is a bug that looks
-- like a feature.
INSERT INTO "role_permission_defaults" ("id", "roleId", "permission", "scope")
SELECT gen_random_uuid(), r."id", 'control.change_requests', 'ALL_COMPANY'
FROM "roles" r
WHERE r."name" IN ('SUPER_ADMIN', 'COMPANY_ADMIN', 'MANAGER', 'CONFIRMATION_SUPERVISOR')
ON CONFLICT ("roleId", "permission") DO NOTHING;
