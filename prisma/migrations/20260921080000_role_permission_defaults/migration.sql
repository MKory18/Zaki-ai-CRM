-- The matrix a role was issued with.
--
-- "Restore defaults" needs a record of what the role started as, and the
-- editable rows cannot also be that record. The in-code legacy matrix is not
-- it either: it predates stages 2 and up, so restoring from it would strip
-- every permission added since — the opposite of an undo.
--
-- So the baseline is captured here from what the system templates hold today,
-- which for a system role IS the matrix it shipped with. A role created from
-- now on writes its own snapshot at creation.
--
-- Additive: no existing row is read differently or removed.

CREATE TABLE IF NOT EXISTS "role_permission_defaults" (
  "id"         TEXT NOT NULL,
  "roleId"     TEXT NOT NULL,
  "permission" TEXT NOT NULL,
  "scope"      TEXT NOT NULL DEFAULT 'ALL_COMPANY',
  "scopeIds"   JSONB,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "role_permission_defaults_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "role_permission_defaults_roleId_permission_key"
  ON "role_permission_defaults" ("roleId", "permission");
CREATE INDEX IF NOT EXISTS "role_permission_defaults_roleId_idx"
  ON "role_permission_defaults" ("roleId");

ALTER TABLE "role_permission_defaults"
  ADD CONSTRAINT "role_permission_defaults_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Baseline: today's matrix for every role that already exists.
INSERT INTO "role_permission_defaults" ("id", "roleId", "permission", "scope", "scopeIds")
SELECT gen_random_uuid(), rp."roleId", rp."permission", rp."scope", rp."scopeIds"
FROM "role_permissions" rp
ON CONFLICT ("roleId", "permission") DO NOTHING;
