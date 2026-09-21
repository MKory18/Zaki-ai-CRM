-- HOLDING AN ORDER BACK FROM TODAY'S SHIPMENT (additive)
--
-- The customer rings before the parcel joins a batch: "not this week, my
-- brother is travelling". The order is confirmed and correct; it simply
-- must not go out today.
--
-- Until now the only ways to express that were both wrong. Cancelling it
-- throws away a good sale and releases stock somebody still wants. Leaving
-- it in the candidate list means it goes out on the next shipment anybody
-- creates, because nothing on the screen says otherwise.
--
-- NOT the confirmation postpone. `postponedUntil` means "call them back on
-- Thursday" and belongs to the agent on the phone; this means "do not put
-- it in a van yet" and belongs to whoever builds the shipment. One column
-- doing both would make each one lie about the other.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipHoldUntil"  TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipHoldReason" TEXT;

-- The shipment candidate list reads this on every load.
CREATE INDEX IF NOT EXISTS "orders_shipHoldUntil_idx" ON "orders" ("companyId", "shipHoldUntil");
