-- When a bundle stops being for sale.
--
-- Nullable, with no default: every offer that exists today has no ending and
-- keeps behaving exactly as it did. Additive only — nothing is dropped and
-- no stored figure is rewritten.
--
-- The countdown a customer sees and the moment the price stops applying read
-- this same column. Two sources would drift, and the drift looks like a clock
-- running out while the offer carries on.
ALTER TABLE "offers" ADD COLUMN "endsAt" TIMESTAMP(3);

-- The public product page asks «which bundles are on sale right now» on every
-- view, and that question is now (status, endsAt) rather than status alone.
CREATE INDEX "offers_status_endsAt_idx" ON "offers"("status", "endsAt");
