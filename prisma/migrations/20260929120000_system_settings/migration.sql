-- A SETTING THAT BELONGS TO THE INSTALLATION, NOT TO A COMPANY.
--
-- «الذكاء الاصطناعي والنصوص: المزوّد والمفتاح ... واحفظو للـ System».
--
-- Until now every setting lived in `companies.settings`, which is right for
-- a company's own choices and wrong for an AI vendor account: the key is
-- infrastructure, paid for once by whoever installed the system. Asking each
-- company to paste the same key stores one secret several times, and every
-- extra copy is another place it can leak from.
--
-- Key/value, because the thing stored is already a JSON document whose shape
-- is enforced in code. This table's job is SCOPE — one row for the whole
-- installation — not structure.
--
-- Nothing is backfilled. Measured before writing this: one company exists and
-- it has no AI key configured at all, neither per-provider nor legacy, so
-- there is nothing to move. The reader in `ai-provider.ts` still falls back to
-- a company's own stored key, so an installation that DID have one keeps
-- working without anybody touching it.
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);
