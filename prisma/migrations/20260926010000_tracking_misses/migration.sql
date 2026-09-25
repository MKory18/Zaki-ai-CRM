-- A BARCODE THE COURIER DOES NOT RECOGNISE.
--
-- The poll asked about every in-transit parcel every two minutes and threw
-- away whatever came back that was not a status. A barcode the courier has
-- no record of — mistyped, cancelled at their end, lost between systems —
-- was therefore asked about for ever, silently, and the parcel sat in
-- SHIPPED until a customer rang to ask where it was.
--
-- Counting the misses lets the system say "this one is missing at the
-- courier" out loud, once, instead of asking for ever and telling nobody.
ALTER TABLE "orders" ADD COLUMN "tracking_miss_count" INTEGER NOT NULL DEFAULT 0;
-- When it was first not found, so the alert can say how long.
ALTER TABLE "orders" ADD COLUMN "tracking_missing_since" TIMESTAMP(3);
-- Set when the alert has been raised, so it is raised once and not every
-- two minutes for the rest of the parcel's life.
ALTER TABLE "orders" ADD COLUMN "tracking_missing_alerted_at" TIMESTAMP(3);
