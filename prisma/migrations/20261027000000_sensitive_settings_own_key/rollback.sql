-- Rollback for 20261027000000_sensitive_settings_own_key.
-- Run ONLY after the code that removed the settings.manage alias is reverted:
-- without the alias, these rows are what keeps the sensitive doors open.
-- Removes only the rows that migration wrote (ids starting with 'rv149-').
-- A row the owner saved again since then has a new id and is his — it stays.
DELETE FROM "user_permissions"         WHERE "id" LIKE 'rv149-%';
DELETE FROM "role_permission_defaults" WHERE "id" LIKE 'rv149-%';
DELETE FROM "role_permissions"         WHERE "id" LIKE 'rv149-%';
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261027000000_sensitive_settings_own_key';
