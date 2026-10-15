import { BLOCK_CSS } from '@/components/landing/blocks/styles';
import { minifyCss } from '@/lib/css-minify';
import { FAMILY_IDS, type FamilyId } from '@/lib/store-families';

/**
 * The storefront's own styles, on top of the landing page's.
 *
 * Only what a shop needs that a single page does not: a header that carries
 * the brand, a grid of products, and a product page's two columns. Every
 * colour still reads a `--store-*` variable the theme derived, so one colour
 * picker restyles the whole shop exactly as it restyles one page.
 */
/**
 * THE HERO'S RULES, EXPORTED ON THEIR OWN.
 *
 * The template gallery's miniature draws the SAME `StoreHero` component
 * the shop does, inside the dashboard, where the shop's whole stylesheet
 * has no business being loaded. So this slice stands alone and
 * `SkinPreview` injects it: one set of `[data-hero-slot]` rules for both,
 * which is the other half of «the gallery cannot promise a first screen
 * the shop does not draw».
 */
/**
 * HOW MANY WORLDS «علامة»'s FIRST SCREEN STACKS — one list, two readers.
 *
 * `StoreHero` slices the shelf to this many stages and this sheet writes
 * one pair of rules for each. A stage with no rule would be a world a
 * shopper could choose and never see, which is the whole family of bugs
 * `layout-slots.ts` exists to prevent, one level down.
 */
export const WORLD_STAGES = [0, 1, 2] as const;

export const HERO_CSS = `
/* ────────────────────────────────────────────────────────────────────
   THE FIVE FIRST SCREENS — one rule each, and that is the point.

   «LAYOUT_SLOTS.hero» named five of these and the shop drew none: no
   «[data-hero-slot]» existed, because nothing set the attribute. The
   gallery drew five miniatures of its own, so the promise was visible
   and the delivery was not. «StoreHero.tsx» sets the attribute; these
   are what it means. A variant with no rule below is a variant the
   guard refuses — see «layout-variants.test.ts».
   ──────────────────────────────────────────────────────────────────── */
.sf-hx {
  display: grid;
  gap: 12px;
  padding: 20px 20px 4px;
  max-width: 1100px;
  margin: 0 auto;
  width: 100%;
}
.sf-hx a, .sf-hx > span { color: inherit; text-decoration: none; min-height: 44px; }
.sf-hx-img {
  display: block;
  position: relative;
  /* 4:3 and NOT a square. Measured at 390: a full-width square put the
     first product's price at 600px of an 844px screen, so the one thing
     the hero exists to show — something to buy, priced, in the first
     screen — fell below the fold. The hero was losing the argument it
     was built to win. */
  aspect-ratio: 4 / 3;
  max-height: 46vh;
  border-radius: calc(var(--store-radius) * .8);
  background: var(--store-surface);
  overflow: hidden;
}
.sf-hx-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
/* The shop-wide answer to «no photograph yet»: the initial, never a grey
   square. Same rule the card and the catalogue block already use. */
.sf-hx-img:not(:has(img))::after {
  content: attr(data-letter);
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 2rem;
  font-weight: 800;
  color: color-mix(in srgb, var(--store-accent) 55%, transparent);
}
.sf-hx-name { display: block; font-size: 16px; font-weight: 700; line-height: 1.5; }
.sf-hx-price { display: block; font-size: 15px; color: var(--store-accent); font-weight: 800; }

/* productFirst — the goods, big, before anything else. */
.sf-hx[data-hero-slot='productFirst'] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.sf-hx[data-hero-slot='productFirst'] .sf-hx-feature:first-child { grid-column: 1 / -1; }
.sf-hx[data-hero-slot='productFirst'] .sf-hx-feature:first-child .sf-hx-img { aspect-ratio: 16 / 9; }

/* offerStrip — the cheapest «من» prices, as a strip, scrolled by hand. */
.sf-hx[data-hero-slot='offerStrip'] {
  grid-auto-flow: column;
  grid-auto-columns: minmax(44%, 1fr);
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  padding-bottom: 12px;
}
.sf-hx[data-hero-slot='offerStrip'] .sf-hx-offer {
  scroll-snap-align: start;
  border: 1px solid var(--store-border);
  border-radius: var(--store-radius);
  padding: 14px;
  background: color-mix(in srgb, var(--store-accent) 7%, var(--store-card));
}

/* categoryTiles — the ways in, for a shopper who knows the kind. */
.sf-hx[data-hero-slot='categoryTiles'] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.sf-hx[data-hero-slot='categoryTiles'] .sf-hx-tile {
  display: grid;
  place-items: center;
  padding: 18px 10px;
  border: 1px solid var(--store-border);
  border-radius: var(--store-radius);
  background: var(--store-surface);
  text-align: center;
}

/* editorial — the shop's own sentence, set like one, with a way forward. */
.sf-hx[data-hero-slot='editorial'] { grid-template-columns: 1fr; align-items: center; }
.sf-hx[data-hero-slot='editorial'] .sf-hx-say { display: grid; gap: 10px; }
.sf-hx[data-hero-slot='editorial'] strong {
  font-size: clamp(24px, 5vw, 38px);
  font-weight: var(--store-heading-weight);
  line-height: 1.3;
}
.sf-hx[data-hero-slot='editorial'] em { font-style: normal; font-size: 16px; color: var(--store-muted); line-height: 1.8; }
.sf-hx[data-hero-slot='editorial'] .sf-hx-go {
  justify-self: start;
  display: inline-grid;
  place-items: center;
  padding: 0 22px;
  min-height: 44px;
  border-radius: 999px;
  background: var(--store-accent);
  color: var(--store-accent-text, #fff);
  font-weight: 800;
}

/* slider — three, side by side, scrolled by hand. Nothing moves on its
   own: the motion rule the template contract already enforces. */
.sf-hx[data-hero-slot='slider'] {
  grid-auto-flow: column;
  grid-auto-columns: 78%;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  padding-bottom: 12px;
}
.sf-hx[data-hero-slot='slider'] .sf-hx-slide { scroll-snap-align: center; }

@media (min-width: 720px) {
  .sf-hx[data-hero-slot='productFirst'] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .sf-hx[data-hero-slot='productFirst'] .sf-hx-feature:first-child { grid-column: auto; }
  .sf-hx[data-hero-slot='categoryTiles'] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .sf-hx[data-hero-slot='editorial'] { grid-template-columns: 1.1fr .9fr; }
  .sf-hx[data-hero-slot='offerStrip'] { grid-auto-columns: minmax(0, 1fr); overflow: visible; }
  .sf-hx[data-hero-slot='slider'] { grid-auto-columns: minmax(0, 1fr); overflow: visible; }
}


/* The gallery's miniature is the SAME markup at preview scale — which is
   how a hero that does not exist here can no longer be promised there. */
.sf-hx[data-mini] { padding: 8px 8px 2px; gap: 5px; max-width: none; }
.sf-hx[data-mini] .sf-hx-name { font-size: 8px; font-weight: 700; }
.sf-hx[data-mini] .sf-hx-price { font-size: 8px; }
.sf-hx[data-mini] .sf-hx-img::after { font-size: .7rem; }
.sf-hx[data-mini] strong { font-size: 11px; }
.sf-hx[data-mini] em { font-size: 8px; }
.sf-hx[data-mini] a, .sf-hx[data-mini] > span { min-height: 0; }
.sf-hx[data-mini] .sf-hx-go { min-height: 0; padding: 3px 9px; font-size: 8px; }
.sf-hx[data-mini] .sf-hx-offer, .sf-hx[data-mini] .sf-hx-tile { padding: 6px; }
`;

