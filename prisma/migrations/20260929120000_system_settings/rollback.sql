-- Dropping this loses the installation's AI vendor accounts, which then have
-- to be entered again. It loses no company data: nothing was moved out of
-- `companies.settings` to create it.
DROP TABLE IF EXISTS "system_settings";
