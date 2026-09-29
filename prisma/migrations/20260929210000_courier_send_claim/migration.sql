-- The claim an order carries while it is being handed to the courier.
--
-- Set BEFORE the API call and cleared only on a definite refusal, so a
-- second dispatcher finds it and leaves the parcel alone. Nullable and with
-- no default: every existing order has never been claimed, which is true.
ALTER TABLE "orders" ADD COLUMN "courier_send_started_at" TIMESTAMP(3);

-- The one question asked of it: which orders are stuck mid-send.
CREATE INDEX "orders_companyId_courier_send_started_at_idx"
  ON "orders" ("companyId", "courier_send_started_at");
