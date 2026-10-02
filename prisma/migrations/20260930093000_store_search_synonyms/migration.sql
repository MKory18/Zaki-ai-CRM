-- A shop's own vocabulary: pairs of words it treats as the same thing.
--
-- Nullable, no default. A shop that never writes one searches exactly as
-- it does today. Additive only: nothing is dropped and no stored value is
-- rewritten.
ALTER TABLE "stores" ADD COLUMN "searchSynonyms" TEXT;
