-- Back to a user on every challenge. The LOGIN rows have none, so they are
-- removed first: they are single-use tickets with a five-minute life, and
-- one that disappears costs somebody one more tap on the fingerprint.
DELETE FROM "passkey_challenges" WHERE "userId" IS NULL;
ALTER TABLE "passkey_challenges" ALTER COLUMN "userId" SET NOT NULL;
