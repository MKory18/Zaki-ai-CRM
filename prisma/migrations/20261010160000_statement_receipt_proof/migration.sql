-- THE PAPER BEHIND A COLLECTION.
--
-- Five nullable columns and one CHECK. Purely additive: the ten existing
-- receipt rows are untouched and stay valid, because a receipt with no
-- paper is a real receipt — a cash handover in a doorway has none.
--
-- The CHECK is the part worth having at the database rather than only in
-- the route: either all five are present or all five are absent. A
-- half-written proof — a storage key with no hash — is worse than no proof,
-- because it looks present and cannot be verified.

ALTER TABLE "statement_receipts"
  ADD COLUMN "proofKey"  TEXT,
  ADD COLUMN "proofName" TEXT,
  ADD COLUMN "proofMime" TEXT,
  ADD COLUMN "proofSize" INTEGER,
  ADD COLUMN "proofHash" TEXT;

ALTER TABLE "statement_receipts"
  ADD CONSTRAINT "statement_receipts_proof_all_or_none"
  CHECK (
        (("proofKey" IS NULL) = ("proofName" IS NULL))
    AND (("proofKey" IS NULL) = ("proofMime" IS NULL))
    AND (("proofKey" IS NULL) = ("proofSize" IS NULL))
    AND (("proofKey" IS NULL) = ("proofHash" IS NULL))
  );
