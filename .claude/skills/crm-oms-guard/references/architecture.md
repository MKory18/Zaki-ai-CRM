# Architecture — navigation, roles, screen contracts

Every screen here is a contract. A screen not listed does not exist.
A screen listed must exist at the exact path, in the exact group.

## Hierarchy and entry

`Company → Country → Store → ProductMarket → LandingPage`

Entry is TWO explicit steps, in this order:

**Step 1 — Country picker.** Countries the user is assigned to, each with
currency code and count of active stores. "Add country" for owner and
manager only.

**Step 2 — Store picker**, scoped to the chosen country. Logo, name,
status (active / paused), type badge (single product / multi product).

Then the dashboard loads.

Rules:
- The store INHERITS from its country: currency, minor unit, regions,
  delivery-fee tables, work hours, weekend days, order prefix,
  allow_negative_stock. None re-selected at store level.
- Country and store are injected into EVERY API request and held in the
  session. A request missing either is rejected at the service layer.
- One country assigned → skip step 1. One store in it → skip step 2.
- Switching country CLEARS the selected store. Never carried over.
- A country with zero stores shows an empty state whose only action is
  creating the first store. Never a dead end.
- Creating a country provisions its default wallet and makes it appear
  in delivery fees and commission rules automatically.

## Navigation — eleven groups, drawn as fifteen lines

The registry (`src/lib/route-registry.ts`) is the one list, and this section
is its contract: a screen not listed does not exist, and a screen listed
must exist at the exact path, in the exact group.

**Revised again 2026-10-21 (night), on the owner's word** («الموقع كثييير
معجوق … دمج القوائم بذكاء»): the MENU spends one line per group, not one per
screen. This changes how the registry is DRAWN and nothing it CONTAINS — every
screen below keeps its path, its permissions, its title, its guide and its
notification link, so the guard, the palette, the roads and the phone bar read
what they always read. `NavGroup.hub` says how a group is drawn:

- `tabs` — the group is ONE sidebar line (its `icon` and name) that opens the
  first screen the person may open; above every screen of the group a strip of
  pills (`HubTabs`) lists the others — only the ones this person may open, in
  the order they arranged them. On a road the pills carry the step and the
  «التالي» link. A group with one screen left to a person takes that
  screen's own name.
- `cards` — one line that opens a page of cards (the group's first route:
  `/settings`); every other screen of the group carries a «← الإعدادات» link
  back to it. Every settings screen sits on exactly one card.
- `loose` — no heading, no folding: each screen its own line (الرئيسية and
  واجهة المتجر).

Fifteen lines: the four of الرئيسية, one each for التأكيد, الشحن, المخزون, المال,
الرقابة, النمو والذكاء, المحادثات, the two of واجهة المتجر, الإعدادات, الإدارة.

**Revised 2026-10-21, on the owner's word** («حاسو معجوق وصعب … الخطوة
يتودي للثانية»). No address moved — only the grouping, the order inside two
groups, and three names. A bookmark, a notification and a saved menu
arrangement (which is a list of PATHS) all still mean what they meant.

Two things the earlier text did not say:

- **A road is numbered.** In «الشحن» and «المال» the screens that are stops of
  one errand carry `step` and are drawn «1.», «2.»… — a hint for reading the
  menu, never a rule: every screen still opens on its own permission, in any
  order, and the number belongs to the screen, not to its row.
- **Operations sit with the work; configuration sits in settings.** The
  WhatsApp inbox is in المحادثات and its setup is in الإعدادات. The model
  follows the same rule: the assistant, the intelligence centre and the
  bench are work; the provider, the key, the local server and the house
  prompts are setup.

**1. الرئيسية**
```
لوحة التحكم              /dashboard
الطلبات                  /orders
العملاء                  /customers
المنتجات                 /products
```

**2. مركز التأكيد**
```
الطلبات الجديدة           /confirmation/queue
طلباتي                   /confirmation/mine
الطلبات المؤجلة           /confirmation/postponed
استرجاع الملغى            /confirmation/winback
الإشكالات                /confirmation/issues
```

**3. الشحن** — one parcel's road. Was «التشغيل».
```
1. التجهيز                /ops/preparation
2. إنشاء شحنة              /ops/shipments/new
3. دفعات الشحن             /ops/batches        (labels, sizes and the courier CSV live here)
4. متابعة الشحن            /ops/tracking
5. المرتجعات               /ops/returns
```

**4. المخزون**
```
أرصدة المخزون             /inventory/balances
تشغيلات الإنتاج           /manufacturing
استلام بضاعة جاهزة         /inventory/receiving
حركات المخزون             /inventory/movements
```