export const STOREFRONT_CSS = `
.sf-root { min-height: 100vh; display: flex; flex-direction: column; }
.sf-root main { flex: 1; }

/* ── header ── */
.sf-header {
  /* Both from the store's template (storeThemeVars), with the derived
     palette as the fallback — a shop that set neither looks as it always
     did, and no colour or height is written here as a literal. */
  background: color-mix(in srgb, var(--store-header-bg, var(--store-card)) 82%, transparent);
  /* THE PAGE MOVES UNDER IT. A flat opaque bar with a hairline is a
     browser chrome; a shop's header should feel like glass over the
     goods. Falls back to the solid colour where backdrop-filter is not
     supported, which is what the rule above already paints. */
  backdrop-filter: saturate(160%) blur(14px);
  -webkit-backdrop-filter: saturate(160%) blur(14px);
  border-bottom: 1px solid color-mix(in srgb, var(--store-border) 70%, transparent);
  z-index: 20;
}
/* Sticky is a setting, so it is a class the shell adds, not a rule that
   always applies. */
.sf-header-sticky {
  position: sticky;
  top: 0;
}
.sf-header-inner {
  max-width: 1100px;
  margin: 0 auto;
  /* The seller's header height, less the padding the content needs. */
  min-height: var(--store-header-h, 72px);
  padding: 12px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.sf-header-menu {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 18px;
  margin-inline-start: auto;
}
.sf-header-menu a {
  color: var(--store-text);
  font-size: 14px;
  text-decoration: none;
  white-space: nowrap;
}
.sf-header-menu a:hover { color: var(--store-accent); }
.sf-footer-links {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px 16px;
  margin-bottom: 10px;
}
.sf-footer-links a {
  color: var(--store-muted);
  font-size: 13px;
  text-decoration: none;
}
.sf-footer-links a:hover { color: var(--store-accent); }
/* A page of the shop's own words: measured for reading, not for selling. */
.sf-page {
  max-width: 680px;
  margin: 0 auto;
  padding: 28px 20px 48px;
}
.sf-page h1 {
  font-size: 26px;
  line-height: 1.35;
  font-weight: var(--store-heading-weight, 800);
  color: var(--store-text);
  margin-bottom: 18px;
}
.sf-page p {
  color: var(--store-text);
  font-size: 15px;
  line-height: 1.9;
  margin-bottom: 14px;
  white-space: pre-line;
}
.sf-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: inherit;
  min-width: 0;
}
.sf-logo { height: 38px; width: auto; max-width: 140px; object-fit: contain; }
.sf-brand strong {
  display: block;
  /* The shop's name is the largest thing in its header. It was 16px,
     smaller than the phone number beside it. */
  font-size: 19px;
  font-weight: var(--store-heading-weight);
  line-height: 1.25;
  letter-spacing: -.3px;
}
.sf-brand em {
  display: block;
  font-style: normal;
  font-size: 12px;
  color: var(--store-muted);
  margin-top: 1px;
  /* ONE LINE. A tagline of six words wrapped to three lines on a phone and
     made the header taller than the hero it sits above. */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 44vw;
}
/* The brand must be able to shrink for that ellipsis to ever happen: a
   flex item will not go below its content width without this. */
.sf-brand > span { min-width: 0; }
/* A SHOP WITH NO LOGO STILL HAS A MARK. Most new shops have not uploaded
   one, and a bare line of text is not a brand. The initial in the shop's
   own colour is, and it disappears the moment a real logo arrives. */
.sf-mark {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  border-radius: 13px;
  font-size: 19px;
  font-weight: 900;
  line-height: 1;
  color: var(--store-accent-text, #fff);
  background: linear-gradient(135deg, var(--store-accent) 0%, var(--store-accent-dark, var(--store-accent)) 100%);
  box-shadow: 0 6px 16px -6px color-mix(in srgb, var(--store-accent) 70%, transparent);
}
/* The phone is a call button, not a caption. It is the one thing a
   hesitant shopper reaches for. */
.sf-phone {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  white-space: nowrap;
  font-size: 13.5px;
  font-weight: 800;
  text-decoration: none;
  color: var(--store-accent);
  padding: 9px 15px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--store-accent) 28%, transparent);
  background: color-mix(in srgb, var(--store-accent) 8%, transparent);
  transition: background .2s ease, box-shadow .2s ease, transform .2s ease;
}
.sf-phone:hover {
  background: var(--store-accent);
  color: var(--store-accent-text, #fff);
  box-shadow: 0 8px 20px -8px color-mix(in srgb, var(--store-accent) 85%, transparent);
}

/* ── back link ── */
.sf-back { max-width: 1100px; margin: 0 auto; padding: 14px 20px 0; }
.sf-back a {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--store-muted);
  text-decoration: none;
}
.sf-back a:hover { color: var(--store-accent); }

/* ── THE SHOP'S OWN AIR ──
   Scoped to .sf-root, which only a store page wears: a landing page uses
   the same blocks and must keep looking exactly as its seller built it.

   The hero block was a headline on flat white. A shop's first screen is
   the one thing a visitor judges it by, so it gets a wash of the shop's
   own colour, room to breathe, and a heading with some size to it. */
.sf-root .lp-hero {
  position: relative;
  padding-block: clamp(46px, 8vw, 86px);
  background:
    radial-gradient(85% 120% at 50% -20%, color-mix(in srgb, var(--store-accent) 15%, transparent) 0%, transparent 65%),
    radial-gradient(60% 80% at 88% 8%, color-mix(in srgb, var(--store-accent) 9%, transparent) 0%, transparent 70%);
}
/* A hairline of the shop's colour where the hero ends, instead of nothing. */
.sf-root .lp-hero::after {
  content: '';
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--store-accent) 35%, transparent), transparent);
}
.sf-root .lp-hero h1 { letter-spacing: -.8px; line-height: 1.2; }

/* The one button on the first screen. It was a flat rectangle the same
   weight as a form field; on a shop's front page it is the invitation. */
.sf-root .lp-hero .lp-cta {
  padding: 15px 38px;
  border-radius: 999px;
  font-size: 15.5px;
  box-shadow: 0 14px 30px -12px color-mix(in srgb, var(--store-accent) 85%, transparent);
}
.sf-root .lp-hero .lp-cta:hover {
  transform: translateY(-2px);
  box-shadow: 0 20px 40px -14px color-mix(in srgb, var(--store-accent) 95%, transparent);
}

/* THE SHELF THE GOODS SIT ON — AND ROOM TO PUT THEM.
   A block section is 760px wide, which is right for reading a landing
   page and too narrow for a shop: three columns of goods in 720px is a
   catalogue squeezed into an article. Only where the goods actually are,
   and only in a shop.

   And white cards on a white page lean entirely on their shadow, which on
   a bright screen reads as flat. A barely-there wash of the shop's own
   colour gives them something to lift off, with a radius so it reads as a
   shelf rather than a band that ran out of page. If :has() is unsupported
   nothing happens and the section is what it always was. */
.sf-root .lp-section:has(> .lp-catalog),
.sf-root .lp-section:has(> .lp-catalog-cats) {
  max-width: 1180px;
  padding-inline: clamp(16px, 3vw, 34px);
  border-radius: 28px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--store-accent) 5%, transparent) 0%, transparent 42%),
    color-mix(in srgb, var(--store-accent) 3%, var(--store-page));
}

/* Section headings, centred with a short rule under them: a shop is a
   sequence of sections and they need a rhythm a page does not. */
.sf-root .lp-section { padding-block: clamp(34px, 5vw, 56px); }
.sf-root .lp-section > .lp-h2 {
  text-align: center;
  position: relative;
  padding-bottom: 14px;
  margin-bottom: 26px;
  letter-spacing: -.4px;
}
.sf-root .lp-section > .lp-h2::after {
  content: '';
  position: absolute;
  /* PHYSICAL, BOTH OF THEM. An inset-inline-start of 50% with a positive
     translateX centres this in RTL and pushes it off-centre in LTR — and
     a shop's language is the seller's choice, so half of them would have
     had a rule floating off to one side.
     (No backticks anywhere in this file: it is one template literal.) */
  left: 50%;
  transform: translateX(-50%);
  bottom: 0;
  width: 46px;
  height: 3px;
  border-radius: 999px;
  background: var(--store-accent);
}

/* ── shop hero ── */
/* The first screen of a shop that has not built a home page yet — which
   is most shops on their first day. It gets the same air as the hero
   block, so the two never look like two different products. */
.sf-hero {
  position: relative;
  padding: clamp(42px, 7vw, 74px) 20px clamp(26px, 4vw, 40px);
  text-align: center;
  background:
    radial-gradient(85% 120% at 50% -20%, color-mix(in srgb, var(--store-accent) 15%, transparent) 0%, transparent 65%),
    radial-gradient(60% 80% at 88% 8%, color-mix(in srgb, var(--store-accent) 9%, transparent) 0%, transparent 70%);
}
.sf-hero::after {
  content: '';
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--store-accent) 35%, transparent), transparent);
}
.sf-hero h1 {
  font-size: clamp(26px, 5.4vw, 40px);
  font-weight: var(--store-heading-weight);
  margin: 0 auto 10px;
  max-width: 900px;
  letter-spacing: -.7px;
  line-height: 1.25;
}
.sf-hero p { font-size: 15px; color: var(--store-muted); max-width: 620px; margin: 0 auto; line-height: 1.8; }

${HERO_CSS}

/* And the goods sit on the same faint shelf the catalogue block's do. */
.sf-grid-wrap {
  border-radius: 28px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--store-accent) 5%, transparent) 0%, transparent 42%),
    color-mix(in srgb, var(--store-accent) 3%, var(--store-page));
}

/* ── product grid ── */
.sf-grid-wrap { max-width: 1100px; margin: 0 auto; padding: 24px 20px 40px; }
.sf-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

/* ── the category page's density — four names, nothing behind any of them
   until now. Declared in LAYOUT_SLOTS, validated by the contract, offered
   in the editor, chosen by all ten skins, and read by NO renderer: every
   shop's category page was identical. «mixed» is retired rather than
   built (see RETIRED_VARIANTS) — it needs a rule for which product earns
   the big cell, and this system invents no ranking. ── */
.sf-grid[data-catpage='grid2'] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.sf-grid[data-catpage='grid3'] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
/* list — one per row, the picture small and the words given the width.
   For a shop whose products are told apart by their names, not their
   photographs. */
.sf-grid[data-catpage='list'] { grid-template-columns: 1fr; gap: 10px; }
.sf-grid[data-catpage='list'] .sf-card { display: grid; grid-template-columns: 92px 1fr; align-items: center; gap: 12px; }
.sf-grid[data-catpage='list'] .sf-card-img { aspect-ratio: 1; }
@media (min-width: 720px) {
  .sf-grid[data-catpage='grid3'] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .sf-grid[data-catpage='grid2'] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sf-grid[data-catpage='list'] .sf-card { grid-template-columns: 120px 1fr; }
}
/* THE SAME CARD AS THE CATALOGUE BLOCK'S.
   This grid is what a shop shows before its seller builds a home page, so
   it is the first thing most shops look like. Left as a bordered box while
   the catalogue block became an object with depth, the two halves of one
   product would have looked like two different shops. */
.sf-card {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--store-card);
  border-radius: calc(var(--store-radius) + 6px);
  overflow: hidden;
  text-decoration: none;
  color: inherit;
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--store-text) 6%, transparent),
    0 1px 2px color-mix(in srgb, var(--store-text) 8%, transparent),
    0 8px 24px -12px color-mix(in srgb, var(--store-text) 22%, transparent);
  transition: transform .28s cubic-bezier(.2, .7, .3, 1), box-shadow .28s cubic-bezier(.2, .7, .3, 1);
}
.sf-card:hover {
  transform: translateY(-4px);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--store-accent) 24%, transparent),
    0 2px 4px color-mix(in srgb, var(--store-text) 10%, transparent),
    0 20px 40px -16px color-mix(in srgb, var(--store-accent) 42%, transparent);
}
.sf-card-img {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  background: var(--store-page);
  display: block;
  transition: transform .5s cubic-bezier(.2, .7, .3, 1);
}
.sf-card:hover .sf-card-img { transform: scale(1.055); }
/* Not a flat tint: a shop whose products have no photographs yet was a
   page of identical grey squares. */
.sf-card-none {
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 1 / 1;
  background:
    radial-gradient(120% 90% at 22% 12%, color-mix(in srgb, var(--store-accent) 16%, transparent) 0%, transparent 62%),
    linear-gradient(140deg, color-mix(in srgb, var(--store-accent) 9%, var(--store-card)) 0%, var(--store-card) 70%);
}
.sf-card-none::after {
  content: attr(data-letter);
  font-size: clamp(26px, 7vw, 40px);
  font-weight: 900;
  line-height: 1;
  color: color-mix(in srgb, var(--store-accent) 30%, transparent);
}
/* ── The shelf's own controls: categories, sort, count, «عرض المزيد» ──
   Every one of them is a LINK. The shelf renders on the server, so a
   shopper on a slow phone sees it and can move around it before any
   script has run — and the footer stays reachable, which on a shop is
   where the return policy and the phone number are. */
.sf-chip {
  display: inline-block;
  padding: 7px 14px;
  border-radius: 999px;
  border: 1px solid var(--store-border);
  background: var(--store-card);
  color: var(--store-muted);
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
  /* 44px of touch target on a phone, whatever the text does. */
  min-height: 36px;
  line-height: 20px;
}
.sf-chip:hover { border-color: var(--store-accent-border); color: var(--store-text); }
/* The one the shopper is standing on, said to a screen reader by
   aria-current and shown here by the accent. */
.sf-chip[aria-current] {
  background: var(--store-accent);
  border-color: var(--store-accent);
  color: var(--store-accent-text);
}
.sf-count { font-size: 12.5px; color: var(--store-muted); }

/* ── THE PRODUCT PAGE: gallery beside the details, or above them ──
   On a phone there is only one answer and every variant gives it: the
   gallery, then the locked core (the price, the two buttons, the
   cash-on-delivery line), and only then the prose. The variant is about
   a wide screen, where there is a choice to make.

   «sticky» keeps the gallery in view while the details scroll — for a
   product somebody reads a long way down. */
@media (min-width: 900px) {
  .sf-product[data-product='gallerySide'] .sf-product-top,
  .sf-product[data-product='sticky'] .sf-product-top {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 28px;
    align-items: start;
  }
  .sf-product[data-product='sticky'] .sf-gallery {
    position: sticky;
    /* Clear of the header, which may be stuck to the top too. */
    top: calc(var(--store-header-h) + 16px);
  }
  .sf-product[data-product='galleryTop'] .sf-product-top {
    display: flex;
    flex-direction: column;
    gap: 22px;
  }
}

/* ── THE FLOATING WHATSAPP ──
   A fixed corner, and CLEAR OF THE BOTTOM BAR. The offset is one
   variable that both this and any bottom bar read, so the two cannot
   drift into each other — a button covering «إتمام الطلب» costs a sale
   to save a tap. The safe-area inset is added on top, for a phone with
   a home indicator. */
.sf-root { --store-bottom-bar: 0px; }
.sf-float-wa {
  position: fixed;
  inset-inline-end: 16px;
  inset-block-end: calc(16px + var(--store-bottom-bar) + env(safe-area-inset-bottom, 0px));
  z-index: 30;
  display: inline-flex; align-items: center; justify-content: center;
  width: 52px; height: 52px; border-radius: 999px;
  color: var(--store-accent-text); background: var(--store-accent);
  box-shadow: 0 6px 20px rgb(0 0 0 / .18);
  text-decoration: none;
}
/* When a bottom bar is on the page it states its own height here, and
   the button steps up by exactly that. */
.sf-root:has(.sf-sheet:not([hidden])) { --store-bottom-bar: 64px; }

/* ── THE WAY IN: four arrangements of one list of categories ──
   Links, never a control: choosing a category is a page, so it is
   bookmarkable and behind the back button, and nothing waits for a
   script. Even «dropdown» is a list styled to look like one. */
.sf-cats { display: flex; gap: 10px; flex-wrap: wrap; }
.sf-cat {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 7px 14px; border-radius: 999px;
  border: 1px solid var(--store-border); background: var(--store-card);
  color: var(--store-muted); text-decoration: none;
  font-size: 13px; font-weight: 700; min-height: 36px;
}
.sf-cat[aria-current] {
  background: var(--store-accent); border-color: var(--store-accent);
  color: var(--store-accent-text);
}
.sf-cat-mark, .sf-cat-img { display: none; }
.sf-cat-mark::after { content: attr(data-letter); font-weight: 900; }

/* Circles with pictures. */
/* chips — the shape the nav fell back to for every store that chose it,
   with no rule of its own saying so. Now it says so, and it is a pill
   rail that scrolls rather than wrapping to three lines on a phone. */
.sf-cats[data-nav='chips'] { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; gap: 8px; }
.sf-cats[data-nav='chips']::-webkit-scrollbar { display: none; }
.sf-cats[data-nav='chips'] .sf-cat { flex: 0 0 auto; border-radius: 999px; }

.sf-cats[data-nav='tiles'] { gap: 14px; }
.sf-cats[data-nav='tiles'] .sf-cat {
  flex-direction: column; gap: 7px; padding: 0;
  border: 0; background: none; border-radius: 0;
}
.sf-cats[data-nav='tiles'] .sf-cat-mark,
.sf-cats[data-nav='tiles'] .sf-cat-img {
  display: flex; align-items: center; justify-content: center;
  width: 68px; height: 68px; border-radius: 999px;
  object-fit: cover;
  background: var(--store-accent-tint); color: var(--store-accent);
  border: 1px solid var(--store-accent-border);
}
.sf-cats[data-nav='tiles'] .sf-cat[aria-current] .sf-cat-mark {
  background: var(--store-accent); color: var(--store-accent-text);
}
.sf-cats[data-nav='tiles'] .sf-cat[aria-current] { color: var(--store-text); }

/* One scrollable line — for a shop with more categories than fit. */
.sf-cats[data-nav='sidebar'] {
  flex-wrap: nowrap; overflow-x: auto;
  scrollbar-width: none; -webkit-overflow-scrolling: touch;
}
.sf-cats[data-nav='sidebar']::-webkit-scrollbar { display: none; }
.sf-cats[data-nav='sidebar'] .sf-cat { flex: 0 0 auto; }

/* A quiet stack that reads as a menu, without being one. */
.sf-cats[data-nav='dropdown'] { flex-direction: column; align-items: stretch; gap: 0; }
.sf-cats[data-nav='dropdown'] .sf-cat {
  border-radius: 0; border-inline: 0; border-block-start: 0;
  justify-content: space-between;
}
.sf-cats[data-nav='dropdown'] .sf-cat:first-child { border-block-start: 1px solid var(--store-border); }

/* ── THE FOUR CARDS ──
   One component, four arrangements. Every one keeps a FIXED image ratio
   (a grid of different heights saws up and down, and on a phone that is
   most of what a shopper sees of a shop), the designed empty state, and
   the price — which is in the locked core, because a card that makes
   somebody tap to find out what a thing costs has spent a page load on a
   question it could have answered. */
.sf-card[data-card='square'] .sf-card-img,
.sf-card[data-card='square'] .sf-card-none { aspect-ratio: 1 / 1; }
.sf-card[data-card='portrait'] .sf-card-img,
.sf-card[data-card='portrait'] .sf-card-none { aspect-ratio: 4 / 5; }
.sf-card[data-card='compact'] .sf-card-img,
.sf-card[data-card='compact'] .sf-card-none { aspect-ratio: 1 / 1; }
.sf-card[data-card='compact'] .sf-card-body { padding: 9px 10px 11px; gap: 5px; }
.sf-card[data-card='compact'] .sf-card-name { font-size: 12.5px; -webkit-line-clamp: 1; }

/* Wide is the one that changes the shape of the card rather than the
   picture in it: the image sits beside the words instead of above them,
   which reads as a list and suits a shop whose products look alike. */
.sf-card[data-card='wide'] { flex-direction: row; align-items: stretch; }
.sf-card[data-card='wide'] .sf-card-img,
.sf-card[data-card='wide'] .sf-card-none { width: 108px; flex: 0 0 108px; aspect-ratio: 1 / 1; }
.sf-card[data-card='wide'] .sf-card-body { justify-content: center; }

/* ── THE HEADER'S LOCKED CORE, AND THE FOUR ARRANGEMENTS OF IT ──
   The search, the basket and the WhatsApp button are drawn by the engine
   on every page and no customisation removes them. the data-header attribute decides
   only WHERE they sit — a variant is an arrangement, never a subtraction.
   On a phone all four collapse to the same order: logo · search · cart ·
   menu, «بلا ازدحام». */
.sf-search { display: flex; align-items: center; gap: 6px; flex: 1 1 180px; min-width: 0; }
.sf-search input {
  flex: 1; min-width: 0;
  padding: 9px 12px;
  font: inherit; font-size: 13.5px;
  color: var(--store-text);
  background: var(--store-page);
  border: 1px solid var(--store-border);
  border-radius: 999px;
}
.sf-search button {
  display: inline-flex; align-items: center; justify-content: center;
  /* 40px: a thumb target, not an icon. */
  width: 40px; height: 40px;
  border: 0; border-radius: 999px; cursor: pointer;
  color: var(--store-accent-text); background: var(--store-accent);
}
.sf-cart {
  position: relative;
  display: inline-flex; align-items: center; justify-content: center;
  width: 40px; height: 40px; border-radius: 999px;
  color: var(--store-text); text-decoration: none;
}
.sf-cart-count {
  position: absolute; inset-block-start: 0; inset-inline-end: 0;
  min-width: 18px; height: 18px; padding: 0 4px;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 800; line-height: 1;
  color: var(--store-accent-text); background: var(--store-accent);
  border-radius: 999px;
}
.sf-whatsapp {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 9px 13px; border-radius: 999px;
  font-size: 13px; font-weight: 800; text-decoration: none;
  color: var(--store-accent-text); background: var(--store-accent);
}
.sf-assure {
  margin: 0;
  padding: 7px 20px;
  font-size: 12px; font-weight: 700; text-align: center;
  color: var(--store-muted);
  background: var(--store-surface-2);
  border-top: 1px solid var(--store-border);
}

/* The arrangements. Each moves the same children; none hides one. */
/* Over the hero rather than above it. The locked core keeps its
   contrast: the bar carries the card colour at most of its opacity, so
   the search and the basket stay readable on whatever photograph a
   seller uploaded — text straight on an image is text half of them
   cannot read. */
/* minimal — chosen by ritual, heritage and tender, and drawn by nothing:
   those three shops silently wore the default bar. It is the quietest
   header the engine has — no search, no menu, the name and the cart —
   for a shop whose first screen is meant to carry the whole argument. */
/* The search and the basket STAY. «البحث والسلة وزر واتساب موجودة في كل
   نسخة — ما يتغيّر هو ترتيبها»: what a header variant may change is the
   arrangement, never the presence, and «header-core.test.tsx» holds that
   down. A first draft of this rule hid both and the guard caught it. So
   minimal is quiet by ARRANGEMENT: no menu row, the name and the basket
   at the two ends, and the search given only the width it needs. */
.sf-header[data-header='minimal'] .sf-header-menu { display: none; }
.sf-header[data-header='minimal'] .sf-header-inner { justify-content: space-between; }
.sf-header[data-header='minimal'] .sf-search { max-width: 190px; }

.sf-header[data-header='transparent'] {
  background: color-mix(in oklab, var(--store-card) 82%, transparent);
  backdrop-filter: blur(8px);
  border-block-end: 0;
}
.sf-header[data-header='searchFirst'] .sf-search { order: -1; flex-basis: 100%; }
.sf-header[data-header='split'] .sf-header-menu { order: -1; }
.sf-header[data-header='stacked'] .sf-header-inner { flex-wrap: wrap; justify-content: center; }
.sf-header[data-header='stacked'] .sf-header-menu { flex-basis: 100%; justify-content: center; }

@media (max-width: 767px) {
  /* One order on a phone, whatever the template chose: the arrangements
     are about room, and there is none here. */
  .sf-header[data-header] .sf-header-inner { flex-wrap: wrap; }
  .sf-header[data-header] .sf-search { order: 9; flex-basis: 100%; }
  .sf-header[data-header] .sf-phone { display: none; }
  .sf-header[data-header] .sf-whatsapp span { display: none; }
}

/* A row of cards under a product: «يُشترى معه عادةً» and «شوهد مؤخراً».
   Both draw nothing at all when they have nothing — a heading over an
   empty row is a shop saying it remembers you and has nothing to show. */
.sf-row { display: flex; flex-direction: column; gap: 14px; margin-top: 34px; }
.sf-row h2 { font-size: 15px; font-weight: 800; color: var(--store-text); margin: 0; }

/* ── The filter sheet ──
   A BOTTOM SHEET ON A PHONE, NEVER A SIDE COLUMN. A side column at 360px
   is either a drawer nobody finds or half the grid gone — and the thumb
   that has to reach it is at the bottom of the phone. On a wide screen
   there is room, so it settles into the page instead of covering it. */
.sf-sheet {
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  z-index: 40;
  max-height: 70vh;
  overflow-y: auto;
  background: var(--store-card);
  border-top: 1px solid var(--store-border);
  border-start-start-radius: var(--store-radius);
  border-start-end-radius: var(--store-radius);
  box-shadow: 0 -8px 28px rgb(0 0 0 / .14);
  /* Clear of the home indicator on a phone that has one. */
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
.sf-sheet-body { display: flex; flex-direction: column; gap: 18px; padding: 18px 20px 22px; }
.sf-facet { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; }
.sf-facet legend { font-size: 13px; font-weight: 800; color: var(--store-text); padding: 0; }
.sf-facet-options { display: flex; flex-wrap: wrap; gap: 8px; }
.sf-facet-count { font-size: 11.5px; opacity: .7; font-weight: 700; }
.sf-facet-note { font-size: 12.5px; color: var(--store-muted); }

@media (min-width: 768px) {
  .sf-sheet {
    position: static;
    max-height: none;
    box-shadow: none;
    border: 1px solid var(--store-border);
    border-radius: var(--store-radius);
  }
  .sf-sheet-body { flex-direction: row; flex-wrap: wrap; gap: 24px; }
}
.sf-more {
  display: block;
  padding: 13px 20px;
  border-radius: var(--store-radius);
  border: 1px solid var(--store-border);
  background: var(--store-card);
  color: var(--store-text);
  font-size: 14px;
  font-weight: 800;
  text-align: center;
  text-decoration: none;
}
.sf-more:hover { border-color: var(--store-accent-border); }

.sf-card-body { padding: 13px 14px 15px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
.sf-card-name {
  font-size: 13.5px;
  font-weight: 800;
  line-height: 1.5;
  letter-spacing: -.1px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex: 1;
}
.sf-card-price {
  align-self: flex-start;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 900;
  color: var(--store-accent);
  background: color-mix(in srgb, var(--store-accent) 11%, transparent);
}
.sf-card-price small { font-size: 10.5px; font-weight: 700; opacity: .75; }

/* ── product page ── */
.sf-product { max-width: 1100px; margin: 0 auto; padding: 20px; }
.sf-product-top { display: grid; gap: 20px; }
.sf-gallery { display: grid; gap: 8px; }
.sf-gallery-main {
  width: 100%;
  border-radius: var(--store-radius);
  border: 1px solid var(--store-border);
  background: var(--store-card);
  object-fit: cover;
  aspect-ratio: 1 / 1;
}
.sf-gallery-strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.sf-gallery-strip img {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: calc(var(--store-radius) / 1.6);
  border: 1px solid var(--store-border);
}
.sf-product h1 {
  font-size: clamp(20px, 4vw, 28px);
  font-weight: var(--store-heading-weight);
  margin: 0 0 10px;
  line-height: 1.4;
}
.sf-product-desc {
  font-size: 14.5px;
  color: var(--store-muted);
  white-space: pre-wrap;
  margin-bottom: 18px;
}
.sf-empty {
  max-width: 560px;
  margin: 0 auto;
  padding: 48px 20px;
  text-align: center;
  color: var(--store-muted);
  font-size: 14px;
}

/* ── the shape of a page that has not arrived yet ──
   Grey boxes in the places the real things will take, drawn with the same
   .sf-grid and .sf-card the page uses, so nothing moves when it lands.
   One entrance, no loop: the brief's motion rule applies to the skeleton
   too, and a rectangle that pulses forever is a spinner wearing a square.
   (No backticks: this file is one template literal, as the note at the
   top of the gallery rules says — and this comment put two in it.) */
.sf-skel { padding-top: 18px; }
.sf-skel-sr {
  position: absolute;
  width: 1px; height: 1px;
  margin: -1px; padding: 0; border: 0;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap;
}
.sf-skel-title,
.sf-skel-line,
.sf-skel-chip,
.sf-skel-offer {
  background: color-mix(in srgb, var(--store-text) 9%, transparent);
  border-radius: 8px;
  animation: sf-skel-in .35s ease both;
}
.sf-skel-title { height: 26px; width: 42%; min-width: 120px; margin-bottom: 16px; }
.sf-skel-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
.sf-skel-chip { height: 32px; width: 84px; border-radius: 999px; }
.sf-skel-line { height: 13px; margin-top: 10px; }
.sf-skel-short { width: 55%; }
.sf-skel-offers { display: grid; gap: 10px; margin-top: 22px; }
.sf-skel-offer { height: 58px; border-radius: var(--store-radius); }
@keyframes sf-skel-in { from { opacity: 0 } to { opacity: 1 } }
@media (prefers-reduced-motion: reduce) {
  .sf-skel-title, .sf-skel-line, .sf-skel-chip, .sf-skel-offer { animation: none; }
}

@media (min-width: 720px) {
  .sf-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .sf-product-top { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; }
}
@media (min-width: 1000px) {
  .sf-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
`;

