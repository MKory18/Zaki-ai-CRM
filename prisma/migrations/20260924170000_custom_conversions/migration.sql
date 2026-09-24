-- CUSTOM CONVERSIONS, SENT FROM THE SERVER.
--
-- The browser pixel stays exactly as it is. This adds a second, separate
-- path: events our own server sends to Meta at a moment the seller chooses
-- in their order lifecycle, under event names of their own, so nothing
-- here can be double-counted against what the browser already sends.
--
-- Additive only. Three nullable columns and two new tables; no existing
-- column changes type, loses a default, or gains a constraint.

-- The Conversions API token, on the pixel it belongs to.
-- Nullable: a pixel with no token is browser-only, which is every pixel
-- that exists today and stays the default.
ALTER TABLE "tracking_pixels" ADD COLUMN IF NOT EXISTS "capiToken"     TEXT;
ALTER TABLE "tracking_pixels" ADD COLUMN IF NOT EXISTS "capiTokenHint" TEXT;
ALTER TABLE "tracking_pixels" ADD COLUMN IF NOT EXISTS "capiTestCode"  TEXT;

-- What the seller decided: this moment, this name, this number.
CREATE TABLE IF NOT EXISTS "custom_conversions" (
  "id"            TEXT NOT NULL,
  "company_id"    TEXT NOT NULL,
  "pixel_id"      TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "event_name"    TEXT NOT NULL,
  "trigger"       TEXT NOT NULL,
  "value_source"  TEXT NOT NULL DEFAULT 'ORDER_TOTAL',
  "enabled"       BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "custom_conversions_pkey" PRIMARY KEY ("id")
);

-- One conversion per pixel per name per moment. Two rows that differ in
-- none of those three would send Meta the same event twice for one order.
CREATE UNIQUE INDEX IF NOT EXISTS "custom_conversions_pixel_event_trigger_key"
  ON "custom_conversions" ("pixel_id", "event_name", "trigger");
CREATE INDEX IF NOT EXISTS "custom_conversions_company_enabled_idx"
  ON "custom_conversions" ("company_id", "enabled");

-- The outbox. No personal data: the order id is here and the customer is
-- re-read at send time, so this table never becomes a second copy of the
-- customer database.
CREATE TABLE IF NOT EXISTS "conversion_deliveries" (
  "id"              TEXT NOT NULL,
  "company_id"      TEXT NOT NULL,
  "conversion_id"   TEXT NOT NULL,
  "order_id"        TEXT NOT NULL,
  "event_id"        TEXT NOT NULL,
  "status"          TEXT NOT NULL DEFAULT 'PENDING',
  "attempts"        INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMP(3),
  "last_error"      TEXT,
  "sent_at"         TIMESTAMP(3),
  "match_quality"   DOUBLE PRECISION,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversion_deliveries_pkey" PRIMARY KEY ("id")
);

-- THE GUARANTEE AGAINST DOUBLE COUNTING.
-- A retry, a replay, two workers running at once, or a status set to
-- DELIVERED twice all collapse onto the row that already exists.
CREATE UNIQUE INDEX IF NOT EXISTS "conversion_deliveries_conversion_order_key"
  ON "conversion_deliveries" ("conversion_id", "order_id");
-- The worker's only query: what is due.
CREATE INDEX IF NOT EXISTS "conversion_deliveries_status_next_idx"
  ON "conversion_deliveries" ("status", "next_attempt_at");
CREATE INDEX IF NOT EXISTS "conversion_deliveries_company_created_idx"
  ON "conversion_deliveries" ("company_id", "created_at");

DO $$ BEGIN
  ALTER TABLE "custom_conversions" ADD CONSTRAINT "custom_conversions_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "custom_conversions" ADD CONSTRAINT "custom_conversions_pixel_id_fkey"
    FOREIGN KEY ("pixel_id") REFERENCES "tracking_pixels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "conversion_deliveries" ADD CONSTRAINT "conversion_deliveries_conversion_id_fkey"
    FOREIGN KEY ("conversion_id") REFERENCES "custom_conversions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "conversion_deliveries" ADD CONSTRAINT "conversion_deliveries_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