**5. المال** — the first four are one errand: see what each courier holds,
take it in (by statement or by hand), match, close the day.
```
1. عهدة المندوبين           /finance/agents
2. التحصيل والكشوف          /finance/collection
3. المطابقة                /finance/matching
4. الإغلاق اليومي           /finance/closing
   المحافظ والحركات         /finance/wallets
   التحويلات               /finance/transfers
   الأرباح                 /finance/profit
```

**6. الرقابة**
```
طلبات التعديل             /control/change-requests
تنبيهات الخصم             /control/discount-alerts   (a price cut given to a customer)
خصومات الموظفين           /control/penalties         (money off a salary — was «الخصومات»)
سجل التدقيق               /control/audit
القائمة السوداء           /control/blacklist
```

**7. النمو والذكاء** — was «النمو». A hub of tabs.
```
لوحة الأداء               /growth/performance
الحملات                  /growth/campaigns
المساعد الذكي             /assistant
مركز الذكاء               /growth/intelligence
منصّة التجريب             /growth/bench
```

**7ب. المحادثات** — the two inboxes, a group of their own since the menu was
folded: somebody who wrote to us is not a growth question. A hub of tabs.
```
صندوق الواتساب            /growth/whatsapp/inbox
طلبات تلجرام              /growth/telegram/orders
```

**8. واجهة المتجر** — how the shop LOOKS and what it SAYS (added 2026-10-11).
Two entries, where eleven stood: the other eight are the tabs of `/store`
and their old addresses redirect to the tab that holds them.
```
المتجر                    /store
صفحات الهبوط              /store/landing-pages
```
`/store` lists every shop on one card each. The old
`/store/single-product` address redirects to `/store` permanently.

**9. الإعدادات** — how the system RUNS. A hub of cards: ONE menu line that
opens `/settings`, a page of eight cards (البلدان والمتاجر · الشحن · العمولات ·
القنوات والتتبّع · واتساب وتلجرام · الذكاء الاصطناعي · التطبيقات · النظام),
each linking only to the screens the person may open. `/settings` is also
where an ad platform's OAuth round trip lands (`/settings?connect=…`).
```
الإعدادات                 /settings           (the front door; the union of the permissions below)
البلدان والمتاجر والمحافظ  /settings/geo
شركات الشحن وأجورها        /settings/couriers  (a courier and its fees are one screen)
العمولات                  /settings/commission
قنوات الطلبات              /settings/channels
بكسل التتبع والحملات       /settings/tracking
إعدادات واتساب            /settings/whatsapp
إعدادات تلجرام            /settings/telegram
الذكاء الاصطناعي والنصوص    /settings/ai        (moved here from النمو)
متجر التطبيقات            /apps/store         (was a group of its own)
التطبيقات المثبتة          /apps/installed     (was a group of its own)
إعدادات النظام            /settings/system
المهام المجدولة            /admin/jobs         (moved here from الإدارة)
```

**10. الإدارة**
```
الموظفين                  /admin/users
الصلاحيات                 /admin/permissions
الملف الشخصي              /admin/profile
```

## Distinctions that must not collapse

- `/assistant` is a CHAT assistant: ask about a product, an order, a
  how-to. Conversational. Already built. Rewire only.
- `/growth/intelligence` is BUSINESS ANALYSIS over operational data:
  pricing, offers, cross-sell, seasons, next product, expansion,
  stop-the-bleed, customers. Proposes actions. Never merged with
  `/assistant`.
- Apps appear ONCE — in الإعدادات, beside what they configure. (Until
  2026-10-21 they were a group of their own with two entries; what the old
  rule protected was the ONCE, and that holds.)
- Countries, stores and wallets live together in `/settings/geo` only.
- WhatsApp, Telegram and the AI: the operational screens in النمو والذكاء /
  المحادثات, the configuration in الإعدادات. Never both in one place.

## Role visibility — enforced at the API, 403 not hidden

```
moderator
  /orders  — create, and edit own orders only before claim
  /confirmation/issues
  /customers  — read only, no export
  NEVER /confirmation/queue. Pulling orders is not the moderator's job.

confirmation_agent
  /confirmation/queue (pull-next only, no list)
  /confirmation/mine
  /confirmation/postponed

confirmation_supervisor
  all confirmation routes with list view
  /control/change-requests
  /control/discount-alerts
  /growth/performance limited to own team

warehouse
  /ops/preparation, /ops/batches, /ops/returns, /inventory/*
  no phone and no address in any payload

shipping
  /ops/shipments/new, /ops/batches, /ops/tracking
  /control/change-requests

accountant
  /finance/*, /control/audit read only

manager   everything except write on /admin/permissions
owner     everything
```

