-- ── THE DOOR ANOTHER SYSTEM CALLS IN THROUGH ──
--
-- O7. The replies system (System 7) has worked by copy-and-paste because
-- every `/api/*` in this product needs a browser session. Two tables and
-- twelve columns are what a program needs instead: a key it can prove, a
-- memory of what it already sent, and somewhere to put the ad evidence it
-- carries.
--
-- ── NOT ONE EXISTING ROW IS TOUCHED ──
--
-- Every column added below is NULLABLE WITH NO DEFAULT. An
-- `ADD COLUMN … DEFAULT …` would write a value into all 160-odd orders —
-- a data rewrite dressed as a schema change. Nothing is dropped, nothing is
-- renamed, and no column changes type, so this migration is reversible by
-- deleting what it created.
--
-- Hand-written and applied with `prisma db execute`, then recorded with
-- `prisma migrate resolve --applied`: `prisma migrate dev` offers to reset
-- the database, and the owner's rule is that the answer is always no.

-- ── 1. A KEY ANOTHER SYSTEM CALLS IN WITH ──
--
-- `tokenHash` is the SHA-256 of the token and the token itself is stored
-- NOWHERE: it is shown once, when it is created, and no endpoint can return
-- it afterwards. So this table is not a secret that leaks — it is a list of
-- fingerprints.
--
-- The UNIQUE is on the hash, across the whole product and not per company:
-- two companies holding one key would be one company's door opening on the
-- other's data, and that is the one collision that must be impossible
-- rather than unlikely.
CREATE TABLE "system_tokens" (
  "id"              TEXT NOT NULL,
  "companyId"       TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "system"          TEXT NOT NULL,
  "tokenHash"       TEXT NOT NULL,
  "prefix"          TEXT NOT NULL,
  "scopes"          TEXT NOT NULL DEFAULT '[]',
  "rateLimitPerMin" INTEGER NOT NULL DEFAULT 60,
  "expiresAt"       TIMESTAMP(3),
  "revokedAt"       TIMESTAMP(3),
  "lastUsedAt"      TIMESTAMP(3),
  "createdById"     TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "system_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "system_tokens_tokenHash_key" ON "system_tokens" ("tokenHash");

-- One name per company, so a screen listing «نظام الردود» twice is not a
-- thing a person has to untangle.
CREATE UNIQUE INDEX "system_tokens_companyId_name_key" ON "system_tokens" ("companyId", "name");

CREATE INDEX "system_tokens_companyId_revokedAt_idx" ON "system_tokens" ("companyId", "revokedAt");

ALTER TABLE "system_tokens"
  ADD CONSTRAINT "system_tokens_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 2. THE SAME REQUEST, SENT TWICE, IS ONE ORDER ──
--
-- `UNIQUE (companyId, key)` is the whole mechanism: the second caller loses
-- the insert and reads the first one's answer back. A read-then-write would
-- let two retries arriving in the same second both find nothing and both
-- create an order — the exact duplicate this table exists to refuse.
--
-- It is a plain unique index, not a partial one, so it is expressible in
-- `schema.prisma` and `a-rule-the-schema-hides.test.ts` has nothing to
-- catch here.
CREATE TABLE "idempotency_records" (
  "id"          TEXT NOT NULL,
  "companyId"   TEXT NOT NULL,
  "key"         TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "status"      INTEGER NOT NULL,
  "response"    TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "idempotency_records_companyId_key_key" ON "idempotency_records" ("companyId", "key");

CREATE INDEX "idempotency_records_companyId_createdAt_idx" ON "idempotency_records" ("companyId", "createdAt");

ALTER TABLE "idempotency_records"
  ADD CONSTRAINT "idempotency_records_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 3. THE AD EVIDENCE AN ORDER FROM ANOTHER SYSTEM CARRIES ──
--
-- Twelve nullable columns, written only by the systems door and null on
-- every order this product's own screens raise. None of them is read by
-- pricing, by stock or by the order's state: they are what lets a media
-- buyer ask «which ad paid for this?» months later.
--
-- `externalChannel` and not `channel`: `orders` already has a `channelId`
-- pointing at the company's own list of doors, and a second column called
-- `channel` beside it would be two answers to one question.
--
-- `ctwa_clid` and `psid` arrive ENCRYPTED, under the names that say so.
-- Each identifies one person's click or one person's chat account, and the
-- owner's rule for an ad token is that it reaches no model; these do not
-- reach a screen either. They go in with `encryptSecret`, the same envelope
-- a courier password uses, and no endpoint returns them.
ALTER TABLE "orders" ADD COLUMN "externalRef"     TEXT;
ALTER TABLE "orders" ADD COLUMN "externalChannel" TEXT;
ALTER TABLE "orders" ADD COLUMN "adSourceType"    TEXT;
ALTER TABLE "orders" ADD COLUMN "adId"            TEXT;
ALTER TABLE "orders" ADD COLUMN "ctwaClidEnc"     TEXT;
ALTER TABLE "orders" ADD COLUMN "refCode"         TEXT;
ALTER TABLE "orders" ADD COLUMN "refCodeAt"       TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "touchAt"         TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "pageId"          TEXT;
ALTER TABLE "orders" ADD COLUMN "psidEnc"         TEXT;
ALTER TABLE "orders" ADD COLUMN "wabaId"          TEXT;
ALTER TABLE "orders" ADD COLUMN "conversationRef" TEXT;

-- «Which orders quoted a code?» over a column that is null on nearly every
-- row — which is exactly the shape a btree index answers cheaply.
CREATE INDEX "orders_companyId_refCode_idx" ON "orders" ("companyId", "refCode");
