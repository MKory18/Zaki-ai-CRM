-- Dropping these loses every recorded reason for a settlement difference —
-- who accepted the courier's figure and who insisted on ours. It loses no
-- money and no order: the matches themselves stay.
DROP INDEX IF EXISTS "settlement_matches_companyId_resolution_idx";
ALTER TABLE "settlement_matches" DROP COLUMN IF EXISTS "resolutionNote";
ALTER TABLE "settlement_matches" DROP COLUMN IF EXISTS "resolution";