## Screen contracts

**/confirmation/queue** — Agents see NO list. One button "pull next" and a
waiting counter. Priority: postponed due within lead days, then oldest.
Cannot pull while owning an order with zero logged attempts. Caps: 40
owned with no attempt, 120 owned total. Auto-release after 90 business
minutes with no attempt. Supervisors see the full list of the same data.

**/confirmation/mine** — Two sections: in-confirmation, and
already-confirmed (read only, with a raise-change-request action per row).
Order actions: call, WhatsApp, SMS, no-answer with a 1/2/3 counter where
the third auto-closes under its own distinct reason, postpone with date
and preferred time and reason, confirm, cancel, discount, raise issue.
Sub-status selector only for states that define one. Customer risk panel:
returns over orders across 6 months or the last 10 orders; tiers at 15%
and 40%; high risk requires prepayment or supervisor approval and is
excluded from automated confirmation.

**/confirmation/postponed** — order, customer, due date, days remaining,
preferred time, reason, postpone count. Only rows due within lead days
are actionable.

**/confirmation/issues** — Moderator-entered orders only. A store-sourced
order can never raise an entry issue. Actions: correct and return to
queue, or void (owner only). An issue is never counted as a cancellation
against the agent, and the order keeps its original created_at.

**/ops/preparation** — Grouped BY PRODUCT, collapsible. Per product:
orders, required, available, shortage. Per order: mark ready, postpone
for stock. Reservation is per line; an order with one unreserved line
cannot become READY_TO_SHIP. Honours allow_negative_stock per country.

**/ops/shipments/new** — Filters: date range, courier, governorate,
product. Select-all skips blocked rows. Blocking warnings until
acknowledged: duplicate in batch, previous shipment in transit, recent
return, stock shortage when negative stock is disallowed. COD breakdown
per row before sending. An exceptions panel lists undispatchable rows.

**/ops/labels** *(no longer a screen — folded into `/ops/batches`, which carries all of this)* — Filters: date range, courier, governorate, print status.
The label carries the courier barcode AND a QR of our order reference.
Sizes in millimetres, custom allowed. PDF and CSV export. The URL uses a
batch token, never a list of ids, with per-order authorization on the
server.

**/ops/tracking** — Search by order id, barcode, customer, phone.
Days-in-transit counter with per-governorate late thresholds. Actions:
contact with a template that varies by stall reason, request edit,
transfer courier, return. Collection status is a column separate from
delivery status.

**/ops/returns** — Scan barcode or select. Receiving form: actual
received, damaged, missing computed, courier fee yes or no with automatic
calculation by region and courier when yes, and a mandatory
count-and-inspect acknowledgement. Nothing enters stock before it.

**/finance/collection** — Statement upload with a file hash; no duplicate
import. Receipt lines: MANY per statement, each with its own wallet,
currency and amount. Their sum must equal the statement total, otherwise
the gap is flagged and requires a written explanation before approval.

**/finance/matching** — Runs on demand AFTER the receipt is recorded.
Single key: merchant reference, then courier barcode. Never phone. Three
queues with editable actions: matched, mismatched, missing. A partially
delivered order is compared against the post-event expected amount.

**/finance/wallets** — Wallet belongs to a country; currency chosen per
wallet and may differ from the country currency. Every movement requires
wallet, direction, amount, party, category and note. No delete — a
reversing entry with a reason.

**/finance/transfers** — Wallet to wallet, same or different country,
manual exchange rate entered by the user, stored with the transfer, never
recalculated.

**/finance/closing** — Per wallet: book balance, manually entered actual
balance, computed difference, mandatory explanation when non-zero. The
user who records movements cannot approve the closing.

**/settings/geo** — Countries with currency, minor unit, work hours,
weekend days, order prefix, allow_negative_stock. Stores under countries.
Wallets under countries.

**/settings/delivery-fees** *(no longer a screen — folded into `/settings/couriers`, a courier and its fees being one subject)* — A separate table per courier per country per
governorate, with fee and late-threshold days. A manual override requires
a reason and is written to the audit log.

**/admin/permissions** — Role templates plus per-user overrides. Each
permission carries a scope: own | store | country | selected | all, and an
optional amount ceiling. Scope is applied inside the query, never by
hiding columns. Hidden by default: product cost, ad spend, net profit,
commission rule amounts.
