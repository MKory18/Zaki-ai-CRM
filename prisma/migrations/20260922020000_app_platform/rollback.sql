-- Rollback: the app shelf disappears. Built-in integrations keep working —
-- they live in code and their own settings screens are untouched. External
-- apps stop being told anything, so warn their developers first.
DROP TABLE IF EXISTS "app_deliveries";
DROP TABLE IF EXISTS "app_installs";
DROP TABLE IF EXISTS "apps";
