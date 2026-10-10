-- WHICH SHOP'S VISITORS A PIXEL IS TOLD ABOUT.
--
-- «فصل البيكسل لكل متجر وبلد حتى لو ح اولد بلد او متجر جديد».
--
-- Purely additive: two nullable columns, two foreign keys, one CHECK and an
-- index. MEASURED BEFORE WRITING THIS: `tracking_pixels` holds ZERO rows,
-- so there is no existing scope to decide for and nothing to back-fill. A
-- row written after this lands with both columns NULL, which means «every
-- store in the company» — and the screen makes the seller say so rather
-- than letting it be the shape a forgotten field takes.
--
-- ON DELETE RESTRICT on both, deliberately. Deleting a store must not
-- silently delete the pixel that was reporting its sales: somebody has to
-- decide where that pixel points now, and a cascade makes that decision by
-- throwing the row away.

ALTER TABLE "tracking_pixels"
  ADD COLUMN "storeId"   TEXT,
  ADD COLUMN "countryId" TEXT;

ALTER TABLE "tracking_pixels"
  ADD CONSTRAINT "tracking_pixels_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tracking_pixels"
  ADD CONSTRAINT "tracking_pixels_countryId_fkey"
  FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- THE THREE SCOPES ARE MUTUALLY EXCLUSIVE, and the database holds that
-- rather than only the route. A row naming both a store and a country is
-- two answers to one question: if the store is not in that country, which
-- of the two decides? There is no good answer, so the state cannot exist.
ALTER TABLE "tracking_pixels"
  ADD CONSTRAINT "tracking_pixels_one_scope_only"
  CHECK ("storeId" IS NULL OR "countryId" IS NULL);

CREATE INDEX "tracking_pixels_companyId_storeId_enabled_idx"
  ON "tracking_pixels"("companyId", "storeId", "enabled");
