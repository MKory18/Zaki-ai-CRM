-- Reverses 20260927020000_passkeys.
--
-- Dropping these removes every registered fingerprint. Anybody who had one
-- signs in with their authenticator code exactly as before — the passkey was
-- never the only way in, which is why this rollback is safe to run.
DROP TABLE IF EXISTS "passkey_challenges";
DROP TABLE IF EXISTS "passkeys";
