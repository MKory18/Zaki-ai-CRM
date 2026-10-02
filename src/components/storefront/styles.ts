import { BLOCK_CSS } from '@/components/landing/blocks/styles';
import { minifyCss } from '@/lib/css-minify';

/**
 * The storefront's own styles, on top of the landing page's.
 *
 * Only what a shop needs that a single page does not: a header that carries
 * the brand, a grid of products, and a product page's two columns. Every
 * colour still reads a `--store-*` variable the theme derived, so one colour
 * picker restyles the whole shop exactly as it restyles one page.
 */
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
 * the only thing that needs it: a `loading.tsx` draws the shop's skeleton
 * before any page component has run, and a skeleton drawn without the
 * shop's stylesheet is a stack of unstyled boxes — worse than the blank
 * screen it was meant to replace.
 *
 * `minifyCss` drops the comments and collapses the whitespace and changes
 * nothing else. As written the two sheets came to 51.7 KB, 16.2 KB of it
 * prose explaining the rules to whoever opens the file; those sentences
 * belong in the file and not on a shopper's connection. Both forms were
 * parsed by a browser and built the same 251 rules.
 */
export const SHOP_SHEET = minifyCss(BLOCK_CSS + STOREFRONT_CSS);
