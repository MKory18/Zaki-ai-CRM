-- A shop's own pages: who we are, the terms, the privacy policy, how
-- returns work, how to reach us.
--
-- Not landing pages. A landing page sells one product and carries offers, a
-- pixel and an order form; these are the words a shop must have. The three
-- legal ones are created with every store from now on, and backfilled for
-- the stores that already exist, because a missing privacy policy stops an
-- advertising account's review — and a seller should not find that out on
-- the morning of the campaign.
--
-- Additive: one new table. Nothing existing is read or written differently.
CREATE TABLE IF NOT EXISTS "store_pages" (
  "id"          TEXT NOT NULL,
  "companyId"   TEXT NOT NULL,
  "storeId"     TEXT NOT NULL,
  "slug"        TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "body"        TEXT NOT NULL,
  "kind"        TEXT NOT NULL DEFAULT 'CUSTOM',
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "store_pages_pkey" PRIMARY KEY ("id")
);

-- One address per page within a shop.
CREATE UNIQUE INDEX IF NOT EXISTS "store_pages_storeId_slug_key" ON "store_pages" ("storeId", "slug");
-- The public read: this shop's published pages.
CREATE INDEX IF NOT EXISTS "store_pages_storeId_isPublished_idx" ON "store_pages" ("storeId", "isPublished");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_pages_storeId_fkey') THEN
    ALTER TABLE "store_pages"
      ADD CONSTRAINT "store_pages_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill: the three legal pages for every store that already exists.
-- Left UNPUBLISHED on purpose. The default text is a skeleton with the
-- shop's name in it, and publishing a policy the seller has not read would
-- be putting words in their mouth — the screen says which are still drafts.
INSERT INTO "store_pages" ("id", "companyId", "storeId", "slug", "title", "body", "kind", "isPublished", "sortOrder", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  s."companyId",
  s."id",
  d.slug,
  d.title,
  replace(d.body, '{{store}}', s."name"),
  d.kind,
  false,
  d.sort,
  now(),
  now()
FROM "stores" s
CROSS JOIN (VALUES
  ('privacy', 'سياسة الخصوصية', 'PRIVACY', 1,
   E'يوضّح هذا النصّ كيف يتعامل «{{store}}» مع بياناتك.\n\nما نجمعه: اسمك ورقم هاتفك وعنوانك، وهي ما نحتاجه لتوصيل طلبك والاتصال بك بشأنه.\n\nكيف نستعمله: لتنفيذ الطلب وتوصيله ومتابعته معك، ولا شيء غير ذلك.\n\nمع من نتشاركه: شركة الشحن التي توصّل طلبك، بالقدر الذي يلزمها للوصول إليك. لا نبيع بياناتك ولا نؤجّرها لأحد.\n\nحقوقك: تستطيع أن تطلب منّا حذف بياناتك أو تصحيحها بالاتصال بنا.\n\n— راجع هذا النصّ وعدّله ليطابق ما تفعله فعلاً قبل نشره.'),
  ('terms', 'الشروط والأحكام', 'TERMS', 2,
   E'بطلبك من «{{store}}» فأنت توافق على ما يلي.\n\nالطلب: يُعتبر الطلب مؤكَّداً بعد اتصالنا بك وتأكيدك له.\n\nالسعر والدفع: السعر المعروض يشمل ما هو مذكور في صفحة المنتج. الدفع عند الاستلام ما لم يُذكر خلاف ذلك.\n\nالتوصيل: مدّة التوصيل تقديرية وقد تتأثّر بالظروف خارج سيطرتنا.\n\nالإلغاء: يمكنك إلغاء الطلب قبل شحنه بالاتصال بنا.\n\n— راجع هذا النصّ وعدّله ليطابق سياستك الفعلية قبل نشره.'),
  ('refund', 'سياسة الاستبدال والإرجاع', 'REFUND', 3,
   E'سياسة «{{store}}» في الاستبدال والإرجاع.\n\nمتى يُقبل الإرجاع: إذا وصلك المنتج تالفاً أو مخالفاً لما طلبته، تواصل معنا وسنعالج الأمر.\n\nالمدّة: أبلغنا خلال المدّة المذكورة في تأكيد طلبك.\n\nحالة المنتج: يجب أن يكون بحالته وتغليفه الأصليين.\n\nكيف تطلب الإرجاع: اتصل بنا على رقم الدعم المذكور في أسفل الصفحة.\n\n— راجع هذا النصّ وعدّله ليطابق سياستك الفعلية قبل نشره.')
) AS d(slug, title, kind, sort, body)
ON CONFLICT ("storeId", "slug") DO NOTHING;
