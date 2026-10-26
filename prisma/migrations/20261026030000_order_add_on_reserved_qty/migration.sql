-- The units an order's add-on (the offer after the order, a recommended product) holds on the shelf, exactly like
-- "order_items"."reservedQty". Add-ons were money on the order and nothing on the shelf: never reserved, never drawn
-- down, never returned. Additive: a new column, zero for every existing add-on.
ALTER TABLE "order_add_ons" ADD COLUMN IF NOT EXISTS "reservedQty" INTEGER NOT NULL DEFAULT 0;