/**
 * THE WHOLE SHEET A SHOP SERVES, BUILT ONCE WHEN THIS MODULE LOADS.
 *
 * It lives here rather than in the shell because the shell is no longer
 * the only thing that needs it: a «loading.tsx» draws the shop's skeleton
 * before any page component has run, and a skeleton drawn without the
 * shop's stylesheet is a stack of unstyled boxes — worse than the blank
 * screen it was meant to replace.
 *
 * «minifyCss» drops the comments and collapses the whitespace and changes
 * nothing else. As written the two sheets came to 51.7 KB, 16.2 KB of it
 * prose explaining the rules to whoever opens the file; those sentences
 * belong in the file and not on a shopper's connection. Both forms were
 * parsed by a browser and built the same 251 rules.
 */
export const SHOP_SHEET = minifyCss(BLOCK_CSS + STOREFRONT_CSS);

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ONE SLICE PER FAMILY — AND A SHOP SHIPS EXACTLY ONE OF THEM.
 *
 * Everything above is what EVERY shop needs. What follows is what one
 * family needs, and a «عيادة» shop has no use for the brand world's
 * ninety rules.
 *
 * ── WHY THIS IS SPLIT AND NOT APPENDED ──
 *
 * MEASURED. The base sheet is 43.3 KB minified against a 50 KB budget
 * («CSS أقل من ٥٠ كيلوبايت», held by `shop-budget.test.ts`). The four
 * families together came to 9.5 KB, so appending them put every shop at
 * 51 KB — over, and over for rules it would never match. Split, a shop
 * ships the base plus its own family and the budget is met per shop,
 * which is the only unit the budget was ever about: nobody downloads
 * «the stylesheet of the product».
 *
 * `shop-budget.test.ts` therefore measures base + EACH family, and
 * `layout-variants.test.ts` reads base + ALL of them, because a variant's
 * rule may live in its family's slice and «declared with nothing behind
 * it» has to stay impossible.
 * ═══════════════════════════════════════════════════════════════════════
 */
