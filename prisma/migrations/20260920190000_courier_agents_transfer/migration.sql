-- Couriers can now be a مندوب, and an order can carry a replacement link.
--
-- kind: COMPANY (a shipping company with its own pipeline and statements) or
-- AGENT (a مندوب — immediate delivery, settled by hand). Every existing row
-- is a company, which is what the default records.
--
-- replacesOrderId: a courier is chosen once, at shipment creation. Moving a
-- parcel away from a COMPANY takes it back and raises a replacement order
-- rather than overwriting the provider, because the original is physically
-- with that company under their barcode and will appear in their statement.
-- The link keeps the pair readable from either side. Unique: an order can
-- replace at most one other.

ALTER TABLE "delivery_providers" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'COMPANY';

ALTER TABLE "orders" ADD COLUMN "replacesOrderId" TEXT;

CREATE UNIQUE INDEX "orders_replacesOrderId_key" ON "orders"("replacesOrderId");

ALTER TABLE "orders" ADD CONSTRAINT "orders_replacesOrderId_fkey"
  FOREIGN KEY ("replacesOrderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
