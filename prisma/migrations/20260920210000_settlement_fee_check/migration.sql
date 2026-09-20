-- The delivery fee becomes a matched quantity in its own right.
--
-- When the selling price INCLUDES delivery, the customer pays one figure and
-- the courier's fee comes out of it. A fee higher than agreed does not look
-- like an error: the money still arrives, just less of it. Stating what the
-- courier charged next to what we expected names the cause of a difference
-- instead of leaving it as an unexplained shortfall.

ALTER TABLE "statement_lines" ADD COLUMN "collected" DECIMAL(14,3);
ALTER TABLE "statement_lines" ADD COLUMN "fee" DECIMAL(14,3);

ALTER TABLE "settlement_matches" ADD COLUMN "expectedFee" DECIMAL(14,3);
ALTER TABLE "settlement_matches" ADD COLUMN "statementFee" DECIMAL(14,3);
ALTER TABLE "settlement_matches" ADD COLUMN "feeDifference" DECIMAL(14,3);
