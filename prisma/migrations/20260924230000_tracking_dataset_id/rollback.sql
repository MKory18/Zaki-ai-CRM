-- Undo 20260924230000_tracking_dataset_id. Pixels fall back to sending
-- server events to their own id, which is what an empty column already did.
ALTER TABLE "tracking_pixels" DROP COLUMN IF EXISTS "capiDatasetId";
