-- A Meta dataset for the Conversions API that is not the pixel itself.
-- Additive and nullable: every existing pixel keeps sending to its own id.
ALTER TABLE "tracking_pixels" ADD COLUMN "capiDatasetId" TEXT;