const CLINIC_CSS = `
/* ── splitProof — «عيادة»: the claim, and beside it the only proof ──
   The facts are what this shop DOES — cash at the door, every
   governorate — never a number about other people that nobody counted. */
.sf-hx[data-hero-slot='splitProof'] { grid-template-columns: 1fr; align-items: start; }
.sf-hx[data-hero-slot='splitProof'] .sf-hx-say { display: grid; gap: 10px; }
.sf-hx[data-hero-slot='splitProof'] strong { font-size: 25px; font-weight: 800; line-height: 1.35; }
.sf-hx[data-hero-slot='splitProof'] em {
  font-style: normal; font-size: 16px; line-height: 1.8; color: var(--store-muted);
}
.sf-hx-proof {
  display: grid; gap: 8px; padding: 14px;
  border: 1px solid var(--store-border); border-radius: var(--store-radius);
  background: var(--store-card);
}
.sf-hx-fact { display: block; font-size: 14.5px; font-weight: 700; padding-inline-start: 18px; position: relative; }
/* A tick in the shop's own colour: one character, no icon payload. */
.sf-hx-fact::before {
  content: '\\2713'; position: absolute; inset-inline-start: 0; color: var(--store-accent); font-weight: 800;
}
.sf-hx-proof .sf-hx-feature { margin-block-start: 4px; }
.sf-hx[data-hero-slot='splitProof'] .sf-hx-go {
  justify-self: start; background: var(--store-accent); color: var(--store-accent-text);
  padding: 12px 26px; border-radius: var(--store-radius); font-weight: 800; font-size: 15px;
  display: inline-flex; align-items: center; min-height: 44px;
}
/* The clinic breathes least: a shopper with a complaint is scanning. */
.sf-root[data-family='clinic'] .sf-grid-wrap, .sf-root[data-family='clinic'] .sf-row { padding-block: 16px; }
@media (min-width: 720px) { .sf-hx[data-hero-slot='splitProof'] { grid-template-columns: 1.1fr .9fr; } }
`;

