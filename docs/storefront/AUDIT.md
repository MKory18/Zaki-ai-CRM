# Storefront — Stage 0 audit

Branch `feat/storefront-1-multi-product`, worktree `../zaki-storefront`, from
`origin/main` **c675565**. No code, schema, dependency or config changed.

Everything below is measured on this checkout or on the live dev database.
Where a sweep over-reported, the correction is written beside it.

---

## 0 · Contradictions with the skill's own references — report, do not resolve

| What the skill says | What the repository is | Action |
|---|---|---|
| `architecture.md:34` lists **ten** nav groups; no «واجهة المتجر» group exists; landing pages and single-product stores sit under **النمو** (`/growth/landing-pages`, `/growth/single-product-stores`) | `route-registry.ts` has **eleven** groups including `storefront` with **10** entries at `/store/*`; neither `/growth/landing-pages` nor `/growth/single-product-stores` exists | `architecture.md` is stale. **Stage 1 rewrites it**, dated 2026-10-11 (the owner's D1/D5 decisions are the new contract). |
| `stages.md:174` — «A single-product store binds to exactly ONE ProductMarket. No catalog, no cart. Its storefront IS the landing page.» | D1 makes multi-product the main path | `stages.md` Stage 11 is superseded by D1. **Stage 1 rewrites it.** |
| `stages.md:202` — «First two apps ship internal: Reviews and Countdown.» | `apps/registry.ts:58` ships **seven** built-in apps — LOGESTECHS, META_PIXEL, TIKTOK_PIXEL, SNAPCHAT_PIXEL, GOOGLE_TAG, WHATSAPP, TELEGRAM. **No Reviews app, no Countdown app.** | Decides where D8 lives — see §7. |
| `stages.md:213` — «SIX tables carry `storeId` … Product … company-scoped only» | `schema.prisma` `Product.storeId String? @map("store_id")` **exists** (nullable) | The Stage-13 backfill partly happened. `stages.md` is stale here too. |
| The prompt's constraint: customer text «only through `aiChat({ localOnly: true })`» | `ChatRequest` (`ai-provider.ts:617-632`) has `companyId · system · job · user · json · timeoutMs`. **There is no `localOnly`.** | **CONFLICT → `EXTEND`.** D8 cannot honour that constraint until `ChatRequest` carries it and `aiChat` refuses a non-LOCAL route when it is set. Listed in the approval list, §7. |

---

## 1 · Discovery table

`CONCEPT | FOUND AS | FILE PATH | VERDICT`

### The storefront engine

| Concept | Found as | File | Verdict |
|---|---|---|---|
| storefront / catalogue | `storefrontCatalog`, `storefrontProducts`, `getStorefront` | `src/lib/storefront.ts:198,356` | `EXTEND` — D2 changes what it returns |
| store skin contract | `storeSkinSchema`, slot enums | `src/lib/store-skin.ts:273` (744 lines) | `REUSE` |
| the ten skins | `STORE_TEMPLATES` | `src/lib/store-templates.ts` | `EXTEND` — map to 3 families, §6 |
| layout slots | `LAYOUT_SLOTS` (7 slots, 27 variants) | `src/lib/layout-slots.ts:23-45` | `EXTEND` — 7 variants have no renderer, §5 |
| landing structures (10) | `LANDING_STRUCTURES` | `src/lib/landing-structures.ts` | `REUSE` |
| block library | `landing-sections.ts`, `PageBlocks.tsx` (1061 lines) | `src/components/landing/blocks/` | `EXTEND` |
| page renderer | `LandingPageView` — already takes `{frontPageId, storeId}` | `src/components/landing/LandingPageView.tsx:392 lines` | `REUSE` — D2's "page inside the store" needs no second renderer |
| store front page | `Store.landingPageId` | `schema.prisma` `model Store` | `REUSE` |
| show a page in the store | `LandingPage.showInStore` (default `false`) | `schema.prisma`; `storefront.ts:363` | `REUSE` — D2's one-press flips it |
| draft / publish / revert | `contentDraft`, `landing-draft.ts`, `/api/landing-pages/[id]/content` | `src/lib/landing-draft.ts` | `REUSE` — untouchable |
| cart | `useCart.ts` (151), `CartView.tsx` (177) | `src/components/storefront/` | `REUSE` — mark, never delete (D2) |
| order path | `public-order.ts` | `src/lib/public-order.ts` | `REUSE` — untouchable |
| attribution `?c=` | campaign param carried through | `src/lib/landing-tracking.ts` | `REUSE` — untouchable |

### D6 — the matcher

| Concept | Found as | File | Verdict |
|---|---|---|---|
| AI assistant registry | `ASSISTANTS`, `assistantByKey` | `src/lib/ai-assistants.ts:69,124` | `EXTEND` — `landing_copy` already exists with `scopes: []`, `pii: false` |
| prompt per job | `AI_JOBS`, `jobInfo`, `resolvePrompt` | `src/lib/ai-prompts.ts:41,188,202` | `EXTEND` — `landing_copy` job exists with a real default |
| the brief builder | `landingCopyBrief`, `readProposal`, `parseProposal` | `src/lib/landing-copy-brief.ts` | `EXTEND` — add structure + family to the output schema |
| model routing | `routeFor`, `aiChat` | `src/lib/ai-provider.ts:655` | `EXTEND` — needs `localOnly` for D8, §7 |
| proposal-only invariant | sweep + route drive | `src/lib/ai-proposal-only.test.ts` | `REUSE` — the matcher must stay inside it |
| counted results, not predicted | `readDna` with `MIN_SELLERS = 10`, refuses below the floor | `src/lib/product-dna.ts` | `REUSE` — the floor pattern D6 asks for |
| landing analytics | `viewsCount` / `ordersCount`, `landing-analytics.ts` | `src/lib/landing-analytics.ts:141` | `EXTEND` — add conversion per structure × skin |

### D8 — social proof and urgency

| Concept | Found as | File | Verdict |
|---|---|---|---|
| reviews block | `reviews` section, seller-typed name/text/stars, max 12 | `src/lib/landing-sections.ts`; `PageBlocks.tsx` | `EXTEND` — add `source`, private proof, who/when |
| **a review / rating model** | **nothing** — `grep -nE "^model (Review\|Rating\|Testimonial\|Feedback)" prisma/schema.prisma` returns nothing | — | **`GENUINELY NEW`** |
| **a verified-buyer rating link** | nothing | — | **`GENUINELY NEW`** |
| **publish consent** | nothing (`consent` hits are OAuth and change-requests only) | — | **`GENUINELY NEW`** |
| internal Reviews app | **does not exist** — 7 built-ins, none is Reviews | `src/lib/apps/registry.ts:58` | `GENUINELY NEW` if built as an app |
| app framework | `App`, `AppInstall`, `AppDelivery` | `schema.prisma:2882,2909,2935` | `REUSE` |
| countdown block | `Countdown.tsx`, `urgency` block | `src/components/landing/blocks/Countdown.tsx` | `EXTEND` — mark the per-visitor timer ⚠️ |
| offer end date | `endsAt` | `src/lib/offers.ts`; `/api/offers` | `REUSE` |
| real stock on the page | `showRealStock` | `landing-sections.ts` | `REUSE` |
| tracking page (where the rating link is offered) | `/s/[store]/track` + `TrackForm.tsx` (185) | `src/app/s/[store]/track/page.tsx` | `EXTEND` |
| audit log | `logAudit`, append-only by DB trigger (SQLSTATE 23001) | `src/lib/audit.ts` | `REUSE` |
| notification to the owner | `createNotification` / `notify` | `src/lib/notify.ts` | `REUSE` |

---

## 2 · Surface map

### Public pages — all read the store from the path segment

| Path | File | Lines | Store from |
|---|---|---|---|
| `/s/[store]` | `src/app/s/[store]/page.tsx` | 222 | path · landing page |
| `/s/[store]/shop` | `.../shop/page.tsx` | 277 | path |
| `/s/[store]/p/[sku]` | `.../p/[sku]/page.tsx` | 387 | path · landing page |
| `/s/[store]/cart` | `.../cart/page.tsx` | 60 | path |
| `/s/[store]/checkout` | `.../checkout/page.tsx` | 83 | path |
| `/s/[store]/thanks` | `.../thanks/page.tsx` | 106 | path |
| `/s/[store]/track` | `.../track/page.tsx` | 62 | path |
| `/s/[store]/pages/[slug]` | `.../pages/[slug]/page.tsx` | 64 | path |
| `/s/[store]/sitemap.xml` | `.../sitemap.xml/route.ts` | 93 | path |
| `/lp/[slug]` | `src/app/lp/[slug]/page.tsx` | 31 | page → store |
| `/lp/[slug]/raw` | `.../raw/route.ts` | 198 | page → store |

### Management — group `storefront`, 10 entries

| Path | Label | Screen (lines) | Permissions | registry |
|---|---|---|---|---|
| `/store/single-product` | متجر Single Product | `StorefrontsScreen` (471) | `geo.manage` | `:191` |
| `/store/landing-pages` | صفحات الهبوط | `LandingPagesScreen` (776) | `landing_pages.view` | `:192` |
| `/store/design` | التصميم | `StoreDesignScreen` (200) | `storefront.view/manage` | `:194` |
| `/store/themes` | القوالب | `StoreThemeScreen` (955) | `storefront.view/manage` | `:195` |
| `/store/menus` | القوائم | `StoreMenusScreen` (273) | `storefront.view/manage` | `:196` |
| `/store/pages` | الصفحات التعريفية | `StorePagesScreen` (287) | `storefront.view/manage` | `:197` |
| `/store/search` | البحث والفلاتر | `StoreSearchScreen` (313) | `storefront.view/manage` | `:198` |
| `/store/languages` | اللغات | `StoreLanguagesScreen` (159) | `storefront.view/manage` | `:199` |
| `/store/routes` | المسارات | `StoreRoutesScreen` (259) | `storefront.view/manage` | `:200` |
| `/store/domain` | الدومين | `StoreDomainScreen` (367) | `storefront.view · storefront.domain` | `:201` |

**Open/close, type, tagline, about are NOT here** — they live in
`StorefrontSettings.tsx` under `/settings/geo`. D1/D5 move them.

---

## 3 · D5 — isolation

### Writes and reads: scoped. No gap found.

Every one of the 13 `/api/store/*` and `/api/landing-pages/*` routes carries
`storeId` in its `where`. `/api/growth/storefronts` too.

**A sweep correction, stated because it over-reported:** two public routes —
`api/public/stores/[store]/search/route.ts` and `.../cards/route.ts` — show no
literal `storeId`. They are **not** gaps: both resolve the store with
`getStorefront(slug)` (`search:77`, `cards:76`) and pass `store.companyId,
store.id` positionally into `storefrontProducts`, which is store-scoped
(`storefront.ts:198`). A name-matching sweep cannot see a positional argument.

### Saying which store you are editing: **8 of 10 screens do not**

| Screen | Names the store | Has a switcher |
|---|---|---|
| `StoreThemeScreen` | ✅ | ✅ |
| `StoreMenusScreen` | ❌ | ✅ |
| `StorePagesScreen` | ❌ | ✅ |
| `StorefrontsScreen` | ❌ | ❌ |
| `LandingPagesScreen` | ❌ | ❌ |
| `StoreDesignScreen` | ❌ | ❌ |
| `StoreSearchScreen` | ❌ | ❌ |
| `StoreLanguagesScreen` | ❌ | ❌ |
| `StoreRoutesScreen` | ❌ | ❌ |
| `StoreDomainScreen` | ❌ | ❌ |

Eight screens edit **the store selected in the header cookie** and never say
which. `/store/domain` is the sharpest case: a 367-line screen that attaches a
real hostname to whichever store the cookie happens to hold.

**Stage 1 fixes this with one shared bar, not ten edits.**

---

## 4 · What the live store actually looks like — real screenshots

`shots/01-store-home-390.jpg` · `02-product-page-390.jpg` ·
`03-landing-page-390.jpg` · `04-shop-1280.jpg` — taken against the running dev
server, store `main` (المبارك ستور, template `lab`, 12 products, 44 landing
pages), Chromium at 390×844 and 1280×800.

**Home, 390** (`01`):
- **No hero.** The declared hero is `productFirst`; what renders is header →
  search → one trust line → chips → grid. The first screen sells nothing.
- **Product cards have no image** — empty white boxes ~170 px tall each.
- Two floating buttons overlap content: WhatsApp (top-start) and a dev badge
  (bottom-start).
- The search field and the WhatsApp bubble share a cramped row.

**Product page, 390** (`02`):
- A **blank image box ~340 px tall** fills the first screen. It is the LCP
  element and it is empty.
- **The price and the CTA are below the fold.** First screen = header +
  search + trust line + breadcrumb + empty box.
- The floating dev badge clips the price `22 JOD`.

**Landing page, 390** (`03`) — **better than the store, and that is the point**:
headline → price → CTA → «ادفع عند الاستلام» → sticky bottom bar carrying the
price. This is the evidence for D2: the page converts, the catalogue does not.
Weakness: no image at all, four equal paragraphs with no rhythm.

**Shop, 1280** (`04`): a flat four-column grid; here the cards DO show gradient
placeholders, so the blank cards on the home are a different code path.

**Not captured, with the reason:** management screens at 390 — the two seeded
accounts I may use (`sara@`, `warehouse@`) hold neither `storefront.view` nor
`geo.manage`, and the privileged roles sit behind 2FA enrolment which I may not
perform. Every management finding below is therefore from source, with
file:line.

---

## 5 · Why the ten skins look alike — the measured answer

The skins **declare** plenty of variety: 9 distinct heading fonts, 5 headers,
5 heroes, 9 distinct home orders (`store-templates.ts`).

The renderer **ignores 7 of the 27 declared variants.**

| Slot | Declared | Drawn | Dead |
|---|---|---|---|
| `header` | 5 | 4 | **`minimal`** |
| `hero` | 5 | 5 | — |
| `categoryNav` | 4 | 3 | **`chips`** |
| `productCard` | 4 | 4 | — |
| **`categoryPage`** | **4** | **0** | **`grid2` `grid3` `list` `mixed`** |
| `productPage` | 3 | 3 | — |
| `cart` | 2 | 1 | **`drawer`** |

`categoryPage` is the worst: declared at `layout-slots.ts:41`, validated at
`store-skin.ts:273`, offered to the seller at `LayoutPanel.tsx:34`, chosen by
all ten skins (`store-templates.ts:77,125,178,229,281,329,…`) — and **read by
no renderer**. Every skin's category page is identical.

`minimal` is chosen by ritual, heritage and tender; `chips` by lab and ritual.
Those skins silently fall back to the default. **The live store `main` is
configured with `categoryNav: "chips"` right now** — a dead variant.

`layout-slots.ts:18-22` warned about exactly this: «A name with nothing behind
it renders the default and tells nobody, which is the failure this list exists
to make impossible.» It happened anyway, seven times.

**What a skin can change today:** palette, fonts, corner radius, shadow, the
home block order, and the four slots that are drawn. **What it cannot:** the
header's structure beyond four shapes, the category page at all, the card's
internal rhythm, the hero's content model.

### Conversion, per surface, on a COD phone

| Finding | Where | Cost |
|---|---|---|
| Price and CTA below the fold on the product page | `src/app/s/[store]/p/[sku]/page.tsx` — gallery renders before the price block | Highest. A shopper from a reel decides in the first screen. |
| Empty hero on the store home | `src/app/s/[store]/page.tsx:222` | No offer, no promise, no reason to scroll. |
| No sticky CTA anywhere in the **store** (the landing page has one) | `src/components/storefront/StorefrontShell.tsx:236` | The order form is a scroll away at every depth. |
| Trust row is one thin grey line | store home, `01` | COD, delivery time and returns are the three objections; they get one line. |
| No objections FAQ in the store | — | The landing structures have one; the catalogue does not. |
| No WhatsApp contact on the product page | only a floating bubble on the home | |
| Blank LCP image box | product page | LCP is an empty element — worst case for a slow phone. |

---

## 6 · Clutter audit — management

Counted on source with comments stripped.

| Screen | Lines | `<p>` | Long Arabic sentences | Buttons | Inputs | Tabs |
|---|---|---|---|---|---|---|
| StoreTheme | 955 | 24 | 16 | 13 | 24 | 2 |
| LandingPages | 776 | 12 | 12 | 15 | 2 | 0 |
| Storefronts | 471 | 15 | 3 | 8 | 1 | 0 |
| StoreDomain | 367 | 15 | 6 | 6 | 1 | 0 |
| StoreSearch | 313 | 7 | 4 | 5 | 6 | 0 |
| StorePages | 287 | 2 | 4 | 5 | 4 | 0 |
| StoreMenus | 273 | 4 | 3 | 7 | 3 | 0 |
| StoreRoutes | 259 | 4 | 6 | 7 | 3 | 0 |
| StoreDesign | 200 | 1 | 4 | 3 | 0 | 0 |
| StoreLanguages | 159 | 5 | 2 | 3 | 0 | 0 |
| **Total** | **4060** | **89** | **60** | **72** | **44** | **2** |

**89 paragraphs and 60 long Arabic sentences across ten screens.** That is the
owner's «كلام فوق بعضه», counted.

**The primary action.** `Button`'s `variant` defaults to `'primary'`
(`Button.tsx:57`), so an un-marked button IS primary — but these screens use
`variant="secondary"` **21 times** and never mark one button as the one. With
72 buttons over ten screens, nothing stands out. *(A sweep correction: I first
read `variant="info"` as an invalid Button variant. It is on `<Badge>`, not
`<Button>`. Not a finding.)*

`StoreTheme` alone: **955 lines, 24 paragraphs, 24 inputs, 2 tab groups** — one
screen carrying what should be a section of a tabbed store page.

---

## 7 · Proposal

### 7.1 Information architecture — 10 entries → 3

```
المتجر            /store                 ← all stores, one card each
  └ inside one store, tabs:
      الواجهة     (design + themes)       ← StoreDesign + StoreTheme
      المحتوى     (pages + menus + search + languages)
      العنوان     (domain + routes)
      الحالة      (open/close, tagline, about — MOVED from /settings/geo)
صفحات الهبوط      /store/landing-pages   ← stays its own entry: it is daily work
منصّة التجريب      /growth/bench          ← already shipped, stays
```

- `/store/single-product` → **redirect** to `/store`, never a 404.
- `/store/design` `/store/themes` `/store/menus` `/store/pages` `/store/search`
  `/store/languages` `/store/routes` `/store/domain` → redirect to
  `/store/<id>?tab=…`.
- Two levels only, as D5 asks: **all stores** → **one store**.
- No field in two places: open/close, tagline and about **move** out of
  `StorefrontSettings.tsx`; they are not copied.

### 7.2 The three families

`families/a.html` «عيادة» · `families/b.html` «عطّار» · `families/c.html` «ترند».
Each opens offline (fonts aside) and was checked in Chromium at 390×844:
`scrollWidth === innerWidth === 390` — **no horizontal scroll** in any of them.
Screenshots: `shots/f-a-390.jpg`, `f-b-390.jpg`, `f-c-390.jpg`.

| | عيادة | عطّار | ترند |
|---|---|---|---|
| Heading / body | IBM Plex Sans Arabic 700 / 400 — **one family** | **Amiri 700 / Tajawal 400 — two families** | **Changa 800 / Readex Pro 400 — display + text** |
| Header | thin fixed bar, name + one link | **stacked, centred**, dotted CSS rule, 4 links | **transparent over the hero**, name tiny, offer badge |
| Hero | **two columns** — copy + a proof card visible in screen one | **one double-framed panel**, centred, price inside | **offers FIRST**, three tiers + a real end-date clock |
| Card | **horizontal** (image start, text end) — read, not browsed | **square, double-framed**, name strip under | **UGC tiles 9:13**, caption over image, 3-up |
| Colour | one clinical `#0a7ea4` on white | earth `#5a6b2f` + gold `#9a7b3f` on `#fcf8f1` | `#e5114f` on `#171320` dark hero |
| Ornament | none | CSS dotted rule + double frame + drop-cap | none; weight goes to the offer strip |
| Structures | problem-solution · mechanism · objections | origin · transformation · us-vs-them | offer-first · ugc · the-hack · quiz |
| Weight (measured) | 12.1 KB raw / **4.3 KB gz** | 11.9 / **4.3** | 10.8 / **4.0** |
| + 2 Arabic subset fonts | ~42 KB | ~55 KB (Amiri heavier) | ~48 KB |

All three: tap targets ≥ 44 px, body 16 px, Western digits, no letter-spacing
on Arabic, offers and CTA inside the first two screens, a trust row (COD ·
delivery time · returns), an objections FAQ, a sticky CTA on phones only, and
**every example review or number carries «مثال»**.

**Engine parts that would implement them** — new variants only, through
`LAYOUT_SLOTS` and the skin contract:
- `header`: `stacked` exists (عطّار); `transparent` exists (ترند); عيادة uses
  `minimal` — **which must first be given a renderer** (§5).
- `hero`: عيادة = a new `splitProof` variant; عطّار = `editorial`; ترند =
  `offerStrip` (exists).
- `productCard`: عيادة = `wide` (exists); عطّار = `square` (exists); ترند = a
  new `tile` variant.
- `categoryPage`: all four declared variants need renderers before any family
  can differ there.
- Typography: the skin contract already carries `type.{heading,body}`.

### 7.3 The ten skins → three families

| Skin | Family | Decision |
|---|---|---|
| lab | عيادة | **keep** — becomes the family's reference skin |
| pure | عيادة | **merge** into lab (same header, same mood, both `clean`) |
| herbs | عطّار | **keep** — reference skin |
| heritage | عطّار | **merge** into herbs (both `warm` + `editorial` + Naskh-ish) |
| ritual | عطّار | **keep** — the one `wide` card, genuinely different rhythm |
| amber | عطّار | **merge** into ritual (`bold` mood belongs to ترند, its layout to عطّار) |
| pulse | ترند | **keep** — reference skin (`offerStrip` + `split`) |
| souq | ترند | **merge** into pulse (same `offerStrip`, same `compact`) |
| tender | ترند | **keep** — the soft variant; a real second voice |
| pearl | — | **retire** (hide, never delete): `slider` hero + `transparent` header duplicate pulse's job with less conversion intent |

Result: 6 live skins across 3 families, 4 retired-not-deleted.

### 7.4 The D6 matcher — an extension, not a new system

**Where:** `landing_copy` keeps its key, its assistant row
(`ai-assistants.ts`, `scopes: []`, `pii: false`) and its job
(`ai-prompts.ts`). `landingCopyBrief` grows a structure and family section;
`readProposal` grows two fields.

**Input (product fields only):** name, description, category, category
attributes (`need` `skin` `ml` `made` `ingredients`), `basePrice`, live offers
(`title`, `qty`, `price`, `endsAt`). **No customer, no order, no settlement.**

**Output schema:**
```jsonc
{
  "structure":  "problem-solution",   // one of the 10
  "structureWhy": "المنتج بيحلّ وجع معروف والزائر بيعرفه",
  "family":     "clinic",             // clinic | herbalist | trend
  "familyWhy":  "علاجيّ، بيحتاج إثبات مش حكاية",
  "copy":       { "<slotKey>": "..." }   // as today
}
```
`structure` and `family` validated against `LANDING_STRUCTURES` and the family
list — an invented value is dropped and named, as `readProposal` already does
for slot keys.

**The counted results beside the proposal** (never sent to the model): per
`structure × skin`, `sum(ordersCount) / sum(viewsCount)` over that company's
published pages, from `LandingPage.viewsCount/ordersCount` via
`landing-analytics.ts`. Floor like `product-dna.ts`: below it the panel reads
«لسا ما في أرقام كافية» with the count. **Proposed floor: 200 views and 5
pages per combination** — Stage 2 confirms against live data.

**Approval:** the proposal lands in the create/edit dialog beside the existing
«اكتب النصوص بالذكاء الاصطناعي» button, as three pre-selected choices the
seller can change, each with its one-line reason. Saving writes `contentDraft`
only. `ai-proposal-only.test.ts` stays green: the matcher route writes nothing.

### 7.5 D7 — is 250 KB reachable?

**Honest answer: not on the dashboard bundle, and that does not matter —
the public pages are a different entry.** Measured on this build:

- First-load CSS **for the dashboard** is 102.58 KB raw (16.8 KB `system.css`
  with four palettes + 85.8 KB Tailwind utilities). That is a management
  number.
- The mockups show the public side needs **4.0–4.3 KB gz of CSS+HTML** and two
  subset fonts (42–55 KB). A hero image ≤ 100 KB leaves room inside 250 KB.

**So 250 KB is reachable for `/s/*` and `/lp/*` provided three things**, each
of which Stage 2 must measure rather than assume:
1. The storefront pages do not pull the dashboard's CSS chunk. **Unverified —
   Stage 2 measures it first.**
2. ≤ 2 font families per family, Arabic subset, `font-display: swap`.
3. The hero image is real, AVIF/WebP, `srcset`, preloaded — today it is an
   **empty box**, which is 0 KB and also 0 conversion.

**How it is measured automatically — nothing GENUINELY NEW is needed.**
`src/lib/quality-gates.test.ts` already walks `.next/static` and asserts a CSS
budget. Stage 2 adds a sibling assertion over the **public** entry's chunks.
The gate only runs when a build exists — which is how the dashboard CSS grew
4 KB unseen — so Stage 2 should also make the absence of a build loud.

### 7.6 D8 — reviews and countdown

**Where the automatic source lives: CORE, not an app.** Justified:
- `stages.md:200` forbids an app from writing a fund movement, changing a
  price, approving a settlement or editing the audit log. A verified review
  must **write an audit row** (who published, who hid, the reason) — so it is
  outside what an app may do.
- The rating link is issued off a **delivered order** and must be single-use;
  that is order-pipeline state, not plug-in state.
- The seven existing built-ins are all **external integrations**. An internal
  core feature wearing an app's clothes is a second home for one job.

**GENUINELY NEW — for the owner's approval:**

| # | Thing | Why nothing existing does it |
|---|---|---|
| 1 | `ProductReview` table — product, store, orderId (unique), rating, text, firstName, city, source, status, publishedAt, hiddenReason, createdById | No review/rating model exists anywhere in 66 tables |
| 2 | A signed single-use rating link + its public page | Nothing issues a per-order signed link today |
| 3 | Publish consent (a column on #1, plus the words on the page) | `consent` exists nowhere in this sense |
| 4 | A moderation view (hide with a recorded reason) | — |
| 5 | `ChatRequest.localOnly` + `aiChat` refusing a non-LOCAL route when set | **`ChatRequest` has no such option** — the prompt's own constraint cannot be met without it |
| 6 | Per-product review mode: `manual · auto · both` | — |

**EXTEND, not new:** the `reviews` block gains `source`
(واتساب · تعليق فيسبوك · مكالمة · غيره), an optional private proof image, and
author+timestamp. A manual item can **never** render «مشتري مؤكَّد» — that badge
is bound to row #1 with an `orderId`.

**The auto-switch floor:** when a product has **5** published verified reviews
the system switches that product to `auto` and notifies the owner, who can
switch back. 5 matches `delivery-time.ts`'s `MIN_DELIVERIES` — deliberately the
same number a reader has already learned.

**Countdown:** `endsAt` on the offer is the one fact; the clock reads it. The
existing per-visitor `urgency.minutes` stays and the editor marks it:
⚠️ «العدّاد بيرجع لكل زائر والعرض ما بينتهي» · 🔧 «اربطه بتاريخ انتهاء حقيقي».

---

## 8 · Stages 1–4, refined

### Stage 1 — «المتجر» (after the AI-intake PR merges; it brings CI)

Files: `route-registry.ts` (3 entries + 8 redirects), `storefront.ts`
(`storefrontCatalog` returns one card per product with a shown page),
`LandingPagesScreen` (new pages default `showInStore: true`; one-press "show
all published"), `StorefrontsScreen` → all stores, `StorefrontSettings.tsx`
(move open/close + tagline + about out), a shared `EditingStore` bar used by
every storefront screen, `src/app/s/[store]/p/[sku]/page.tsx` (render the
product's page inside the shell via `LandingPageView`).

**Migrations: none expected.** `showInStore`, `isPublished`, `type`,
`landingPageId` all exist. The one-press is an `updateMany`, not a migration.

Tests: a product with no shown page is absent from the catalogue; a product
with two shown pages is one card; the page renders inside the store shell and
carries `?c=`; `/lp/<slug>` still answers; a cross-store negative test per
storefront route; `route-registry.test.ts` count 62 → 57.

Risks: ⚠️ `storefrontCatalog` returning both pages and products today means a
live store can show a product twice — Stage 1's change is also the fix.
⚠️ All 44 published pages currently have `showInStore: false`, so the store
**empties** the moment the catalogue switches to pages-only. 🔧 The one-press
must ship in the same release, and the screen must say so before the switch.

### Stage 2 — templates and conversion
The three families as engine variants; the 7 dead variants given renderers or
retired; the skin map of §7.3; the D6 matcher; the D7 public-entry budget gate.
Before/after shots per family and skin.

### Stage 3 — management
The IA of §7.1; every screen title + one line + one primary action; help behind
an ⓘ; 360 px; ui-inventory changes listed "from → to".

### Stage 4 — editors
`BlockBuilder`, the home designer, the templates screen: preview beside
controls on desktop, a toggle on mobile; save / preview / publish stay three
separate acts.

**D8 lands in its own stage after Stage 2** — it carries the only new tables,
and mixing a schema change into the template work would put a review migration
behind a design review.

---

## 9 · Addendum 3 — D5 on the growth side

Measured on the same checkout. **Report only; nothing fixed.** These screens
belong to the other task.

### 9.1 The scope columns

| Model | companyId | storeId | countryId | Note |
|---|---|---|---|---|
| `AdAccount` | ✅ | ✅ **NOT NULL** | — | `tokenEncrypted` lives here |
| `Campaign` | ✅ | ✅ **NOT NULL** | — | one store each, as the addendum says |
| `TrackingPixel` | ✅ | `String?` | `String?` | three levels on purpose: this store · this country · all stores |
| `CustomConversion` | ✅ | ❌ | ❌ | `pixelId` only — see the gap below |

### 9.2 Reads and writes

| Route | Methods | Scoped by |
|---|---|---|
| `settings/ad-accounts/route.ts` | GET, POST | company + store |
| `settings/ad-accounts/[id]/route.ts` | GET, DELETE | company + store (`inStore()`) |
| `settings/ad-accounts/oauth/[platform]/start` · `callback` | GET | company + store |
| `growth/campaigns/route.ts` · `import` · `sync` · `[id]` | all | company + store |
| `settings/tracking-pixels/route.ts` · `[id]` | GET, POST, PATCH, DELETE | company + store + country |
| `settings/tracking-pixels/[id]/capi` | PUT | company + pixel |
| **`settings/conversions/route.ts:70,83,91`** | **GET** | **company only** |
| **`settings/conversions/[id]/route.ts:39`** | **PATCH, DELETE** | **company only** |

### 9.3 The one gap — custom conversions do not follow their pixel

`CustomConversion` carries `pixelId` and nothing else that narrows it. Both
its list (`conversions/route.ts:70`) and its write
(`conversions/[id]/route.ts:39`) filter by `companyId` alone.

A `TrackingPixel` may be scoped to one store (`storeId String?`). A conversion
hanging off a store-A pixel is therefore **listed to, and editable by**,
somebody whose context is store B — same company, different shop.

It is consistent across read and write, so it is a **design gap, not a
write-side hole**: the UI is not hiding something the API allows. The fix
belongs with whoever owns these screens — narrow both queries through the
pixel's `storeId`/`countryId`, honouring «all stores» when both are null.

🔧 Suggested shape, not applied: reuse `pixelReaches()` /
`resolvePixelScope()` in `src/lib/tracking/` rather than writing a second
scope rule.

### 9.4 Does each screen say which scope it shows?

| Screen | Says the scope |
|---|---|
| `settings/TrackingPixelsSection.tsx` | ✅ says «كل المتاجر» and «متاجر هذا البلد» — **but never «هذا المتجر»** for a store-scoped pixel |
| `settings/AdAccountsCard.tsx` | ✅ names the store |
| `screens/CampaignsScreen.tsx` | ❌ **says nothing** — campaigns are `storeId NOT NULL`, and the screen never says which store's campaigns these are |

⚠️ `CampaignsScreen` shows one store's campaigns and does not say so.
🔧 The same «عم تعدّل: &lt;المتجر&gt;» bar §3 asks for.

⚠️ `TrackingPixelsSection` names the two wide scopes and not the narrow one, so
a store-only pixel reads as if it were everywhere.
🔧 Add the third label «هذا المتجر فقط».

### 9.5 Ad tokens — no leak found

A sweep flagged three `select`s carrying a token-ish name. **All three are
clear, verified by reading them:**

- `ad-accounts/route.ts` × 2 select `tokenHint` — a masked hint, not a token.
- `ad-accounts/[id]/route.ts:31` selects `tokenEncrypted`, and
  `:41` passes it through `readCredentials()` into one adapter call. The
  response is `{ campaigns }`. The file says so at `:39-40`: «Decrypted for
  this one call and never returned.»

No ad token reaches the browser, and none reaches a model: the only
model-facing payloads in this repo are the assistants in `ai-assistants.ts`,
and none of them has an ads scope.

*(This is the third name-matching over-report in this audit — recorded with
the others in §3 and §6 so a reader weighs the sweeps accordingly.)*

---

## 10 · The owner's answers to Stage 0 — recorded 2026-10-11

| # | Question | Answer |
|---|---|---|
| ① | The catalogue switch | **Approved, on one condition: the store is never empty, not even for a moment.** Until the owner presses «اعرض كل الصفحات المنشورة» the store keeps showing exactly what it shows today; that press shows all published pages **and** switches the catalogue **in the same moment**. |
| ② | Trial cost | **Stays counted** — the money really went out. **No new column now.** |
| ③ | Automatic reviews | **Approved**: review table · signed single-use rating link · publish consent · moderation view. **Additive only, with a rollback, in core (not an app), in their own stage after Stage 2.** `ChatRequest.localOnly` is **not** on this list — it comes from the ecosystem task. |
| ④ | «الوحدة المخزنيّة» | **Pending** — the owner will answer. |
| ⑤ | Stage order | **Approved**: 1 store → 2 templates and conversion → 3 management → 4 editors; reviews in their own stage after 2. |

**This changes Stage 1's plan in §8.** The ⚠️ risk recorded there — «the store
empties the moment the catalogue switches» — is now **closed by design**:
the catalogue change and the one-press are **one atomic act**, not two
releases. Stage 1 must therefore ship `storefrontCatalog`'s new behaviour
**behind** the press, with the old behaviour serving until it happens. Add a
test: before the press, the catalogue is byte-for-byte what it is today.

**Further notes for the later stages:**
- The round «N» badge in `shots/*` is **Next.js dev mode**, not a production
  defect. Disregard it in the before/after comparisons.
- **«منصّة التجريب» stays under النمو** — it does not move into the storefront
  menu. §7.1's proposal is corrected accordingly: the storefront group is
  **المتجر** + **صفحات الهبوط**, two entries, not three.
- A store wearing a **merged or retired** skin (§7.3) **keeps its look** until
  the owner changes it himself. Retiring hides a skin from the picker; it
  never repaints a live shop.

---

## 11 · §9 — قرارات المالك (2026-10-11)

Recorded decisions D1–D8 that govern Stages 1–4, plus the Stage-0 answers
in §10 above (they are not repeated here).

| # | القرار | المنطوق |
|---|---|---|
| D1 | المتجر متعدد المنتجات | `MULTI_PRODUCT` هو المسار الرئيسي للمتاجر الجديدة. `SINGLE_PRODUCT` يبقى مدعومًا للمتاجر القديمة، ولا يُعرض خيارًا جديدًا. |
| D2 | لا منتج بلا صفحة معروضة | لا يظهر المنتج في الكتالوج إلا بصفحة هبوط منشورة ومفعّلة للعرض (`showInStore` + `isPublished`). بطاقة المنتج تفتح `/s/<store>/p/<handle>` وتعرض الصفحة كاملة داخل المتجر عبر `LandingPageView` داخل `StorefrontShell`، مع `?c=` وعنوان أساسي واحد، و`/lp/<slug>` يعمل كما هو. عدة صفحات معروضة لمنتج واحد = بطاقة واحدة. |
| D3 | المتجر لا يفرغ أبدًا | حتى أول صفحة معروضة، الكتالوج كما هو اليوم حرفيًا. زر «اعرض كل الصفحات المنشورة» يفعّل صفحات هذا المتجر فقط بتحديث واحد ويسجّل Audit Log — والضغطة والتحويل فعل واحد. |
| D4 | واجهة لكل متجر | أول مدخل `/store` باسم «المتجر»: بطاقة لكل متجر (الشعار · الاسم · الفتح · الرابط · القالب · المعروض · المخفي · الصحة) + «أدِر هالمتجر» + «افتح المتجر». `/store/single-product` تحويل دائم إلى `/store`. شريط «عم تعدّل: <المتجر>» ومبدّل المتاجر في كل شاشات المتجر. |
| D5 | بطاقة واحدة وقواعد الصفحات | `storefront.ts` يعرض بطاقة واحدة لكل منتج. الصفحات الجديدة داخل المتجر مع منتجات مفعّلة للعرض افتراضيًا (غير المنشورة لا تظهر أبدًا). |
| D6 | المطابق امتداد لا نظام | §7.4 كما هو مكتوب — ليس جزء المرحلة 1. |
| D7 | 250KB للمدخل العام | §7.5 — يُقاس في المرحلة 2، ليس جزء المرحلة 1. |
| D8 | المراجعات والعدّاد | §7.6 — مرحلة مستقلة بعد 2 (إضافي فقط، مع تراجع، في النواة لا تطبيق). `ChatRequest.localOnly` جاء من مهمة المنظومة لا من هنا. |
