-- One stored opinion per person per SURFACE, not one per person.
--
-- `nav_arrangements` held «the menu you arrange». The same shape answers
-- every other «you arrange it» the owner asked for — the dashboard cards,
-- the orders columns, a saved view published to a role — because all of
-- them are the same three lists of keys over a set the server already
-- filtered: an order, a hidden set, a pinned set.
--
-- ── NOT ONE ROW IS TOUCHED ──
--
-- The column is NULLABLE with no default, and NULL READS AS 'nav' in
-- `nav-arrangement-store.ts`. An `ADD COLUMN … DEFAULT 'nav'` would have
-- written a value into every existing row; this writes into none, and the
-- rows that exist keep meaning exactly what they meant.
ALTER TABLE "nav_arrangements" ADD COLUMN "surface" TEXT;

-- ── AND THE TWO PARTIAL UNIQUE INDEXES GAIN IT ──
--
-- `UNIQUE (companyId, roleId) WHERE roleId IS NOT NULL` meant «one base per
-- role». With more than one surface it would mean «one base per role for
-- the WHOLE product» — so publishing a dashboard arrangement would
-- overwrite that role's menu. The surface has to be part of the key.
--
-- `COALESCE(surface, 'nav')` and not plain `surface`: two NULLs do not
-- collide in a unique index, so the old rows — the ones with no surface —
-- would stop being covered by the very rule they were created under.
--
-- Dropping and recreating an index changes no row's contents.
DROP INDEX IF EXISTS "nav_arrangements_role_key";
DROP INDEX IF EXISTS "nav_arrangements_user_key";

CREATE UNIQUE INDEX "nav_arrangements_role_surface_key"
  ON "nav_arrangements" ("companyId", "roleId", (COALESCE("surface", 'nav')))
  WHERE "roleId" IS NOT NULL;

CREATE UNIQUE INDEX "nav_arrangements_user_surface_key"
  ON "nav_arrangements" ("userId", (COALESCE("surface", 'nav')))
  WHERE "userId" IS NOT NULL;

CREATE INDEX "nav_arrangements_companyId_surface_idx"
  ON "nav_arrangements" ("companyId", "surface");
