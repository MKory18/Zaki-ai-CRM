-- NOTIFICATIONS, ONE PER PERSON.
--
-- Until now ten of the eleven places that announce something wrote a
-- single row with no recipient, and every employee of the company was
-- shown it: a moderator saw every confirmation in the company, and the
-- first person to open one — or anyone pressing "mark all read" — marked
-- it read for everybody, because the read flag lived on the one row.
--
-- From here on a notification is written once per recipient, and it says
-- which store it is about, so store B's news stops reaching store A.
--
-- Additive only. One nullable column, one index, two foreign keys. The
-- legacy rows keep userId null and storeId null; the API shows them only
-- to confirmation.supervise holders, who are who they were written for.

ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "storeId" TEXT;

-- The scheduled jobs ask "was this store told today?", and the store FK's
-- cascade needs an index that starts with storeId.
CREATE INDEX IF NOT EXISTS "notifications_storeId_type_createdAt_idx"
  ON "notifications" ("storeId", "type", "createdAt");

DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A user can be hard-deleted, and a row addressed to a deleted user is
-- readable by nobody: the recipient's rows go with them.
--
-- NOT VALID: rows written before this migration may already point at a
-- user who was deleted (there was no constraint to stop it). Validating
-- would refuse the migration over them, and deleting them here would be a
-- data change hidden inside a schema change. NOT VALID enforces the rule
-- for every row written or deleted from now on and leaves the old ones be;
-- nobody can see them either way.
DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
