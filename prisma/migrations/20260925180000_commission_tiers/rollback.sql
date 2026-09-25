-- تراجع 20260925180000_commission_tiers.
-- قواعد الشرائح تعود قواعد رقم واحد، وقيود الفترة تُحذف لأن عمود الطلب
-- يعود إلزامياً ولا طلب لها. القيود المربوطة بطلب لا تُمس.
BEGIN;
DROP INDEX IF EXISTS "commission_entries_period_key";
DELETE FROM "commission_entries" WHERE "period_start" IS NOT NULL;
ALTER TABLE "commission_entries"
  DROP COLUMN IF EXISTS "tier_label",
  DROP COLUMN IF EXISTS "counted",
  DROP COLUMN IF EXISTS "period_end",
  DROP COLUMN IF EXISTS "period_start";
ALTER TABLE "commission_entries" ALTER COLUMN "orderId" SET NOT NULL;
DROP INDEX IF EXISTS "commission_rules_company_metric_idx";
ALTER TABLE "commission_rules"
  DROP COLUMN IF EXISTS "min_orders",
  DROP COLUMN IF EXISTS "product_id",
  DROP COLUMN IF EXISTS "tiers",
  DROP COLUMN IF EXISTS "period",
  DROP COLUMN IF EXISTS "metric";
COMMIT;
