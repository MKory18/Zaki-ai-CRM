-- Removes permissions that no longer mean anything.
--
-- The CRM module was deleted in Stage 2 and its tables dropped, but 108 CRM
-- permissions were still granted across four roles. A permission nothing can
-- enforce is worse than a missing one: it appears on the roles screen as a
-- granted capability, so an admin reads it as access that exists.
--
-- The others listed here promise actions the system deliberately refuses:
-- an order is VOIDED, never deleted, and a user is deactivated rather than
-- removed, because their claim history and audit trail must survive them.
--
-- Nothing anybody can currently do is taken away. Every key removed here is
-- checked by no route, no API and no alias — verified by
-- scripts/audit-permissions.ts, which fails the build if the list drifts.

DELETE FROM "role_permissions" WHERE "permission" LIKE 'crm.%';
DELETE FROM "user_permissions" WHERE "permission" LIKE 'crm.%';

DELETE FROM "role_permissions" WHERE "permission" IN (
  'orders.delete', 'users.delete', 'users.manage', 'users.manage_roles',
  'moderators.manage', 'apps.manage', 'landing_pages.analytics',
  'categories.create', 'categories.edit', 'categories.delete',
  'customers.edit', 'customers.freeze', 'customers.unfreeze',
  'telegram.receive_orders'
);
DELETE FROM "user_permissions" WHERE "permission" IN (
  'orders.delete', 'users.delete', 'users.manage', 'users.manage_roles',
  'moderators.manage', 'apps.manage', 'landing_pages.analytics',
  'categories.create', 'categories.edit', 'categories.delete',
  'customers.edit', 'customers.freeze', 'customers.unfreeze',
  'telegram.receive_orders'
);
