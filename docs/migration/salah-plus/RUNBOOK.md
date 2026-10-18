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
