-- Blocking a customer.
--
-- Keyed on the PHONE rather than a customer row: the phone is the identity,
-- and somebody who refused delivery three times will order again under a new
-- name. Company-wide and never country-scoped — the same person is the same
-- person in every store.
--
-- A block is never deleted, only released, so who blocked whom and why
-- survives the decision to let them back.

CREATE TABLE "customer_blocks" (
    "id"            TEXT NOT NULL,
    "companyId"     TEXT NOT NULL,
    "phone"         TEXT NOT NULL,
    "name"          TEXT,
    "reason"        TEXT NOT NULL,
    "blockedById"   TEXT NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt"    TIMESTAMP(3),
    "releasedById"  TEXT,
    "releaseReason" TEXT,

    CONSTRAINT "customer_blocks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_blocks_companyId_phone_releasedAt_idx"
  ON "customer_blocks"("companyId", "phone", "releasedAt");

ALTER TABLE "customer_blocks" ADD CONSTRAINT "customer_blocks_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_blocks" ADD CONSTRAINT "customer_blocks_blockedById_fkey"
  FOREIGN KEY ("blockedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_blocks" ADD CONSTRAINT "customer_blocks_releasedById_fkey"
  FOREIGN KEY ("releasedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
