-- A shop's five menus: the header bar, the main menu, the footer, "about",
-- and the policies.
--
-- The items are JSON on one row per menu: a menu is read whole, written
-- whole and ordered by hand, never queried by item.
--
-- THIS ALSO MOVES THE FOOTER LINKS. They briefly lived on the store's theme
-- as `footer.links`, because the contract named them in the template tab
-- AND named «التذييل» among these five menus. Two owners for one field is
-- what this section exists to stop, so the theme keeps the footer's
-- COPYRIGHT (a line of text) and its LINKS move here, where they gain an
-- order and a visibility flag. The links already saved are carried over
-- below and then removed from the theme, so nothing is edited in two places
-- and no shop loses a link it had set.
--
-- Additive: one new table. The only existing column touched is stores.theme,
-- and only to remove a key this migration has just copied elsewhere.
CREATE TABLE IF NOT EXISTS "store_menus" (
  "id"        TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "storeId"   TEXT NOT NULL,
  "key"       TEXT NOT NULL,
  "items"     TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "store_menus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "store_menus_storeId_key_key" ON "store_menus" ("storeId", "key");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_menus_storeId_fkey') THEN
    ALTER TABLE "store_menus"
      ADD CONSTRAINT "store_menus_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Carry over the footer links a shop already set, adding `visible` (they
-- were all showing) and keeping their order. Only stores whose theme holds
-- a non-empty footer.links array are touched.
INSERT INTO "store_menus" ("id", "companyId", "storeId", "key", "items", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  s."companyId",
  s."id",
  'FOOTER',
  (
    SELECT jsonb_agg(jsonb_build_object('label', link->>'label', 'href', link->>'href', 'visible', true)
                     ORDER BY ordinality)::text
    FROM jsonb_array_elements((s."theme"::jsonb -> 'footer' -> 'links')) WITH ORDINALITY AS t(link, ordinality)
  ),
  now(),
  now()
FROM "stores" s
WHERE s."theme" IS NOT NULL
  AND s."theme" <> ''
  AND (s."theme"::jsonb -> 'footer' -> 'links') IS NOT NULL
  AND jsonb_typeof(s."theme"::jsonb -> 'footer' -> 'links') = 'array'
  AND jsonb_array_length(s."theme"::jsonb -> 'footer' -> 'links') > 0
ON CONFLICT ("storeId", "key") DO NOTHING;

-- Now drop the key from the theme, so the field has exactly one owner. The
-- rest of the footer object (its copyright) is untouched.
UPDATE "stores"
SET "theme" = jsonb_set(
      "theme"::jsonb,
      '{footer}',
      ("theme"::jsonb -> 'footer') - 'links'
    )::text
WHERE "theme" IS NOT NULL
  AND "theme" <> ''
  AND jsonb_typeof("theme"::jsonb) = 'object'
  AND jsonb_typeof("theme"::jsonb -> 'footer') = 'object'
  AND ("theme"::jsonb -> 'footer' -> 'links') IS NOT NULL;
