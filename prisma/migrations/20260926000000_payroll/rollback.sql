ALTER TABLE "penalties" DROP CONSTRAINT IF EXISTS "penalties_payslip_id_fkey";
DROP TABLE IF EXISTS "payslips";
ALTER TABLE "penalties" RENAME COLUMN "payslip_id" TO "payout_id";
ALTER TABLE "users" DROP COLUMN IF EXISTS "salary_amount";
ALTER TABLE "users" DROP COLUMN IF EXISTS "salary_currency";
