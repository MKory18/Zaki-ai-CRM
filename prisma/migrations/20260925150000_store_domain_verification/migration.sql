-- Whether a store's domain is actually pointed at us.
--
-- The domain column has existed for a while and nothing ever checked it: a
-- seller typed a hostname and the screen showed it back. `domainVerifiedAt`
-- is only ever written by a real check (src/lib/domain-verify.ts) — a TXT
-- token only this installation can compute, AND DNS resolving here. A badge
-- that means "the seller pressed a button" is worse than no badge: it tells
-- them the shop is reachable while every customer gets an error.
--
-- `domainCheck` holds the last result so the screen can say WHICH half is
-- missing without re-querying DNS on every render.
--
-- Additive: two nullable columns. Existing stores read as never-checked,
-- which is what they are.
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "domainVerifiedAt" TIMESTAMP(3);
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "domainCheck" TEXT;
