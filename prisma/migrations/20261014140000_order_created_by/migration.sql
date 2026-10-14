-- ═══════════════════════════════════════════════════════════════════════
-- WHO ENTERED THIS ORDER.
--
-- `moderatorId` only ever recorded a MODERATOR. An order typed by a
-- confirmation agent, imported by a supervisor, or pulled out of a pasted
-- message had no creator on it at all — the fact survived only in activity
-- and audit rows, which no list can filter by.
--
-- ADDITIVE AND NULLABLE, AND NOT BACKFILLED:
--   · a public storefront order has no staff creator and must keep none;
--   · an order from before this column cannot have one invented for it,
--     and «visible by claim, as today» is the rule for those.
--
-- ON DELETE SET NULL, like every other staff reference on this table: an
-- employee leaving must never take an order's row with them.
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE "orders" ADD COLUMN "createdById" TEXT;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- The list filter reads «orders this company's user entered», so the index
-- carries the tenant first — the same shape the moderator index has.
CREATE INDEX "orders_companyId_createdById_idx" ON "orders"("companyId", "createdById");

-- ═══════════════════════════════════════════════════════════════════════
-- A MODERATOR SEES THE ORDERS HE ENTERED, NOT EVERY ORDER IN THE STORE.
--
-- The contract gives the moderator his own orders. The seeded template gave
-- `orders.view` the ALL_COMPANY scope, so every moderator account reads the
-- whole store's orders with the customers' names and phones on them.
--
-- ONLY ROWS THAT STILL HOLD THE TEMPLATE VALUE. A company that deliberately
-- widened or narrowed its own moderator role has made a decision, and a
-- migration that overwrote it would be taking that decision back without
-- asking. `scope = 'ALL_COMPANY'` is exactly the untouched default.
-- ═══════════════════════════════════════════════════════════════════════
UPDATE "role_permissions" rp
SET "scope" = 'OWN'
FROM "roles" r
WHERE rp."roleId" = r."id"
  AND r."name" = 'MODERATOR'
  AND rp."permission" = 'orders.view'
  AND rp."scope" = 'ALL_COMPANY';
