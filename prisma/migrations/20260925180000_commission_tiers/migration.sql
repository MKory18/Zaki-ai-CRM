-- محرّك العمولة: مقياس وفترة وشرائح — والقاعدة تبقى قاعدة.
--
-- القاعدة اليوم رقم واحد: نسبة أو مبلغ ثابت على كل طلب مسلَّم. وهذا شكل
-- واحد من ستة يحتاجها المالك: شرائح على عدد المؤكَّد اليومي، شرائح شهرية
-- على ما جلبه المودريتور، عتبة على نسبة التسليم، أهداف على منتج بعينه،
-- وقطع الكروس سيل.
--
-- إضافي بالكامل: كل عمود له قيمة افتراضية تطابق سلوك اليوم بالضبط، فكل
-- قاعدة قائمة تبقى تعمل كما هي بلا لمسها — ORDER_DELIVERED لكل طلب.
ALTER TABLE "commission_rules"
  ADD COLUMN IF NOT EXISTS "metric" TEXT NOT NULL DEFAULT 'ORDER_DELIVERED',
  ADD COLUMN IF NOT EXISTS "period" TEXT NOT NULL DEFAULT 'PER_ORDER',
  ADD COLUMN IF NOT EXISTS "tiers" JSONB,
  -- منتج بعينه: هدف على منتج واحد لا على كل المبيعات.
  ADD COLUMN IF NOT EXISTS "product_id" TEXT,
  -- الحد الأدنى لعدد الطلبات قبل أن تُطبَّق قاعدة نسبة التسليم. العمود
  -- minSampleOrders موجود منذ البداية ولا يقرؤه أحد؛ هذا الترحيل يصله
  -- بالمحرّك بدل إضافة عمود ثانٍ بالمعنى نفسه.
  ADD COLUMN IF NOT EXISTS "min_orders" INTEGER;

CREATE INDEX IF NOT EXISTS "commission_rules_company_metric_idx"
  ON "commission_rules" ("companyId", "metric", "isActive");

-- قيد الفترة: عمولة لا يولّدها طلب واحد.
--
-- «١٥٠ طلباً مؤكَّداً في اليوم ← كذا لكل طلب» لا يُعرف إلا عند إغلاق اليوم،
-- ولا يوجد طلب واحد يحملها. فصار ربط الطلب اختيارياً، والقيد يحمل مدى
-- فترته وعدد ما احتُسب عليه — فيبقى كل رقم قابلاً للرجوع إلى مصدره،
-- وهو شرط المالك.
ALTER TABLE "commission_entries"
  ALTER COLUMN "orderId" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "period_start" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "period_end" TIMESTAMP(3),
  -- ما احتُسب عليه: عدد الطلبات، والشريحة التي وقع فيها.
  ADD COLUMN IF NOT EXISTS "counted" INTEGER,
  ADD COLUMN IF NOT EXISTS "tier_label" TEXT;

-- قيد فترة واحد لكل (قاعدة، موظف، بداية فترة): المهمة المجدولة قد تُعاد
-- وقد تعمل مرتين، ولا يجوز أن تدفع مرتين.
CREATE UNIQUE INDEX IF NOT EXISTS "commission_entries_period_key"
  ON "commission_entries" ("userId", "ruleId", "period_start")
  WHERE "period_start" IS NOT NULL AND "status" <> 'REVERSED';
