-- Stage 9: partial delivery and order splitting.
--
-- The money rule this exists to hold: a partially delivered order carries
-- the FULL delivery fee, never a prorated share. The courier travelled to
-- the door whether the customer took one line or all of them, so the fee is
-- owed in full and the collected amount is what actually changed hands.
--
-- collectedAmount is null on every ordinary order. That null is what lets
-- settlement tell a partial from a whole one without a second flag.

ALTER TABLE "order_items" ADD COLUMN "deliveredQty" INTEGER;
ALTER TABLE "order_items" ADD COLUMN "returnedQty"  INTEGER;

ALTER TABLE "orders" ADD COLUMN "collectedAmount" DECIMAL(12,2);
ALTER TABLE "orders" ADD COLUMN "parentOrderId"   TEXT;

CREATE INDEX "orders_parentOrderId_idx" ON "orders"("parentOrderId");

ALTER TABLE "orders" ADD CONSTRAINT "orders_parentOrderId_fkey"
  FOREIGN KEY ("parentOrderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
