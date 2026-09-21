-- A courier is not a platform.
--
-- Basha Delivery ships through LogesTechs under account 744; another courier
-- could ship through the same platform under a different account. So which
-- adapter a courier runs on, and that account's own ids, belong to the
-- courier row rather than to the environment.
--
-- Credentials deliberately do NOT live here. The account email and password
-- stay in the environment, out of the database and out of any API response.

ALTER TABLE "delivery_providers" ADD COLUMN "adapterCode" TEXT;
ALTER TABLE "delivery_providers" ADD COLUMN "apiConfig"   JSONB;
