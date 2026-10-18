# ترحيل «صحة بلس» (سوريا) — تقرير الفحص والتحليل وخطة الترحيل

الحالة: **تحليل فقط — لم يُنفّذ أي كتابة على أي قاعدة.** بانتظار الموافقة.
مصدر البيانات: `u885958873_yazeed_backup.sql` (phpMyAdmin dump، MariaDB 11.8.9، utf8mb3، ~28.7MB، 61 جدولاً، 264,416 صفاً).
الوجهة: PostgreSQL للمشروع الحالي (schema `prisma/schema.prisma`، ~68 موديلاً).

---

## 1. بنية قاعدة MySQL القديمة

### الجداول ذات البيانات (بالعدد)

| الجدول | الصفوف | الدور |
|---|---|---|
| `order_logs` | 169,409 | سجل تغييرات الطلبات (field/old/new/action) |
| `stock_movements` | 19,638 | حركات المخزون (stock_in/order_reserved/order_canceled/order_refunded/stock_out) |
| `addresses` | 18,822 | عنوان التسليم (full_name, phone, address, region_id) |
| `order_items` | 17,056 | بنود الطلب (product_id, variant_id, qty, price, cost) |
| `orders` | 17,021 | الطلبات (2026-03-01 → 2026-10-18) |
| `users` | 10,503 | **العملاء والموظفون في جدول واحد** — الكل role_id=NULL؛ الموظفون (23) معرفون عبر `auth_assignment` (Yii RBAC) |
| `wallet_transactions` | 10,393 | أرباح الموظف لكل طلب (reference_table='orders', value=order.profit) |
| `countries` | 245 | قائمة دول عالمية |
| `regions` | 14 | المحافظات السورية (country_id=213): دمشق، ريف دمشق، حلب، حمص، حماة، اللاذقية، طرطوس، إدلب، درعا، السويداء، القنيطرة، دير الزور، الرقة، الحسكة |
| `shipping_prices` | 70 | 5 شركات شحن × 14 محافظة، 3–5 (عملة غير موثقة) |
| `products` | 23 | منتجات بسيطة كلها (type='simple')، سعر 2–150، تكلفة 1–51 |
| `variants` | 23 | **متغير واحد لكل منتج** (variant_id == product_id في كل بنود الطلبات — 17,056/17,056) |
| `inventory` | 14 | مخزون لكل منتج (490, 204, 199,962...) |
| `auth_item` / `auth_item_child` / `auth_assignment` | 290/592/23 | RBAC Yii — 23 موظفاً |
| `bundle_quantity` | 9 | عروض الكميات (3 منتجات × 3 فئات: 1→سعر، 2→سعر، 3→سعر) |
| `status` | 10 | حالات الطلبات (بالعربية + ربط order/payment/delivery) |
| `shippings` | 5 | شركات الشحن: الباشا، ابو طلال، صالح، بريميوم، الو دليفيري |
| `payments` | 3 | COD (افتراضي)، تحويل بنكي، بطاقة |
| `settings` | 1 | إعدادات المتجر: country_id=213 (سوريا)، facebook_pixel=1575478016450023، theme=modern |
| `landing_pages` | 3 (+2 revisions, 3 bundle qtys, 3 templates) | صفحات هبوط (builder JSON v2) |
| `expense_types` | 8 | Facebook Ads، Operating، ... |
| `expenses` | 0 | — |
| `wallet_fill` / `wallet_delivery` | 0/0 | — |
| `channels` | 0 | **فارغة رغم أن كل الطلبات channel_id=1** |
| الباقي (brands, faqs, slider, contactus, ...) | 0 أو ضئيل | غير جوهري |

