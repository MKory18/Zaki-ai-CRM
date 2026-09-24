-- AN APPROVED CHANGE REQUEST, CARRIED OUT.
--
-- Approving a request records the decision; applying it changes the
-- order. Until now nothing recorded the second, so an approved request
-- looked the same whether it had been carried out or was still waiting —
-- and on a sealed order it could not be carried out at all.
--
-- Additive: two nullable columns. Every existing row reads as "not yet
-- applied", which is the truth: none of them could have been.

ALTER TABLE "order_change_requests" ADD COLUMN IF NOT EXISTS "appliedAt"   TIMESTAMP(3);
ALTER TABLE "order_change_requests" ADD COLUMN IF NOT EXISTS "appliedById" TEXT;

-- The queue's second list: approved and still waiting.
CREATE INDEX IF NOT EXISTS "order_change_requests_status_applied_idx"
  ON "order_change_requests" ("companyId", "status", "appliedAt");
