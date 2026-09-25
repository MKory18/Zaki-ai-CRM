-- DEDUCTIONS — PROPOSED BY THE SYSTEM, APPLIED BY A PERSON.
--
-- Nothing here becomes money on its own. The system can measure that
-- somebody arrived at 09:40; it cannot know there was a funeral, a closed
-- road, or a shift somebody swapped by phone. And the arrival time itself
-- is sometimes an ESTIMATE taken from the first order they touched, which
-- is an upper bound — taking money from a person on an upper bound is not
-- a policy, it is an error with a receipt.
--
-- So a penalty is PROPOSED, and a human APPLIES or WAIVES it. Same rule as
-- every other money in this system: no fund movement before approval.

CREATE TABLE "penalty_rules" (
  "id"            TEXT PRIMARY KEY,
  "company_id"    TEXT NOT NULL,
  -- NULL = every store of the company.
  "store_id"      TEXT,
  -- NULL = every role. Otherwise this role only.
  "role"          TEXT,
  -- LATE | ABSENT | EARLY_LEAVE | NO_ACTION — see penalties.ts
  "kind"          TEXT NOT NULL,
  -- What one unit costs: one minute late, one absent day, one untouched order.
  "per_unit"      DECIMAL(12,4) NOT NULL,
  -- Units forgiven before anything is charged at all. Ten minutes of traffic
  -- is not misconduct, and a rule with no grace produces a deduction every
  -- single day, which stops being a signal.
  "grace"         INTEGER NOT NULL DEFAULT 0,
  -- The most this rule may take from one person in one period. A cap is not
  -- a nicety: an uncapped per-minute rule can eat a salary over one illness.
  "period_cap"    DECIMAL(12,2),
  "currency_code" TEXT NOT NULL,
  "effective_from" TIMESTAMP(3) NOT NULL,
  "effective_to"   TIMESTAMP(3),
  "is_active"     BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" TEXT NOT NULL,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL
);

CREATE INDEX "penalty_rules_company_id_kind_idx" ON "penalty_rules"("company_id", "kind");
CREATE INDEX "penalty_rules_company_id_is_active_idx" ON "penalty_rules"("company_id", "is_active");

CREATE TABLE "penalties" (
  "id"            TEXT PRIMARY KEY,
  "company_id"    TEXT NOT NULL,
  "store_id"      TEXT NOT NULL,
  "user_id"       TEXT NOT NULL,
  "rule_id"       TEXT,
  "kind"          TEXT NOT NULL,
  -- The day it happened, so the same day can never be charged twice.
  "occurred_on"   DATE NOT NULL,
  -- The raw measurement, kept beside the money: 40 minutes, 1 day, 3 orders.
  -- Without it nobody can check the arithmetic a month later.
  "units"         INTEGER NOT NULL,
  "charged_units" INTEGER NOT NULL,
  "amount"        DECIMAL(12,2) NOT NULL,
  "currency_code" TEXT NOT NULL,
  -- PROPOSED | APPLIED | WAIVED | REVERSED
  "status"        TEXT NOT NULL DEFAULT 'PROPOSED',
  "note"          TEXT,
  "proposed_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decided_by_id" TEXT,
  "decided_at"    TIMESTAMP(3),
  -- Why it was waived or reversed. Required by the service, because a
  -- deduction cancelled with no reason is indistinguishable from a favour.
  "decision_note" TEXT,
  -- Reversing entries only, linked to the original — never a delete.
  "reverses_id"   TEXT,
  -- Set when it has been settled against a commission payout.
  "payout_id"     TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL
);

CREATE INDEX "penalties_company_id_user_id_status_idx" ON "penalties"("company_id", "user_id", "status");
CREATE INDEX "penalties_company_id_status_occurred_on_idx" ON "penalties"("company_id", "status", "occurred_on");
CREATE INDEX "penalties_payout_id_idx" ON "penalties"("payout_id");
CREATE UNIQUE INDEX "penalties_reverses_id_key" ON "penalties"("reverses_id");

-- One live charge per person per kind per day. A proposer that runs twice
-- must not double a deduction, and a reversed one leaves the day free for a
-- corrected charge. Partial, so REVERSED and WAIVED rows never block it.
CREATE UNIQUE INDEX "penalties_one_live_per_day"
  ON "penalties"("company_id", "user_id", "kind", "occurred_on")
  WHERE "status" IN ('PROPOSED', 'APPLIED');

ALTER TABLE "penalty_rules" ADD CONSTRAINT "penalty_rules_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "penalties" ADD CONSTRAINT "penalties_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "penalties" ADD CONSTRAINT "penalties_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "penalties" ADD CONSTRAINT "penalties_rule_id_fkey"
  FOREIGN KEY ("rule_id") REFERENCES "penalty_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "penalties" ADD CONSTRAINT "penalties_reverses_id_fkey"
  FOREIGN KEY ("reverses_id") REFERENCES "penalties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
