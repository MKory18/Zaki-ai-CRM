-- صرف العمولة: عملة الموظف، والمحفظة التي يخرج منها المال.
--
-- القيد كان يصل إلى «مستحق» ويقف: لا شيء يحوّله إلى «مدفوع»، ولا يسحب من
-- محفظة، ولا يسجّل مصروفاً. فالدورة كانت ناقصة من طرفها الأخير.
--
-- والعملة كانت عملة الطلب دائماً. لكن الموظفة المصرية تُدفع بالجنيه وإن لم
-- تكن هناك محفظة جنيه أصلاً: تُحتسب عمولتها بالجنيه، ويخرج المال من محفظة
-- الدولار بسعر صرف يكتبه المالك لحظة الصرف — لأن المحفظة التي سيُصرف منها
-- لا تُعرف قبل ذلك.

-- عملة عمولة الموظف. فارغة = عملة المتجر كما اليوم تماماً.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "commission_currency" TEXT;

-- الصرفة: من أي محفظة خرج المال، وبأي سعر، ومتى.
CREATE TABLE IF NOT EXISTS "commission_payouts" (
  "id"            TEXT NOT NULL,
  "companyId"     TEXT NOT NULL,
  "userId"        TEXT NOT NULL,
  "walletId"      TEXT NOT NULL,
  -- ما استحقّه الموظف بعملته هو.
  "amount"        DECIMAL(14,3) NOT NULL,
  "currencyCode"  TEXT NOT NULL,
  -- ما خرج فعلاً من المحفظة، بعملتها.
  "paidAmount"    DECIMAL(14,3) NOT NULL,
  "paidCurrency"  TEXT NOT NULL,
  -- يكتبه المالك ولا يُعاد حسابه أبداً — نفس قاعدة تحويلات المحافظ.
  "exchangeRate"  DECIMAL(14,6) NOT NULL,
  "note"          TEXT,
  "createdById"   TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commission_payouts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "commission_payouts_company_user_idx"
  ON "commission_payouts" ("companyId", "userId", "createdAt");
CREATE INDEX IF NOT EXISTS "commission_payouts_wallet_idx"
  ON "commission_payouts" ("walletId");

ALTER TABLE "commission_payouts"
  ADD CONSTRAINT "commission_payouts_walletId_fkey"
  FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- أي قيد دخل أي صرفة. القيد لا يُصرف مرتين.
ALTER TABLE "commission_entries"
  ADD COLUMN IF NOT EXISTS "payout_id" TEXT;

CREATE INDEX IF NOT EXISTS "commission_entries_payout_idx"
  ON "commission_entries" ("payout_id");

ALTER TABLE "commission_entries"
  ADD CONSTRAINT "commission_entries_payout_id_fkey"
  FOREIGN KEY ("payout_id") REFERENCES "commission_payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