const HERBALIST_CSS = `
/* «عطّار» breathes most, and its one ornament is a dotted rule under a
   heading — the cheapest thing on the list and the most recognisable. */
.sf-root[data-family='herbalist'] .sf-grid-wrap, .sf-root[data-family='herbalist'] .sf-row { padding-block: 26px; }
.sf-root[data-family='herbalist'] .sf-row h2 {
  border-block-end: 2px dotted var(--store-border); padding-block-end: 8px;
}
.sf-root[data-family='herbalist'] .sf-card { outline: 1px solid var(--store-border); outline-offset: 3px; }
`;

const TREND_CSS = `
/* ── tile — «ترند»: the shape a thumb already scrolls all day ──
   9:13, the words OVER the picture, three to a row. The wash under the
   name is what makes it legible on an unknown photograph — text on a
   seller's own image is the one place a palette cannot promise contrast.
   It sits under the NAME and never under the price: the price keeps its
   own line, on the card's own surface, which is the owner's ruling of
   15/10 about what may and may not go behind a figure. */
.sf-card[data-card='tile'] .sf-card-img,
.sf-card[data-card='tile'] .sf-card-none { aspect-ratio: 9 / 13; }
.sf-card[data-card='tile'] { position: relative; }
.sf-card[data-card='tile'] .sf-card-body { padding: 9px 11px 11px; gap: 4px; }
.sf-card[data-card='tile'] .sf-card-name {
  position: absolute; inset-inline: 0; inset-block-end: 38px; padding: 26px 11px 7px;
  color: #fff; font-size: 13.5px; font-weight: 800;
  background: linear-gradient(to top, rgba(0,0,0,.72), rgba(0,0,0,0));
}
.sf-card[data-card='tile'] .sf-card-price { font-size: 14px; font-weight: 800; }
/* It shouts with WEIGHT rather than with colour, and nothing moves. */
.sf-root[data-family='trend'] .sf-grid-wrap, .sf-root[data-family='trend'] .sf-row { padding-block: 14px; }
.sf-root[data-family='trend'] .sf-row h2, .sf-root[data-family='trend'] .sf-page h1 { font-weight: 800; }
`;

