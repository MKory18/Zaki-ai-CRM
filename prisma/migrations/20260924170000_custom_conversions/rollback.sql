-- Undo 20260924170000_custom_conversions.
--
-- Safe to run: nothing outside this feature reads these tables or columns,
-- and the browser pixel was never touched. Dropping them loses the record
-- of which conversions were already sent — so a re-apply would send them
-- again. Export "conversion_deliveries" first if that matters.

DROP TABLE IF EXISTS "conversion_deliveries";
DROP TABLE IF EXISTS "custom_conversions";

ALTER TABLE "tracking_pixels" DROP COLUMN IF EXISTS "capiTestCode";
ALTER TABLE "tracking_pixels" DROP COLUMN IF EXISTS "capiTokenHint";
ALTER TABLE "tracking_pixels" DROP COLUMN IF EXISTS "capiToken";