### حقائق لافتة
- **الطلبات**: كلها `creator_id` مضبوط (superAdmin=1: 12,102 = 71%)، `user_id` مضبوط في 10,880/17,021 (64%)، `address_id` مضبوط دائماً، `assign_to` فارغ دائماً. لا يتيم أي مرجع (user/product/variant/address كلها سليمة).
- **حالات الطلبات** (status_id → status_order/delivery/payment):
  | id | الاسم | العدد | order | delivery | payment |
  |---|---|---|---|---|---|
  | 2 | مطلوب تجهيزه | 143 | reserved | pending | unpaid |
  | 4 | قيد التوصيل | 3,822 | processing | pending | unpaid |
  | 5 | تم توصيله | 124 | reserved | delivered | paid |
  | 6 | ملغي | 124 | canceled | pending | unpaid |
  | 8 | مؤجل | 39 | processing | pending | unpaid |
  | 9 | مكرر | 76 | processing | pending | unpaid |
  | 12 | تم استلام المبلغ | 10,391 | completed | delivered | paid |
  | 13 | تم استلام الطلب الملغي | 2,399 | refunded | refunded | unpaid |
  | 15 | مفقود | 3 | reserved | pending | unpaid |
  | 16 | ملغي من الشركة | 24 | reserved | pending | unpaid |
- **الهواتف**: تنسيق مختلط — سوري بدون صفر (`930…`–`999…`، الأغلبية)، سوري بصفر (`093…`–`099…`)، أردني (`077/079…` قلة)، وعدد صغير من الأرقام الدولية. لا تكرار أرقام (10,503 فريداً).
- **العناوين**: كلها `country_id=1` (JO) رغم أن المحافظات سورية (regions 18–32, country 213) — تعارض داخلي في القاعدة القديمة؛ 283 عنواناً تشير إلى regions 1–15 **غير موجودة** في جدول regions (مراجع معلّقة).
- **المخزون**: `inventory` موجب دائماً (14 صفاً) لكن `products.quantity` فيه سالب (-41, -335, -208) — تناقض بين الجدولين.
- **المحفظة**: `wallet_transactions.value = orders.profit` لكل طلب لصالح `creator_id` — دفتر عمولات الموظفين. 6,172 مستخدماً لهم wallet>0 (يشمل عملاءً؟) — أقصى رصيد 119,441 (المستخدم 1).
- **العملة**: لا يوجد عمود عملة في أي جدول. الأسعار 2–150 والشحن 3–5 ⇒ على الأرجح USD. **يحتاج تأكيد المالك** (سوق سوري قد يكون SYP بسعر صرف أو USD فعلياً).
- `orders.note` نص حر عربي؛ `order_logs` = 169k سجل (create/update لكل حقل).

---

## 2. بنية قاعدة PostgreSQL الحالية (المشروع)

- Next.js 16.3.4، Prisma 6.19.3، PostgreSQL (محلياً الآن: `salesflow` على 127.0.0.1:5432)، JWT/jose auth، bcrypt.
- تعدد الشركات: `companyId` على كل شيء؛ متجر = `Store` داخل `Company` (store = business منفصل).
- الطلب (Order): ثلاث حالات مخزنة `confirmationStatus` (NEW/IN_PROGRESS/NO_ANSWER/FOLLOW_UP_REQUIRED/POSTPONED/CONFIRMED/REJECTED/CANCELLED) + `shippingStatus` (NOT_READY…DELIVERED/RETURNED/CANCELLED) + `settlementStatus` (NOT_APPLICABLE/PENDING/…/COLLECTED) + حالة مشتقة من `src/lib/order-state.ts`. المال: `Decimal(14,3)` للحقول الجديدة + أعمدة Float قديمة (`sellingPrice/totalAmount/...`) — `totalAmount` يبقى مصدر الإيراد.
- العميل (Customer): `phone` أرقام normalized + `rawPhone` للعرض؛ unique `[companyId, storeId, phone]`؛ عدادات حياة العميل.
- المنتج (Product): بدون variants — سعر وحيد `basePrice` + `Offer` (كمية/سعر/هدية/شحن مجاني). SKU unique per (company, store, sku).
- الشحن: `DeliveryProvider` (لكل متجر/شركة) + `DeliveryFee` لكل (provider, region) + `ShippingBatch` + `DeliveryAttempt` + `ReturnReceipt`.
- التسويات: `Wallet/WalletMovement/DailyClosing` + `CourierStatement/StatementReceipt/SettlementMatch` + `CommissionRule/Entry/Period/Payout` + رواتب/غرامات.
- المخزون: `ProductionBatch` (تكلفة 4 بنود) + `StockOpeningCount` + `InventoryMovement` (PRODUCTION/SALE/RETURN/MANUAL_ADJUSTMENT) — لا يوجد «order_reserved» كحركة.
- الهواتف: `src/lib/phone.ts` normalize لكل دولة (SY مدعومة) — يstrip الصفر ويخزن national، وrawPhone يبقى.
- التكاملات: Facebook (CTWA/psid مشفرة، CAPI، pixels، ad accounts)، Telegram، WhatsApp Cloud، apps/webhooks، OpenRouter AI.
- البيانات الحالية في القاعدة المحلية = demo seed (شركة bioderma، 13 مستخدماً، 100 منتج، طلبان، متجر واحد، صفحتان هبوط).

