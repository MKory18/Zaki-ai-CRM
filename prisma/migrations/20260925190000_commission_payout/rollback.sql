-- تراجع 20260925190000_commission_payout.
-- الصرفات تُحذف، والقيود تعود «مستحقة» غير مدفوعة. حركات المحافظ التي
-- كُتبت لا تُمس: لا حذف مالي، والحركة العكسية وحدها تلغي حركة.
BEGIN;
ALTER TABLE "commission_entries" DROP CONSTRAINT IF EXISTS "commission_entries_payout_id_fkey";
UPDATE "commission_entries" SET "status" = 'PAYABLE' WHERE "payout_id" IS NOT NULL AND "status" = 'PAID';
DROP INDEX IF EXISTS "commission_entries_payout_idx";
ALTER TABLE "commission_entries" DROP COLUMN IF EXISTS "payout_id";
ALTER TABLE "commission_payouts" DROP CONSTRAINT IF EXISTS "commission_payouts_walletId_fkey";
DROP TABLE IF EXISTS "commission_payouts";
ALTER TABLE "users" DROP COLUMN IF EXISTS "commission_currency";
COMMIT;