/**
 * «علامة» — AND THE ONE TRICK THAT MAKES IT AFFORDABLE.
 *
 * MEASURED: written as its own set of coloured rules this slice came to
 * 10.1 KB minified, which put a brand shop at 53.4 KB against a 50 KB
 * budget. Almost all of it was the same four lines of colour repeated on
 * forty elements.
 *
 * So the world is applied by REDEFINING THE SHOP'S OWN VARIABLES on the
 * page's root instead. Every rule in the base sheet already reads
 * «--store-page», «--store-text», «--store-accent» — so the landing
 * blocks, the offer cards, the order form and the FAQ box all wear the
 * product's world without one extra selector, and this slice only has to
 * carry what is genuinely NEW: the faint Latin word, the promises ring,
 * the dark panels, the sticky bar and the world switcher.
 *
 * That is also why the page reuses «lp-section», «lp-h2», «lp-sub»,
 * «lp-cta» and «lp-faq-item» rather than restyling them: a second set of
 * section paddings would be the same bytes twice and the same decision in
 * two places.
 */
/**
 * «علامة» — AND THE TWO DECISIONS THAT MADE IT FIT.
 *
 * MEASURED: written as its own set of coloured rules this slice came to
 * 7.8 KB minified, which put a brand shop at 51.1 KB against the brief's
 * 50 — on a base sheet that already spends 43.3.
 *
 * FIRST, THE WORLD IS NOT A SECOND VARIABLE FAMILY. `worldVars` writes
 * this product's colours onto the element as the shop's OWN names
 * («--store-page», «--store-text», «--store-accent»…), so every rule in
 * the base sheet paints itself in the product's world with no selector
 * here at all. See the note in store-world.ts.
 *
 * SECOND, THIS PAGE REUSES THE BLOCKS' OWN SHAPES — «lp-section»,
 * «lp-h2», «lp-sub», «lp-cta», «lp-faq-item», «lp-offers». A second set
 * of section paddings and button shapes would be the same bytes twice and
 * the same decision in two places.
 *
 * What is left is what is genuinely NEW: the faint Latin word, the world
 * switcher, the promises ring, the dark panels and the sticky bar.
 */
