-- Reverses 20260926060000_two_factor.
--
-- THIS TURNS THE SECOND FACTOR OFF FOR EVERYONE, and the enrolled secrets are
-- gone with it: every owner, manager and accountant will have to enrol again
-- from a new QR code. Nothing else is touched — passwords, sessions and
-- tokenVersion are untouched, so nobody is locked out by running it.
DROP TABLE IF EXISTS "two_factor_recovery_codes";
ALTER TABLE "users" DROP COLUMN IF EXISTS "totpLastStep";
ALTER TABLE "users" DROP COLUMN IF EXISTS "totpEnabledAt";
ALTER TABLE "users" DROP COLUMN IF EXISTS "totpSecretEnc";