---

## 3. جدول المطابقة

| قديم (MySQL) | جديد (Postgres) | المطابقة | تحويل مطلوب | ملاحظات/مخاطر |
|---|---|---|---|---|
| `products` (23) | `Product` | name, price→basePrice, cost, quantity→batch, category_id→categoryId, image_path→image, description | إنشاء ProductionBatch (costPerUnit من cost) + StockOpeningCount؛ image_path مسارات قديمة (uploads محلية) — تحتاج نقل ملفات أو تركها NULL | لا variants في الجديد — متغير قديم يصبح المنتج نفسه |
| `variants` (23, 1:1) | — | يذوب في Product | variant_id القديم يبقى في خريطة IDs | |
| `categories` (3) | `Category` | name (اسم 'Category One' إنجليزي مهمل؟) | 1:1 بسيط | |
| `users` (10,503) | **`Customer`** (العملاء) | phone→phone(normalized)/rawPhone, full_name→fullName, wallet→? | استثناء 23 موظفاً | العملاء بالهاتف لا بالإيميل؛ wallet للعملاء لا مقابل مباشر |
| `users` (23 موظفين عبر auth_assignment) | `User` | email, full_name, phone | **لا ننقل password_hash** (Yii `$2y$13` — تقنياً متوافق bcrypt لكن قرار أمني للمالك)؛ الأدوار تُحدد يدوياً بالمطابقة الدلالية (admin→COMPANY_ADMIN، موظفو الطلبات→MODERATOR/CONFIRMATION_AGENT، محاسبة→ACCOUNTANT، شحن→DELIVERY_MANAGER) | صلاحيات Yii (routes) لا تنقل — تُبنى Role جديده |
| `addresses` (18,822) | يذوب في `Customer` (address/city) + `Order.regionId` | full_name, phone, address, region_id→Region | العملاء يُبنون من addresses (وليس users) — العنوان يتبع الطلب؛ الـ 283 عنواناً بمراجع regions معلقة (1–15) تحتاج قرار: تحويل لـ NULL أو أقرب محافظة | country_id=1 (JO) خطأ داخلي — نتجاهله ونستخدم سوريا |
| `orders` (17,021) | `Order` | sub_total→subtotal, shipping_price→shippingRevenue/deliveryFee, total→totalAmount, discount→discount, profit→netProfit snapshot, commission_amount→moderatorCommission, created_at, note→internalNotes, invoice_number→merchantRef? | status_id → (confirmationStatus, shippingStatus, settlementStatus) بالجدول أدناه؛ shipping_id→deliveryProviderId؛ user_id/creator_id→customerId/createdById عبر خريطة IDs؛ channel_id=1 → OrderChannel واحد (قنوات قديمة فارغة) | الحالة المشتقة يجب أن تكون متسقة مع الأعمدة الثلاثة؛ إعادة بناء orderNumber جديد أو استخدام invoice_number |
| `order_items` (17,056) | `OrderItem` + `Order.productId` | price→unitPrice, cost→(productCost snapshot), quantity | الطلب الواحد متعدد البنود (34 طلباً حتى 3 بنود): productId الأساسي = أول بند، والبقية OrderItem lines | new OrderItem بلا variant_id |
| `bundle_quantity` (9) | `Offer` | quantity→quantity, price→sellingPrice | 1:1 تقريباً (freeQuantity=0) | |
| `status` (10) | لا جدول — vocabularies | الخريطة أدناه | | |
| `shippings` (5) | `DeliveryProvider` (kind=COMPANY/AGENT) | name | refund_percentage=0 للجميع | |
| `shipping_prices` (70) | `DeliveryFee` (provider×region) | price→fee | يحتاج Regions جديدة تحت الشركة/الدولة السورية الجديدة | returnFee غير موجود قديماً |
| `regions` (14) | `Region` (تحت Country SY) | name | 1:1 | |
| `countries` (245) | `Country` | لا حاجة لنقل الكل — ننشئ SY فقط (+ أي دول ظهرت في الهواتف؟) | |
| `wallet_transactions` (10,393) | `CommissionEntry` (acrued) أو FinancialTransaction | value→amount، user_id→userId، reference_id(order)→orderId | دفتر عمولات الموظفين؛ لا محافظات نقدية وهمية | |
| `stock_movements` (19,638) | `InventoryMovement` | stock_in→PRODUCTION، order_canceled→?، order_refunded→RETURN | order_reserved (17,068) لا مقابل — الحجز في الجديد reservedQty على البند لا ledger؛ نقله سيضاعف الأرصدة ⇒ **لا ننقل حركات order_reserved**؛ نبني رصيد افتتاحي من inventory الحالي + حركات STOCK فقط | |
| `order_logs` (169,409) | `OrderActivity` (+ OrderStatusLog لتغييرات الحالة) | action/field/old/new → metadata JSON | حجم كبير؛ يمكن اختيارياً نقل تغييرات الحالة فقط (status_id/status_order) وأرشفة الباقي | قرار حجم |
| `settings` (1) | `Company.settings` + `Store` + `TrackingPixel` | facebook_pixel→TrackingPixel(META) | theme 'modern' → Store.theme | |
| `landing_pages` (3) | `LandingPage` | slug/title/headline/colors/font | builder_content JSON v2 **لا يطابق** LandingSection[] — النقل كـ HTML mode أو إعادة بناء يدوي | الأعلى خطراً بصرياً |
| `expense_types` (8) | Expense categories ثابتة | — | expenses=0 فلا شيء ينقل | |
| `payments` (3) | — | نظام COD افتراضي | لا نقل | |
| `contactus`, `subscribers`, `posts_sm`, `faqs`, `slider` | — | spam/تسويقي قليل | **لا نقل** | |