const BRAND_CSS = `
/* ── worldFirst — one product, its own world, three stages ──
   The stages are stacked and a hidden radio says which one shows, so the
   colour switch costs no JavaScript at all: «:has()» is how the section
   learns which radio is checked, and the same selector marks the chosen
   circle. Three stages and not five — a hidden image is still fetched. */
.sf-hx[data-hero-slot='worldFirst'] { grid-template-columns: 1fr; gap: 0; padding: 0; position: relative; }
.sf-bw-radio { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
/* «.sf-hx .sf-bw-stage» AND NOT «.sf-bw-stage» — MEASURED IN A BROWSER.
   The hero's own base rule is «.sf-hx a, .sf-hx > span { color: inherit }»,
   and the stage IS a direct span of the hero: (0,1,1) beats (0,1,0), so a
   bare class selector lost and every word of this family's first screen
   came out in the SHOP's ink on the PRODUCT's dark world — black on
   near-black. Found by reading the computed colour of a rendered page, not
   by reading the file. */
.sf-hx .sf-bw-stage {
  grid-area: 1 / 1; display: grid; gap: 14px; padding: 22px 20px 26px; align-content: start;
  background: var(--store-page); color: var(--store-text);
  /* Hidden stages leave the flow rather than merely fading: a faded
     stage still catches a tap. */
  visibility: hidden; opacity: 0; transition: opacity 220ms ease;
}
${WORLD_STAGES.map(
  (i) => `.sf-hx:has(#sf-w${i}:checked) .sf-bw-stage[data-w='${i}'] { visibility: visible; opacity: 1; }
.sf-hx:has(#sf-w${i}:checked) .sf-bw-dot[data-w='${i}'] .sf-hx-img { border-color: var(--store-accent); }`
).join('\n')}
/* The miniature draws no radios — eleven previews on one dashboard
   screen would share these ids — so it falls through to here. */
.sf-hx[data-hero-slot='worldFirst']:not(:has(.sf-bw-radio)) .sf-bw-stage[data-w='0'] { visibility: visible; opacity: 1; }
.sf-bw-art { position: relative; display: block; }
/* THE FAINT WORD IS INSIDE THE PICTURE'S BOX — never behind a price or a
   figure (the owner's ruling, 15/10), which is why it is a child of the
   art and not of the stage. Latin only, so tracking it out is allowed;
   no Arabic ever reaches this rule. */
.sf-bw-ghost {
  position: absolute; inset-block-start: 5%; inset-inline: 0; text-align: center;
  font-size: clamp(44px, 17vw, 124px); font-weight: 800; letter-spacing: .08em;
  color: var(--store-text); opacity: .13; line-height: 1; pointer-events: none;
  white-space: nowrap; overflow: hidden;
}
.sf-bw-art .sf-hx-img { background: transparent; aspect-ratio: 4 / 5; max-height: 52vh; }
.sf-bw-art .sf-hx-img img, .sf-bw-art > img { object-fit: contain; }
.sf-bw-say { display: grid; gap: 9px; justify-items: start; }
.sf-bw-say strong { font-size: 27px; font-weight: 800; line-height: 1.3; }
.sf-bw-all {
  border: 1px solid var(--store-border); color: var(--store-text);
  padding: 12px 22px; border-radius: var(--store-radius); font-weight: 700; font-size: 14.5px;
  display: inline-flex; align-items: center; gap: 7px; min-height: 44px; text-decoration: none;
}
.sf-bw-pick { grid-area: 2 / 1; display: flex; gap: 12px; flex-wrap: wrap; padding: 14px 20px 18px; }
.sf-bw-dot { display: grid; gap: 5px; justify-items: center; width: 74px; cursor: pointer; }
.sf-bw-dot .sf-hx-img {
  width: 56px; height: 56px; aspect-ratio: 1; border-radius: 50%; max-height: none;
  background: var(--store-page); border: 2px solid transparent;
}
.sf-bw-dot .sf-hx-name { font-size: 11.5px; font-weight: 700; text-align: center; }

/* ── world — the card wears its product's own colours ──
   «كرت لكلّ منتج بعالم منتجه», and the colours arrive on the card itself
   through the variables, so this is layout only. */
.sf-card[data-card='world'] { flex-direction: row; align-items: stretch; }
.sf-card[data-card='world'] .sf-card-img,
.sf-card[data-card='world'] .sf-card-none {
  width: 118px; flex: 0 0 118px; aspect-ratio: 4 / 5; object-fit: contain; background: transparent;
}
.sf-card[data-card='world'] .sf-card-body { justify-content: center; gap: 5px; }
.sf-card[data-card='world'] .sf-card-name { font-size: 16.5px; font-weight: 800; }
/* A SERIES CARD TAKES THE WHOLE ROW ON A PHONE — measured at 375.
   The shelf is two columns there for every variant, and this card is a
   horizontal one: 118px of photograph left about fifty for the Latin
   name, the sentence, the specification line and the price, which is
   four things stacked in a column too narrow to read any of them. It
   goes back to two across at the width where two fit. */
.sf-card[data-card='world'] { grid-column: 1 / -1; }
/* Latin, tracked out — allowed for Latin, never for Arabic, which is why
   this is its own element and not a rule on the name. */
.sf-card-latin { display: block; font-size: 10.5px; font-weight: 700; letter-spacing: .14em; color: var(--store-muted); }
.sf-card-line, .sf-card-specs { display: block; font-size: 12.5px; line-height: 1.7; color: var(--store-muted); }
.sf-card-go { display: block; font-size: 12.5px; font-weight: 800; color: var(--store-accent-ink); }

