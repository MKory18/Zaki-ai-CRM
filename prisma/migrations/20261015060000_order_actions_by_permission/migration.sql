-- Three order actions become permissions the owner can grant and withhold.
--
-- NOBODY LOSES A DOOR ON DEPLOY. That is the whole shape of this file: each
-- new permission is granted to exactly the roles that already hold the
-- permission the action used to ride on. The morning after this ships, every
-- role does what it did the night before — and from then on the owner unticks
-- per role on «الصلاحيات», which is the thing he could not do at all before.
--
-- Additive only: three INSERTs, no column, no drop, no data rewritten.
-- `ON CONFLICT DO NOTHING` so re-running it is a no-op.

-- ── orders.import ──
-- The import dialog has no bulk endpoint: it posts its rows to POST
-- /api/orders one call at a time, indistinguishable from somebody typing an
-- order. So «may type an order» was also «may feed a spreadsheet through»,
-- and the owner's rule is that a confirmation agent does the first and not
-- the second. Granted now to everyone who could already do it.
INSERT INTO "role_permissions" ("id", "roleId", "permission", "scope")
SELECT gen_random_uuid(), rp."roleId", 'orders.import', 'ALL_COMPANY'
FROM "role_permissions" rp
WHERE rp."permission" = 'orders.create'
ON CONFLICT ("roleId", "permission") DO NOTHING;

-- ── orders.contact_log ──
-- Recording what happened on a call had no permission of its own. The
-- contact-attempts door took `orders.edit` OR `orders.claim`; the
-- `contact_result` action rode on `orders.confirm`. Three permissions, none
-- of them about the telephone — so the union of those three is exactly who
-- could do it yesterday, and exactly who keeps doing it today.
-- The DISTINCT is on the role, not on the row: `gen_random_uuid()` differs
-- per row, so `SELECT DISTINCT uuid, roleId` would not collapse a role that
-- holds two of the three. `ON CONFLICT` would absorb the duplicate anyway,
-- but a statement whose correctness rests on the conflict clause is a
-- statement nobody can read.
INSERT INTO "role_permissions" ("id", "roleId", "permission", "scope")
SELECT gen_random_uuid(), r."roleId", 'orders.contact_log', 'ALL_COMPANY'
FROM (
  SELECT DISTINCT rp."roleId"
  FROM "role_permissions" rp
  WHERE rp."permission" IN ('orders.edit', 'orders.claim', 'orders.confirm')
) r
ON CONFLICT ("roleId", "permission") DO NOTHING;

-- ── orders.navigate ──
-- The previous/next arrows in the order window had no permission at all;
-- whoever could open an order could walk from it. So `orders.view` is who
-- held it in practice.
INSERT INTO "role_permissions" ("id", "roleId", "permission", "scope")
SELECT gen_random_uuid(), rp."roleId", 'orders.navigate', 'ALL_COMPANY'
FROM "role_permissions" rp
WHERE rp."permission" = 'orders.view'
ON CONFLICT ("roleId", "permission") DO NOTHING;

-- ── And the same three into the DEFAULTS table ──
-- «إرجاع للافتراضي» reads `role_permission_defaults`. Without these rows,
-- pressing it on any role would silently take the three new permissions away
-- again — a button that undoes a migration is a bug that looks like a
-- feature.
INSERT INTO "role_permission_defaults" ("id", "roleId", "permission", "scope")
SELECT gen_random_uuid(), d."roleId", 'orders.import', 'ALL_COMPANY'
FROM "role_permission_defaults" d
WHERE d."permission" = 'orders.create'
ON CONFLICT ("roleId", "permission") DO NOTHING;

INSERT INTO "role_permission_defaults" ("id", "roleId", "permission", "scope")
SELECT gen_random_uuid(), r."roleId", 'orders.contact_log', 'ALL_COMPANY'
FROM (
  SELECT DISTINCT d."roleId"
  FROM "role_permission_defaults" d
  WHERE d."permission" IN ('orders.edit', 'orders.claim', 'orders.confirm')
) r
ON CONFLICT ("roleId", "permission") DO NOTHING;

INSERT INTO "role_permission_defaults" ("id", "roleId", "permission", "scope")
SELECT gen_random_uuid(), d."roleId", 'orders.navigate', 'ALL_COMPANY'
FROM "role_permission_defaults" d
WHERE d."permission" = 'orders.view'
ON CONFLICT ("roleId", "permission") DO NOTHING;