### خريطة حالات الطلبات (status_id → جديد)

| القديم | confirmationStatus | shippingStatus | settlementStatus |
|---|---|---|---|
| 2 مطلوب تجهيزه | NEW | NOT_READY | NOT_APPLICABLE |
| 4 قيد التوصيل | CONFIRMED | SHIPPED* | PENDING |
| 5 تم توصيله | CONFIRMED | DELIVERED | COLLECTED |
| 6 ملغي | CANCELLED | CANCELLED | CANCELLED |
| 8 مؤجل | POSTPONED | NOT_READY | NOT_APPLICABLE |
| 9 مكرر | REJECTED (DUPLICATE_ORDER) | NOT_READY | NOT_APPLICABLE |
| 12 تم استلام المبلغ | CONFIRMED | DELIVERED | COLLECTED |
| 13 تم استلام الطلب الملغي | CONFIRMED | RETURNED | REFUNDED |
| 15 مفقود | CONFIRMED | FAILED_DELIVERY | PENDING |
| 16 ملغي من الشركة | CANCELLED | CANCELLED | CANCELLED |

*«قيد التوصيل» يفتقد تفريق SHIPPED vs OUT_FOR_DELIVERY — نقترح SHIPPED إلا إذا وُجدت دليلة (order_logs لا يحمل توقيت التسليم بدقة). ملاحظة: حالتا 4 و12 كلاهما «خرج للطريق» لكن 12 وصل المبلغ ⇒ DELIVERED.

---

## 4. مشكلات التوافق (المخاطر)

