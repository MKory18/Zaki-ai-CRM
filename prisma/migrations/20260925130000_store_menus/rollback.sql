-- Undo 20260925130000_store_menus.
--
-- Put the footer links back on the theme before dropping the table, so a
-- shop that set links does not lose them by rolling back. Items hidden at
-- the time are carried back too: the theme had no way to hide one, and a
-- link silently vanishing is worse than one reappearing.
UPDATE "stores" s
SET "theme" = jsonb_set(
      s."theme"::jsonb,
      '{footer,links}',
      (
        SELECT jsonb_agg(jsonb_build_object('label', item->>'label', 'href', item->>'href') ORDER BY ordinality)
        FROM jsonb_array_elements(m."items"::jsonb) WITH ORDINALITY AS t(item, ordinality)
      ),
      true
    )::text
FROM "store_menus" m
WHERE m."storeId" = s."id"
  AND m."key" = 'FOOTER'
  AND s."theme" IS NOT NULL
  AND s."theme" <> ''
  AND jsonb_typeof(s."theme"::jsonb) = 'object'
  AND jsonb_typeof(m."items"::jsonb) = 'array'
  AND jsonb_array_length(m."items"::jsonb) > 0;

DROP TABLE IF EXISTS "store_menus";
