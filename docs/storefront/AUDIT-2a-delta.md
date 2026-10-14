# Stage 2a — discovery delta

Only what differs from `AUDIT.md`, measured first-hand on `main` at
`22d08d6`. Nothing here was taken from the Stage 0 audit on trust; every
row below was traced from the declaration to the thing that draws it.

## 1 · The dead variants are 13, not 7

`AUDIT.md` §5 reports «the renderer ignores 7 of the 27 declared
variants» and marks `hero` as 5 declared / 5 drawn. That row is wrong,
and the way it is wrong is instructive: the variant NAMES do appear in a
stylesheet, so a grep finds them and reports a renderer. Tracing the
slot instead of the name gives a different answer.

### How each slot was traced

`layoutOf(theme, slot)` is the only way a skin's layout pick reaches a
renderer. It is called in exactly seven places:

| Call site | Slot |
|---|---|
| `StorefrontShell.tsx:93` | `header` → `data-header` |
| `s/[store]/page.tsx:202`, `shop/page.tsx:229` | `categoryNav` → `data-nav` |
| `s/[store]/page.tsx:217`, `shop/page.tsx:257`, `p/[sku]/page.tsx:418` | `productCard` → `data-card` |
| `p/[sku]/page.tsx:289` | `productPage` → `data-product` |

Four slots. **`hero`, `categoryPage` and `cart` are never read at all.**

The attribute-driven ones are then only as alive as the stylesheet. Every
`[data-*='…']` selector in `src/components/storefront/styles.ts`:

```
[data-header]  [data-header='stacked'] [data-header='transparent']
               [data-header='split']   [data-header='searchFirst']
[data-nav='tiles'] [data-nav='sidebar'] [data-nav='dropdown']
[data-card='wide'] [data-card='compact'] [data-card='square'] [data-card='portrait']
[data-product='sticky'] [data-product='galleryTop'] [data-product='gallerySide']
```

### The table

| Slot | Declared | Drawn in the shop | Dead |
|---|---|---|---|
| `header` | 5 | 4 | `minimal` |
| **`hero`** | **5** | **0** | **productFirst · offerStrip · categoryTiles · editorial · slider** |
| `categoryNav` | 4 | 3 | `chips` |
| `productCard` | 4 | 4 | — |
| `categoryPage` | 4 | 0 | grid2 · grid3 · list · mixed |
| `productPage` | 3 | 3 | — |
| `cart` | 2 | 0 | drawer · page |
| **Total** | **27** | **14** | **13** |

`cart` counts two, not one: the slot is unread, so `page` is not chosen
either — it is simply the only behaviour there is. A seller who picks
`page` gets what they asked for by coincidence.

## 2 · ⚠️ The gallery promises five heroes the shop does not draw

This is the finding that matters most, and `AUDIT.md` does not have it.

`src/components/store/SkinPreview.tsx:197-212` reads `layout.hero` and
draws a different miniature for `offerStrip`, `categoryTiles`,
`editorial`, `slider` and the default. The seller opens «القوالب», sees
five visibly different first screens, picks one — and the shop draws
none of them.

What the shop actually draws is fixed, at `s/[store]/page.tsx:191-196`:

```tsx
{store.tagline && (
  <section className="sf-hero">
    <h1>{store.tagline}</h1>
    {store.about && <p>{store.about}</p>}
  </section>
)}
```

One shape, no variant, and nothing at all when the seller has left the
tagline empty. §5's own «Empty hero on the store home» row is the same
fact seen from the other side.

**Why the audit read it as alive.** `src/components/landing/blocks/styles.ts`
does carry `.lp-hero[data-hero='productFirst' | 'offerStrip' |
'categoryTiles' | 'editorial']` rules — real renderers, four of them. But
`data-hero` is set at `PageBlocks.tsx:838` from `s.variant`: the hero
BLOCK's own setting inside a landing page, chosen in the block builder.
It is a different vocabulary that happens to share its words with
`LAYOUT_SLOTS.hero`, and the skin's pick never reaches it.

🔧 Two names, one word. Stage 2a gives the store its own hero and the
two stop being confusable; until then, `LAYOUT_SLOTS.hero` is a setting
the seller can see, preview, save — and never get.

## 3 · What this changes in the Stage 2a plan

`AUDIT.md` §7.2 lists the engine parts each family needs and says:

> `hero`: عيادة = a new `splitProof` variant; عطّار = `editorial`;
> ترند = `offerStrip` (exists).

Neither exists **as a store hero**. Both exist as landing BLOCK heroes.
So the family work is not «add one hero variant to four that work» — it
is **build the store's hero engine, then give it three variants**. The
same is true of `categoryPage`, where the task brief already says so.

Sizes, measured rather than guessed:

| Task brief item | AUDIT's assumption | Measured | Delta |
|---|---|---|---|
| 2 · the dead variants | 7 | **13** | +6 |
| 3 · hero variants for the families | 1 new, 2 reused | **3 new + the engine that reads them** | the engine |
| 3 · `minimal` header | needs a renderer | confirmed — no `[data-header='minimal']` rule | — |
| 3 · `productCard: tile` | 1 new | confirmed — the other 4 are drawn | — |
| 2 · `categoryPage` | 4 dead, ≥3 need renderers | confirmed — slot never read | — |

## 4 · Unchanged from AUDIT.md

Verified still true, so Stage 2a can build on them:

- `productCard` draws all four declared variants.
- `productPage` draws all three.
- `header` is 4 of 5, missing exactly `minimal`.
- `categoryNav` is 3 of 4, missing exactly `chips`.
- The skin contract carries `type.{heading,body}`, so family typography
  needs no new field.
- The live store `main` is configured with `categoryNav: 'chips'` — a
  dead variant — and so is silently on the default today.