/* ── AND THE PRODUCT PAGE, BUILT FROM THE PRODUCT'S FIELDS ──
   Every section exists only when its field does — the component draws
   «brandSections» and nothing else — so there is no rule here for an
   empty state. That is rule 0: «أي حقل فاضي، قسمه بيختفي لحاله والصفحة
   بتضلّ كاملة». */
.sf-root[data-family='brand'] .sf-grid-wrap, .sf-root[data-family='brand'] .sf-row { padding-block: 30px; }
.sf-bp { background: var(--store-page); color: var(--store-text); }
.sf-bp-hero { display: grid; gap: 16px; padding: 22px 20px; }
.sf-bp-badges { display: flex; flex-wrap: wrap; gap: 7px; margin: 0; }
.sf-bp-badges span {
  font-size: 12.5px; font-weight: 700; padding: 5px 11px; border-radius: 999px;
  border: 1px solid var(--store-border); color: var(--store-muted);
}
.sf-bw-say h1 { font-size: 28px; font-weight: 800; line-height: 1.3; margin: 0; }
.sf-bp-line { font-size: 15.5px; line-height: 1.8; color: var(--store-muted); margin: 0; font-style: normal; }
/* THE PRICE HAS NOTHING BEHIND IT — no wash, no faint word, no pattern.
   The owner's ruling of 15/10, and the one place in this family where it
   would have been tempting. */
.sf-bp-price { display: flex; align-items: baseline; gap: 10px; margin: 0; background: none; }
.sf-bp-price strong { font-size: 30px; font-weight: 800; }
.sf-bp-price s { font-size: 16px; color: var(--store-muted); }
.sf-bp-price em { font-style: normal; font-size: 13px; font-weight: 800; color: var(--store-accent-ink); }
.sf-bp-cta { display: flex; flex-wrap: wrap; gap: 10px; margin: 0; }
.sf-bp-cta .lp-cta, .sf-bp-sticky .lp-cta { margin: 0; }
/* The promises ring: the photograph in the middle, the numbers around it,
   the three lines under — «تلات وعود، ولا وعد زيادة». */
.sf-bp-ring { position: relative; width: min(240px, 68vw); aspect-ratio: 1; margin: 0 auto 16px; }
.sf-bp-ring > img {
  position: absolute; inset: 16%; width: 68%; height: 68%; object-fit: contain;
  border-radius: 50%; background: var(--store-card);
}
.sf-bp-num {
  position: absolute; width: 34px; height: 34px; border-radius: 50%;
  display: grid; place-items: center; font-size: 14px; font-weight: 800;
  background: var(--store-accent); color: var(--store-accent-text);
}
.sf-bp-num[data-n='1'] { inset-block-start: 0; inset-inline-start: calc(50% - 17px); }
.sf-bp-num[data-n='2'] { inset-block-end: 12%; inset-inline-start: 0; }
.sf-bp-num[data-n='3'] { inset-block-end: 12%; inset-inline-end: 0; }
/* One numbered list, two sections: the promises and «كيف بتستعمله» are
   both «short lines, in order», and a second list rule would be the same
   decision twice. */
.sf-bp-vows { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; counter-reset: vow; }
.sf-bp-vows li { display: grid; grid-template-columns: 26px 1fr; gap: 10px; font-size: 15.5px; line-height: 1.7; }
.sf-bp-vows li::before { counter-increment: vow; content: counter(vow); color: var(--store-accent-ink); font-weight: 800; }
/* The dark panels sit INSIDE the world rather than on top of it. */
.sf-bp-close, .sf-bp-video { background: var(--store-card); }
.sf-bp-close { display: grid; gap: 14px; }
/* The video is a POSTER until it is asked for: «ما بيتحمّل إلا لما يوصله
   السكرول، وقبله بتطلع صورة» — lazy, with its poster, and no autoplay. */
.sf-bp-close img, .sf-bp-video video {
  width: 100%; aspect-ratio: 16 / 10; object-fit: cover; border-radius: var(--store-radius); display: block;
}
.sf-bp-faq summary { font-weight: 700; cursor: pointer; min-height: 32px; padding: 10px 14px; }
.sf-bp-faq p { margin: 0; padding: 0 14px 12px; }
/* STICKY, NOT FIXED. A fixed bar inside a preview escapes its box — the
   bug the owner photographed on the templates screen — and a sticky one
   cannot leave the article it belongs to. */
.sf-bp-sticky {
  position: sticky; inset-block-end: 0; z-index: 3;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 16px; background: var(--store-card);
  border-block-start: 1px solid var(--store-border);
}
@media (min-width: 720px) {
  .sf-bw-stage { grid-template-columns: 1.1fr .9fr; align-items: center; padding: 30px; }
  .sf-bp-hero, .sf-bp-close { grid-template-columns: 1fr 1fr; align-items: center; }
  .sf-card[data-card='world'] { grid-column: auto; }
}
@media (prefers-reduced-motion: reduce) { .sf-bw-stage { transition: none; } }
`;

/**
 * THE MINIATURE'S RULES — THE GALLERY'S, AND NO SHOP'S.
 *
 * `SkinPreview` draws the real `StoreHero` at preview scale, so the two
 * can never promise different first screens. Its type sizes are a
 * DASHBOARD concern: a shop renders nothing with `data-mini` on it, and
 * measured, these were 0.7 KB of every shopper's stylesheet for a screen
 * only a seller opens. So they ship with the gallery instead.
 */
export const FAMILY_MINI_CSS = `
.sf-hx[data-mini] .sf-hx-proof { padding: 6px; gap: 4px; }
.sf-hx[data-mini] .sf-hx-fact { font-size: 8px; padding-inline-start: 11px; }
.sf-hx[data-mini] .sf-bw-stage { padding: 8px; gap: 6px; }
.sf-hx[data-mini] .sf-bw-title { font-size: 11px; }
.sf-hx[data-mini] .sf-bw-ghost { font-size: 26px; }
.sf-hx[data-mini] .sf-bw-all { min-height: 0; padding: 3px 9px; font-size: 8px; }
.sf-hx[data-mini] .sf-bw-pick { padding: 6px 8px; gap: 6px; }
.sf-hx[data-mini] .sf-bw-dot { width: 26px; }
.sf-hx[data-mini] .sf-bw-dot .sf-hx-img { width: 24px; height: 24px; }
`;

/** Each family's own rules, by the id `familyOf` returns. */
export const FAMILY_CSS: Readonly<Record<FamilyId, string>> = Object.freeze({
  clinic: CLINIC_CSS,
  herbalist: HERBALIST_CSS,
  trend: TREND_CSS,
  brand: BRAND_CSS,
});

/** What a shop inlines beside `SHOP_SHEET` — minified once, at load. */
export const FAMILY_SHEET: Readonly<Record<FamilyId, string>> = Object.freeze(
  Object.fromEntries(FAMILY_IDS.map((id) => [id, minifyCss(FAMILY_CSS[id])])) as Record<FamilyId, string>
);

/**
 * All four, for the two readers that need every family at once: the
 * template gallery, which draws a preview of each, and the guard that
 * checks no declared variant is left with nothing behind it.
 */
export const ALL_FAMILY_CSS = FAMILY_IDS.map((id) => FAMILY_CSS[id]).join('\n');
