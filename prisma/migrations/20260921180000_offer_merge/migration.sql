-- OFFERS, IN ONE PLACE (additive)
--
-- There were two offer systems: `offers` on the product, and
-- `landing_page_offers` on the page. Both were referenced by `orders`, and a
-- price raised on a product never reached the page selling it.
--
-- The product's offer is the one that stays. It gains the four things the
-- landing-page version had and it lacked, so nothing is lost by merging:
--   freeQuantity   — the gift count ("3 + 1 مجاناً")
--   compareAtPrice — the struck-through "was" price, display only
--   isDefault      — which bundle is preselected
--   sortOrder      — the order they are shown in
--
-- `landing_page_offers` is NOT dropped here: live orders may reference it,
-- and dropping a table that orders point at is a destructive migration.
-- It simply stops being written to.

ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "freeQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "compareAtPrice" DOUBLE PRECISION;
ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Show the cheapest bundle first by default, so an existing product's offers
-- are in a sensible order the first time anyone looks at them.
UPDATE "offers" SET "sortOrder" = "quantity" WHERE "sortOrder" = 0;

-- Each product needs exactly one preselected bundle. Give it to the smallest
-- one, which is what every landing page defaulted to anyway.
UPDATE "offers" o SET "isDefault" = true
WHERE o."id" = (
  SELECT x."id" FROM "offers" x
  WHERE x."productId" = o."productId" AND x."status" = 'ACTIVE'
  ORDER BY x."quantity" ASC, x."createdAt" ASC
  LIMIT 1
);

CREATE INDEX IF NOT EXISTS "offers_productId_status_sortOrder_idx"
  ON "offers" ("productId", "status", "sortOrder");