1. **العملة غير موثقة** — لا عمود عملة. افتراض USD (أسعار 2–150). يحتاج تأكيداً قبل التنفيذ.
2. **دول العناوين مخالفة** (country_id=1/JO على عناوين سورية) — نتجاهلها ونربط بالمحافظة.
3. **283 عنواناً بمراجع محافظات معلقة** (regions 1–15 غير موجودة) — قرار: NULL أو أقرب محافظة.
4. **حالة «قيد التوصيل» غير مفككة** (SHIPPED vs OUT_FOR_DELIVERY).
5. **حركات `order_reserved` (17k)** لا مقابل لها — نقلها يفسد دفتر المخزون.
6. **تناقض مخزون** بين products.quantity (سالبة أحياناً) وinventory (موجبة) — نعتمد inventory كمصدر للرصيد الافتتاحي.
7. **صفحات الهبوط**: builder JSON قديم لا يطابق محرك البلوكات الجديد — نقل كمحتوى HTML خام أو إعادة بناء.
8. **كلمات مرور الموظفين**: Yii bcrypt `$2y$13` — تقنياً قابلة للتحقق بـ bcryptjs لكن لا ننقلها افتراضياً (قرار مالك). إن نُقلت تُجبر كلفة إعادة تعيين؟ (الافتراضي: كلمات مرور جديدة + إجبار reset).
9. **orderNumber**: الجديد يتطلب فريد لكل شركة — سنعيد الترقيم (مثلاً SY-xxxxx) مع خريطة old→new، أو نستخدم invoice_number حيث وجد.
10. **تواريخ مستقبلية** في القاعدة القديمة (تصل 2026-10-18 — ساعة الخادم القديم) — تُنقل كما هي (هي "الحاضر" عندهم).
11. **channel_id=1 بلا جدول channels** — ننشئ OrderChannel واحدة (مثلاً 'Imported/Old Site') أو نفترض PHONE.
12. **workload/الأداء**: 169k order_logs + 17k طلب — الترحيل يجب أن يكون دفعات + idempotent.

## 5. خطة الترحيل (بالترتيب، كل خطوة idempotent بمفتاح `legacy_` + خريطة IDs)

1. **البنية التحتية**: Company «صحة بلس» جديدة (currency حسب تأكيد المالك)، Country SY (minorUnit=2، timezone Asia/Damascus)، 14 Region، 1 Store (slug `salah-plus`)، 5 DeliveryProvider + 70 DeliveryFee، 3 Category، OrderChannel واحد.
2. **المستخدمون**: 23 موظفاً → User (أدوار مطابقة دلالياً، كلمات مرور جديدة/إجبار reset)؛ 10,480 عميلاً → Customer (تطبيع هاتف SY عبر `normalizePhoneNumber`، دمج أي تصادم بعد التطبيع — حالياً صفر تكرار).
3. **المنتجات**: 23 → Product + Category ربط + ProductionBatch افتتاحي (cost من variants.cost) + StockOpeningCount من inventory.
4. **العروض**: 9 bundle_quantity → Offer.
5. **الطلبات** (أكبر دفعة): لكل طلب — Customer من address_id (أو user_id)، Order + OrderItems، حالات بالجدول أعلاه، deliveryProvider، regionId من العنوان، snapshot مالي (totalAmount, discount, moderatorCommission, netProfit من profit)، merchantRef = invoice_number أو مشتق، source='Imported'.
6. **المحصّل/التسويات**: wallet_transactions → CommissionEntry (ACCRUED) مربوطة بالطلب + الموظف. لا wallets وهمية.
7. **النشاط**: order_logs تغييرات الحالة → OrderStatusLog/OrderActivity (قرار الحجم: كامل مقابل تغييرات الحالة فقط).
8. **المخزون**: حركات stock_in/stock_out فقط إذا أردنا تاريخاً؛ الافتراضي رصيد افتتاحي واحد من inventory (نقترح ذلك — أبسط وأصح محاسبياً).
9. **الصفحات**: landing_pages → LandingPage (HTML mode) + ربط pixel من settings → TrackingPixel.
10. **التحقق**: عدادات، عينات، FK checks، اختبارات المشروع.

## 6. طريقة استبدال البيانات الحالية بأمان (المرحلة 6 — مخطط فقط، لن ينفذ الآن)

