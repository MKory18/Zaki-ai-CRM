-- Removes the store-level pricing policy. Orders keep their own stored flag,
-- which is what every calculation reads; only new orders stop inheriting it.
ALTER TABLE "stores" DROP COLUMN IF EXISTS "priceIncludesDelivery";
