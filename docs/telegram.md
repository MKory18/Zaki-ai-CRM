# تكامل تيليجرام (Telegram → Orders)

تحويل رسائل مجموعات تيليجرام المرتبطة بالنظام إلى طلبات (Orders) تلقائيًا عبر Webhook مباشر إلى Zaki Backend — بدون n8n أو خدمات وسيطة.

## المسار

```
Telegram Group/Topic → Bot → Webhook → /api/webhooks/telegram
  → Secret verification (timing-safe) → Source resolution (topic → group)
  → Idempotency (DB unique) → Parser → Validation → Product matching
  → Order creation (same transactional logic as the manual API)
```

## 1. إنشاء البوت

1. افتح [@BotFather](https://t.me/BotFather) وأرسل `/newbot` واتبع الخطوات.
2. احفظ التوكن (يبدأ عادةً بـ `123456:AA...`) — يوضع في `TELEGRAM_BOT_TOKEN` فقط على السيرفر.

## 2. إضافة البوت إلى المجموعة

1. أضف البوت إلى المجموعة/الـ Supergroup.
2. تأكد أن البوت يستطيع قراءة الرسائل: من BotFather → `/setprivacy` → اختر **Disable** (أو امنح البوت صلاحية قراءة الرسائل في المجموعة). في المجموعات ذات المواضيع (Forum) تأكد أن الرسائل تصل للبوت.

## 3. الحصول على Chat ID

- أرسل رسالة في المجموعة، ثم استخدم `https://api.telegram.org/bot<TOKEN>/getUpdates` وابحث عن `chat.id` (يبدأ عادةً بـ `-100`).
- أو استخدم بوتات معروفة مثل `@RawDataBot` لقراءة `chat.id`.

## 4. الحصول على Topic ID

في مجموعة Forum: أرسل رسالة في الموضوع المطلوب، وستجد `message_thread_id` في الـ update. لربط المجموعة بالكامل اترك الـ Topic ID فارغًا.

## 5. متغيرات البيئة

```env
TELEGRAM_BOT_TOKEN="<من BotFather>"
TELEGRAM_WEBHOOK_SECRET="<openssl rand -hex 32>"
TELEGRAM_ENCRYPTION_KEY="<openssl rand -hex 32>"
APP_URL="https://<نطاق-النظام>"
```

## 6. إعداد الويبهوك

- من صفحة `/dashboards/telegram/settings` اضغط **تسجيل / تحديث الويبهوك** (يتطلب `telegram.manage`).
- أو يدويًا:
  ```
  https://api.telegram.org/bot<TOKEN>/setWebhook?url=<APP_URL>/api/webhooks/telegram&secret_token=<SECRET>
  ```

## 7. إضافة Source

- `/dashboards/telegram` → **إضافة مجموعة** → أدخل Chat ID (و Topic ID اختياريًا).
- الشركة تُحدد تلقائيًا من جلسة المستخدم (لا يمكن إرسالها من الواجهة).

## 8. اختبار طلب

أرسل في المجموعة المرتبطة:

```
طلب جديد
الاسم: أحمد
الهاتف: 0933444555
العنوان: عرفات
المنتج: <اسم منتج موجود في النظام>
الكمية: 2
```

يجب أن يظهر الطلب في `/orders` بمصدر **Telegram**، وفي جدول الرسائل بحالة "تم إنشاء طلب".

## استكشاف الأخطاء

| المشكلة | السبب المحتمل |
|---|---|
| لا تصل أي رسائل | الويبهوك غير مُسجل أو السر غير مطابق أو البوت ليس في المجموعة |
| الحالة "تحتاج مراجعة" | المنتج غير موجود/غامض، رقم غير صالح، بيانات ناقصة — السبب ظاهر بجانب الحالة |
| `Forbidden` في السيرفر | `X-Telegram-Bot-Api-Secret-Token` لا يطابق `TELEGRAM_WEBHOOK_SECRET` |
| الرسائل لا تُحوَّل لطلبات | المجموعة غير مفعلة (isActive) أو Topic ID خاطئ |

## الأمان

- التحقق من السر بمقارنة timing-safe → 403 عند الفشل.
- Idempotency عبر قيد فريد في قاعدة البيانات (`companyId + chatId + messageId`) — نفس رسالة تيليجرام لا تنشئ طلبًا مرتين.
- السعر يُحدد من السيرفر (`product.basePrice`) دائمًا — لا يُوثق بأي سعر مذكور في تيليجرام.
- العزل بين الشركات (tenant isolation) مفروض في كل الاستعلامات والـ APIs.
- لا تُعرض أو تُسجَّل أي مفاتيح سرية في أي استجابة أو سجل.