- المتأثر: كل بيانات demo bioderma (1 شركة، 13 مستخدماً، 100 منتج، طلبان، متجر، صفحتان، محافظات أردن).
- يُحتفظ به: `superadmin@salesflow.io` (وأي مستخدم إداري تختاره)، أدوار Role/RolePermission الافتراضية، SystemSetting، بنية Country/Region للدول المطلوبة، أي apps/installs تريد إبقاءها.
- الطريقة المقترحة (بدون TRUNCATE/DROP): أرشفة أولاً (`pg_dump` كامل = النسخة الاحتياطية القابلة للاستعادة)، ثم حذف محدود بالعلاقة: حذف الشركات التجريبية (cascade سيحذف كل ما يخصها) مع استثناء المستخدم الإداري (فكّ companyId أو نقله للشركة الجديدة قبل الحذف). لا DELETE شامل ولا migrate reset.
- خطة الرجوع: استعادة `pg_dump` من قبل الاستبدال (نسخة موثقة باسم + checksum).

## 7. الملفات التي ستنشأ/تعدل

- `migration/` (جديد، خارج src):
  - `config.example.toml` + `.env` محلي git-ignored (DSN القديم والجديد — لا أسرار في الكود)
  - `lib/mysql-source.mjs`, `lib/pg-target.mjs`, `lib/idmap.mjs`, `lib/phone.js` (يعيد استخدام `src/lib/phone-rules.ts` المنطق)
  - `steps/` (01-infra.mjs … 09-verify.mjs) — كل خطوة idempotent + dry-run
  - `run.mjs` — `--dry-run` افتراضي، `--apply` صريح، `--step`
  - `verify.mjs` — تقارير المقارنة
- `docs/migration/salah-plus/REPORT.md` (هذا التقرير) + `MAPPING.md` (تفصيل الحقول)
- تعديلات تطبيق محتملة: لا شيء إلزامي متوقع (البيانات تتوافق مع المخطط).

## 8. الاختبارات المطلوبة

- على قاعدة اختبار منفصلة (مثلاً `salesflow_migration_test`): تشغيل كامل dry ثم apply ثم verify.
- عدادات: orders 17,021 / order_items 17,056 / customers ~10,480 / products 23 / offers 9 / staff 23.
- تحقق علاقات: كل OrderItem→Order وProduct؛ كل Order→Customer صحيح (بالمطابقة old-user/address→new-customer)؛ أسعار وكميات مطابقة للقديم (checksums SUM).
- اختبارات المشروع: `npm run typecheck`, `npm test`, فحص الصفحات (orders/customers/products/stores) في المتصفح.

## 9. خطوات التنفيذ على Coolify

1. الكود/الأداة/التوثيق → branch + PR (لا يُدفع على main مباشرة). لا يُرفع: ملف SQL، بيانات حقيقية، أسرار.
2. على الخادم: نسخة احتياطية `pg_dump` قبل أي شيء.
3. تشغيل الأداة مرة واحدة يدوياً على قاعدة الإنتاج الصحيحة (`--apply` بعد `--dry-run` ومراجعة التقرير).
4. Deploy عادي بعد ذلك — الاستيراد لا يرتبط بالـ deploy إطلاقاً (لن يكون جزءاً من postinstall/entrypoint).
5. خطة رجوع: استعادة الـ dump + إعادة نشر الكود السابق إن لزم.

---

## انتظار موافقتك

قرارات مطلوبة قبل التنفيذ:
1. **العملة**: USD أم SYP؟ (افتراضي مقترح: USD)
2. **كلمات مرور الموظفين الـ 23**: كلمات جديدة + إجبار reset (مقترح) أم نقل الهاشات القديمة؟
3. **order_logs الـ 169k**: نقل كامل أم تغييرات الحالة فقط (مقترح) أم أرشفة خارجية؟
4. **العناوين بمراجع محافظات معلقة (283)**: NULL (مقترح) أم أقرب محافظة؟
5. **صفحات الهبوط**: نقل HTML خام أم إعادة بناء يدوية؟
6. تأكيد أن قاعدة الوجهة للحالة النهائية هي إنتاج Coolify وليست المحلية (محلياً سنختبر فقط).
