-- A SALARY, AND THE DEDUCTIONS THAT COME OUT OF IT.
--
-- The deductions built yesterday were recorded and decided and then reached
-- nothing: a row saying somebody owed the business forty pounds, and no
-- moment at which those forty pounds were ever taken. This is that moment.

-- What this person is paid, and in what. NULL = no salary on file, which is
-- every employee today: a salary is a deliberate entry, never a default.
ALTER TABLE "users" ADD COLUMN "salary_amount" DECIMAL(12,2);
ALTER TABLE "users" ADD COLUMN "salary_currency" TEXT;

-- The penalties column was added yesterday, has never held a row in any
-- environment, and pointed at a commission payout. A deduction is settled
-- against a PAYSLIP, so the name is corrected rather than a second column
-- added beside it doing the same job under a different word.
ALTER TABLE "penalties" RENAME COLUMN "payout_id" TO "payslip_id";
ALTER INDEX "penalties_payout_id_idx" RENAME TO "penalties_payslip_id_idx";

CREATE TABLE "payslips" (
  "id"             TEXT PRIMARY KEY,
  "company_id"     TEXT NOT NULL,
  "store_id"       TEXT NOT NULL,
  "user_id"        TEXT NOT NULL,
  -- The month (or whatever span) this pays for. One payslip per person per
  -- period start, enforced below: a month paid twice is a month paid twice.
  "period_start"   DATE NOT NULL,
  "period_end"     DATE NOT NULL,
  -- A SNAPSHOT of the salary at the moment it was paid. Reading it from the
  -- employee later would rewrite last March every time somebody gets a rise.
  "salary_amount"  DECIMAL(12,2) NOT NULL,
  "currency_code"  TEXT NOT NULL,
  -- What was taken, and what is being handed over.
  "penalty_total"  DECIMAL(12,2) NOT NULL DEFAULT 0,
  "net_amount"     DECIMAL(12,2) NOT NULL,
  -- Deductions that exceeded the salary and were NOT settled here. A
  -- payment is never negative: the remainder stays owed and is offered
  -- against the next payslip.
  "carried_over"   DECIMAL(12,2) NOT NULL DEFAULT 0,
  -- The money that actually left, in the WALLET's currency, at the rate the
  -- owner wrote at payment. Stored, never recalculated.
  "wallet_id"      TEXT NOT NULL,
  "paid_amount"    DECIMAL(14,3) NOT NULL,
  "paid_currency"  TEXT NOT NULL,
  "exchange_rate"  DECIMAL(14,6) NOT NULL,
  "note"           TEXT,
  "created_by_id"  TEXT NOT NULL,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "payslips_one_per_period" ON "payslips"("company_id", "user_id", "period_start");
CREATE INDEX "payslips_company_id_created_at_idx" ON "payslips"("company_id", "created_at");
CREATE INDEX "payslips_wallet_id_idx" ON "payslips"("wallet_id");

ALTER TABLE "payslips" ADD CONSTRAINT "payslips_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "penalties" ADD CONSTRAINT "penalties_payslip_id_fkey"
  FOREIGN KEY ("payslip_id") REFERENCES "payslips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
