-- WHAT THE REQUEST IS ASKING FOR.
--
-- The door was built for one of the three things an agent needs after a
-- confirmed order goes wrong on the phone: change a field. The customer
-- who says "cancel it" and the customer who says "not this week" had no
-- door at all — cancelling a confirmed order needs orders.unlock, and
-- holding one back is an operations screen she cannot open.
--
-- All three are the same act: she cannot do it herself, somebody who can
-- decides, and it is carried out through the path that already exists for
-- it. So it is the same row with a word saying which.
--
-- EDIT is the default because every row written before today is one.
ALTER TABLE "order_change_requests"
  ADD COLUMN "intent" TEXT NOT NULL DEFAULT 'EDIT';

-- A postponement names the day it is waiting for; the other two do not.
ALTER TABLE "order_change_requests"
  ADD COLUMN "postponeUntil" TIMESTAMP(3);

-- A cancellation names its reason in the company's own taxonomy, chosen by
-- the person who actually spoke to the customer. The decider reads her
-- sentence and decides; they should not also have to guess which of the
-- eight reasons she meant.
ALTER TABLE "order_change_requests"
  ADD COLUMN "cancelReason" TEXT;
