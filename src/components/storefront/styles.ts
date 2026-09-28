/**
 * The storefront's own styles, on top of the landing page's.
 *
 * Only what a shop needs that a single page does not: a header that carries
 * the brand, a grid of products, and a product page's two columns. Every
 * colour still reads a `--lp-*` variable the theme derived, so one colour
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
  background: color-mix(in srgb, var(--lp-header-bg, var(--lp-card)) 82%, transparent);
  /* THE PAGE MOVES UNDER IT. A flat opaque bar with a hairline is a
     browser chrome; a shop's header should feel like glass over the
     goods. Falls back to the solid colour where backdrop-filter is not
     supported, which is what the rule above already paints. */
  backdrop-filter: saturate(160%) blur(14px);
  -webkit-backdrop-filter: saturate(160%) blur(14px);
  border-bottom: 1px solid color-mix(in srgb, var(--lp-border) 70%, transparent);
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
  min-height: var(--lp-header-h, 72px);
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
  color: var(--lp-text);
  font-size: 14px;
  text-decoration: none;
  white-space: nowrap;
}
.sf-header-menu a:hover { color: var(--lp-accent); }
.sf-footer-links {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px 16px;
  margin-bottom: 10px;
}
.sf-footer-links a {
  color: var(--lp-muted);
  font-size: 13px;
  text-decoration: none;
}
.sf-footer-links a:hover { color: var(--lp-accent); }
/* A page of the shop's own words: measured for reading, not for selling. */
.sf-page {
  max-width: 680px;
  margin: 0 auto;
  padding: 28px 20px 48px;
}
.sf-page h1 {
  font-size: 26px;
  line-height: 1.35;
  font-weight: var(--lp-heading-weight, 800);
  color: var(--lp-text);
  margin-bottom: 18px;
}
.sf-page p {
  color: var(--lp-text);
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
  font-weight: var(--lp-heading-weight);
  line-height: 1.25;
  letter-spacing: -.3px;
}
.sf-brand em {
  display: block;
  font-style: normal;
  font-size: 12px;
  color: var(--lp-muted);
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
  color: var(--lp-accent-text, #fff);
  background: linear-gradient(135deg, var(--lp-accent) 0%, var(--lp-accent-dark, var(--lp-accent)) 100%);
  box-shadow: 0 6px 16px -6px color-mix(in srgb, var(--lp-accent) 70%, transparent);
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
  color: var(--lp-accent);
  padding: 9px 15px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--lp-accent) 28%, transparent);
  background: color-mix(in srgb, var(--lp-accent) 8%, transparent);
  transition: background .2s ease, box-shadow .2s ease, transform .2s ease;
}
.sf-phone:hover {
  background: var(--lp-accent);
  color: var(--lp-accent-text, #fff);
  box-shadow: 0 8px 20px -8px color-mix(in srgb, var(--lp-accent) 85%, transparent);
}

/* ── back link ── */
.sf-back { max-width: 1100px; margin: 0 auto; padding: 14px 20px 0; }
.sf-back a {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--lp-muted);
  text-decoration: none;
}
.sf-back a:hover { color: var(--lp-accent); }

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
    radial-gradient(85% 120% at 50% -20%, color-mix(in srgb, var(--lp-accent) 15%, transparent) 0%, transparent 65%),
    radial-gradient(60% 80% at 88% 8%, color-mix(in srgb, var(--lp-accent) 9%, transparent) 0%, transparent 70%);
}
/* A hairline of the shop's colour where the hero ends, instead of nothing. */
.sf-root .lp-hero::after {
  content: '';
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--lp-accent) 35%, transparent), transparent);
}
.sf-root .lp-hero h1 { letter-spacing: -.8px; line-height: 1.2; }

/* The one button on the first screen. It was a flat rectangle the same
   weight as a form field; on a shop's front page it is the invitation. */
