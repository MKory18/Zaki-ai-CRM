-- The menu you arrange: a base per role, and one person's own on top.
--
-- Additive only: one new table, nothing dropped, no row rewritten.
--
-- One table for both because they are the same thing — a stored opinion
-- about the same menu — and because resolving them means reading both at
-- once. Exactly one of `roleId` / `userId` is set, which the CHECK below
-- enforces rather than leaving to the code that writes it.
CREATE TABLE "nav_arrangements" (
  "id"        TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "roleId"    TEXT,
  "userId"    TEXT,
  "layout"    TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "nav_arrangements_pkey" PRIMARY KEY ("id"),
  -- A row that belongs to a role AND a person belongs to neither: the
  -- resolver would read it as both a base and an override, and whichever
  -- it read second would win by accident.
  CONSTRAINT "nav_arrangements_one_owner" CHECK (
    ("roleId" IS NOT NULL AND "userId" IS NULL) OR
    ("roleId" IS NULL AND "userId" IS NOT NULL)
  )
);

-- ── ONE ROW PER OWNER, AS PARTIAL UNIQUE INDEXES ──
--
-- `@@unique([companyId, roleId])` would let a second row in whenever
-- `roleId` is NULL, because NULLs do not collide in a unique index — so
-- every personal override would satisfy it and the table would collect a
-- row per save. The WHERE is what makes each one mean «one base per role»
-- and «one override per person».
--
-- They live here and not in schema.prisma because Prisma cannot express a
-- WHERE on an index. Six other indexes in this schema are the same way,
-- which is why `pg_indexes` and not `schema.prisma` is the answer to «what
-- does the database actually enforce».
CREATE UNIQUE INDEX "nav_arrangements_role_key"
  ON "nav_arrangements" ("companyId", "roleId") WHERE "roleId" IS NOT NULL;

CREATE UNIQUE INDEX "nav_arrangements_user_key"
  ON "nav_arrangements" ("userId") WHERE "userId" IS NOT NULL;

CREATE INDEX "nav_arrangements_companyId_roleId_idx" ON "nav_arrangements" ("companyId", "roleId");
CREATE INDEX "nav_arrangements_companyId_userId_idx" ON "nav_arrangements" ("companyId", "userId");

-- A deleted role takes its base with it and its people fall back to the
-- registry; a deleted person takes their own arrangement. Enforced here
-- rather than by a cleanup job nobody runs.
ALTER TABLE "nav_arrangements" ADD CONSTRAINT "nav_arrangements_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "nav_arrangements" ADD CONSTRAINT "nav_arrangements_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "nav_arrangements" ADD CONSTRAINT "nav_arrangements_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
