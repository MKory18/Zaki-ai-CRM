-- Whether a store's advertised price already contains the delivery fee.
--
-- The rule lived only on the offer, so an order taken without one — a
-- moderator typing a direct order, the commonest case — always priced as
-- price + fee. On a store that advertises delivery-inclusive prices that
-- asks the customer at the door for money the seller never advertised, and
-- the courier statement then disagrees with the order by exactly the fee.
--
-- Additive, defaulting to the behaviour every existing store already had.
ALTER TABLE "stores"
  ADD COLUMN IF NOT EXISTS "priceIncludesDelivery" BOOLEAN NOT NULL DEFAULT false;