.sf-root .lp-hero .lp-cta {
  padding: 15px 38px;
  border-radius: 999px;
  font-size: 15.5px;
  box-shadow: 0 14px 30px -12px color-mix(in srgb, var(--lp-accent) 85%, transparent);
}
.sf-root .lp-hero .lp-cta:hover {
  transform: translateY(-2px);
  box-shadow: 0 20px 40px -14px color-mix(in srgb, var(--lp-accent) 95%, transparent);
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
    linear-gradient(180deg, color-mix(in srgb, var(--lp-accent) 5%, transparent) 0%, transparent 42%),
    color-mix(in srgb, var(--lp-accent) 3%, var(--lp-page));
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
  background: var(--lp-accent);
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
    radial-gradient(85% 120% at 50% -20%, color-mix(in srgb, var(--lp-accent) 15%, transparent) 0%, transparent 65%),
    radial-gradient(60% 80% at 88% 8%, color-mix(in srgb, var(--lp-accent) 9%, transparent) 0%, transparent 70%);
}
.sf-hero::after {
  content: '';
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--lp-accent) 35%, transparent), transparent);
}
.sf-hero h1 {
  font-size: clamp(26px, 5.4vw, 40px);
  font-weight: var(--lp-heading-weight);
  margin: 0 auto 10px;
  max-width: 900px;
  letter-spacing: -.7px;
  line-height: 1.25;
}
.sf-hero p { font-size: 15px; color: var(--lp-muted); max-width: 620px; margin: 0 auto; line-height: 1.8; }

/* And the goods sit on the same faint shelf the catalogue block's do. */
.sf-grid-wrap {
  border-radius: 28px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--lp-accent) 5%, transparent) 0%, transparent 42%),
    color-mix(in srgb, var(--lp-accent) 3%, var(--lp-page));
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
  background: var(--lp-card);
  border-radius: calc(var(--lp-radius) + 6px);
  overflow: hidden;
  text-decoration: none;
  color: inherit;
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--lp-text) 6%, transparent),
    0 1px 2px color-mix(in srgb, var(--lp-text) 8%, transparent),
    0 8px 24px -12px color-mix(in srgb, var(--lp-text) 22%, transparent);
  transition: transform .28s cubic-bezier(.2, .7, .3, 1), box-shadow .28s cubic-bezier(.2, .7, .3, 1);
}
.sf-card:hover {
  transform: translateY(-4px);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--lp-accent) 24%, transparent),
    0 2px 4px color-mix(in srgb, var(--lp-text) 10%, transparent),
    0 20px 40px -16px color-mix(in srgb, var(--lp-accent) 42%, transparent);
}
.sf-card-img {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  background: var(--lp-page);
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
    radial-gradient(120% 90% at 22% 12%, color-mix(in srgb, var(--lp-accent) 16%, transparent) 0%, transparent 62%),
    linear-gradient(140deg, color-mix(in srgb, var(--lp-accent) 9%, var(--lp-card)) 0%, var(--lp-card) 70%);
}
.sf-card-none::after {
  content: attr(data-letter);
  font-size: clamp(26px, 7vw, 40px);
  font-weight: 900;
  line-height: 1;
  color: color-mix(in srgb, var(--lp-accent) 30%, transparent);
}
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
  color: var(--lp-accent);
  background: color-mix(in srgb, var(--lp-accent) 11%, transparent);
}
.sf-card-price small { font-size: 10.5px; font-weight: 700; opacity: .75; }

/* ── product page ── */
.sf-product { max-width: 1100px; margin: 0 auto; padding: 20px; }
.sf-product-top { display: grid; gap: 20px; }
.sf-gallery { display: grid; gap: 8px; }
.sf-gallery-main {
  width: 100%;
  border-radius: var(--lp-radius);
  border: 1px solid var(--lp-border);
  background: var(--lp-card);
  object-fit: cover;
  aspect-ratio: 1 / 1;
}
.sf-gallery-strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.sf-gallery-strip img {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: calc(var(--lp-radius) / 1.6);
  border: 1px solid var(--lp-border);
}
.sf-product h1 {
  font-size: clamp(20px, 4vw, 28px);
  font-weight: var(--lp-heading-weight);
  margin: 0 0 10px;
  line-height: 1.4;
}
.sf-product-desc {
  font-size: 14.5px;
  color: var(--lp-muted);
  white-space: pre-wrap;
  margin-bottom: 18px;
}
.sf-empty {
  max-width: 560px;
  margin: 0 auto;
  padding: 48px 20px;
  text-align: center;
  color: var(--lp-muted);
  font-size: 14px;
}

@media (min-width: 720px) {
  .sf-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .sf-product-top { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; }
}
@media (min-width: 1000px) {
  .sf-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
`;
