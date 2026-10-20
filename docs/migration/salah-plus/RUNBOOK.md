# دفتر التشغيل — ترحيل صحة بلس (RUNBOOK)

## ما هذه الأداة
`scripts/migration/run.mjs` تقرأ نسخة SQL القديمة (MariaDB dump — لا تحتاج خادم MySQL حياً) وتستورد بيانات «صحة بلس» إلى قاعدة PostgreSQL التي يستخدمها التطبيق عبر Prisma.

## التشغيل

```bash
# إلزامي: مسار ملف النسخة القديمة (لا يُرفع للـ git أبداً)
export LEGACY_DUMP=/path/to/u885958873_yazeed_backup.sql

# وضع المعاينة — الافتراضي، لا يكتب أي شيء
node scripts/migration/run.mjs

# خطوة واحدة للمعاينة
node scripts/migration/run.mjs --step orders

# التنفيذ الفعلي — يكتب! يشغّل نسخة احتياطية pg_dump أولاً
# ويستلزم تحديد شركة الاستبدال صراحةً — الأداة لا تخمّن أبداً:
node scripts/migration/run.mjs --apply --wipe-company-id <uuid الشركة التجريبية>

# بدون الراية، أو بمعرّف خطأ، أو بمعرّف شركة «صحة بلس» نفسها: ترفض الأداة الحذف
# وتطبع قائمة الشركات الموجودة بهوياتها وأعدادها، ولا تحذف شيئاً.
```

الوجهة = `DATABASE_URL` من `.env` (نفس القاعدة التي يقف عليها التطبيق). **لا يوجد سطر أوامر يقلع للإنتاج تلقائياً**: من يشغّل `--apply` هو المسؤول عن التأكد أن `DATABASE_URL` يشير للقاعدة المقصودة. تحقق قبل كل تطبيق:

```sql
SELECT current_database(), inet_server_addr();  -- وهل هي إنتاج؟ توقف وتأكد مرتين
```

الخطوات بالترتيب: `backup → wipe-demo → infra → staff → customers → products → offers → orders → commissions → activity → pages → verify`
كل خطوة idempotent — إعادة التشغيل لا تكرر الطلبات أو العملاء (مفاتيح طبيعية: `SY-{legacyId}`, `LEG-{id}`, الهاتف normalized، email).

## الاستيراد إلى متجر سوريا الموجود (`--orders-only`) — قواعد 2026-10-21

```bash
node scripts/migration/run.mjs --orders-only --store-id <uuid متجر سوريا>          # معاينة
node scripts/migration/run.mjs --orders-only --store-id <uuid متجر سوريا> --apply  # تنفيذ
```

- **الحالات** (`scripts/migration/lib/legacy-map.mjs` ← `LEGACY_STATUS`): كل الطلبات مؤكدة. يُقرأ `status_id` وحده؛ أعمدة `status_order/delivery_status/payment_status` القديمة مُهمَلة.
  - مطلوب تجهيزه ← مؤكد وتم شحنه.
  - قيد التوصيل وتم استلام الطلب الملغي ← مرتجع مستلم بدون رسوم (إيصال استلام) = مغلق.
  - تم توصيله وتم استلام المبلغ ← تم الاستلام + تم التحصيل (SETTLED) = مغلق.
  - ملغي ومفقود وملغي من الشركة ← ملغي قبل الشحن.
  - مكرر ← ملغي مكرر.
  - مؤجل ← مؤجل.
  - أي `status_id` غير معروف يوقف التشغيل.
- **العنوان**: كل طلب يحمل عنوانه في `Order.deliveryAddress`. الـ migration `20261021000000_order_delivery_address` يُطبَّق **قبل** الاستيراد.
- **الأسعار**:
  - سعر البند المسجّل هو سعر البيع. سعر المتغيّر يُستعمل فقط إذا كان البند بلا سعر. الصفر المسجّل يبقى صفراً.
  - الإجمالي يُنقل كما سُجّل.
  - الفروقات تظهر في المعاينة وفي `migration-report.local.json`، ولا يُصحَّح شيء.
  - كل طلب `priceIncludesDelivery = false`، لأن التوصيل كان فوق السعر.
- **الشحن**:
  - «الباشا» يُربط بـ«Basha Delivery» الموجود (`PROVIDER_ALIASES`).
  - الشركات الناقصة تُنشأ على المتجر ومعها أسعارها من `shipping_prices`.
  - أسعار شركة موجودة لا تُلمس أبداً.
- **مُتجاهَل**: الصور والميديا والمصاريف.
- ⚠️ **لا تشغّل** `scripts/backfill-delivered-stock.ts` على هذا المتجر بعد الاستيراد: سيسحب مخزوناً لكل طلب قديم مسلَّم.
- مهمة العمولات الليلية تستثني `source = 'Legacy import'`، فالعمولات القديمة دُفعت في النظام القديم.

## المخاطر

| خطر | التخفيف |
|---|---|
| التطبيق على قاعدة خاطئة | dry-run يطبع اسم الشركة الحالية وعداداتها؛ لا يوجد `--apply` ضمن أي deploy hook |
| فقد بيانات demo عند الاستبدال | نسخة `pg_dump -Fc` تلقائية في `scripts/migration/backups/` قبل أي حذف، والفحص يرفض ملفاً < 1KB |
| حذف واسع | لا TRUNCATE/DROP/migrate reset — حذف مرتّب صريح لنطاق شركة demo فقط؛ المدير العام والأدوار العامة والإعدادات محفوظة |
| تكرار استيراد | كل خطوة تتحقق بالمفتاح الطبيعي قبل الإدراج |
| أسرار | لا كلمات مرور في الكود؛ كلمات الموظفين الجديدة تُكتب في `scripts/migration/.credentials.local.json` (git-ignored) |

## الاستعادة
1. أوقف التطبيق.
2. `pg_restore -Fc -d <DATABASE_URL> scripts/migration/backups/pre-migration-<stamp>.dump` (أو أنشئ قاعدة جديدة ووجّه إليها).
3. تحقق بعد الاستعادة: عدد الشركات/الطلبات قبل الترحيل.

## على الإنتاج (Coolify) — بعد الموافقة فقط
1. نسخة احتياطية يدوية موثقة (اسم + checksum).
2. تأكيد أن قاعدة الإنتاج هي الوجهة المقصودة.
3. `dry-run` كامل ثم مراجعة التقرير ثم `--apply` **مرة واحدة يدوياً** — الأداة ليست جزءاً من Dockerfile ولا من Start Command ولا من أي deploy hook، ولن تعمل مع كل نشر.
4. `prisma migrate reset` و`seed` ممنوعان على الإنتاج نهائياً.
