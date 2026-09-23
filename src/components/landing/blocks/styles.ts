import { FONTS } from '@/lib/landing-theme';
import { GOOGLE_FAMILY } from '@/lib/block-look';
/**
 * The one stylesheet a block-built page wears.
 *
 * It is a plain string rather than Tailwind classes for two reasons. It is
 * rendered inside the editor preview as well as on the public page, so both
 * must look identical without depending on which utilities the build happened
 * to generate — a lesson already paid for once, by a calendar that collapsed
 * into a single column because `grid-cols-7` had never been used before.
 *
 * Not one colour is named here. Everything reads a `--lp-*` variable the
 * theme derived, which is what makes one colour picker restyle a whole page.
 */
export const BLOCK_CSS = `
/* ─────────────────────────────────────────────────────
   THE FACES WE SERVE OURSELVES.

   Everything else in the library comes from Google, which is one link and
   no files. These are here because the family is not on Google AND its
   licence permits us to serve it — a combination that is rarer than it
   sounds. Most Arabic display fonts, free to download or not, forbid
   exactly this: putting the file on a server where a visitor's browser can
   fetch it. The notice each licence requires sits beside the files.

   'swap' so the words are readable while the face arrives; a page that
   shows nothing for 400ms looks broken on a slow phone.
   ───────────────────────────────────────────────────── */
@font-face {
  font-family: 'Kawkab Mono';
  src: url('/fonts/kawkab-300.woff2') format('woff2');
  font-weight: 300;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Kawkab Mono';
  src: url('/fonts/kawkab-700.woff2') format('woff2');
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}

.lp-root {
  font-family: var(--lp-font);
  color: var(--lp-text);
  background-color: var(--lp-page);
  /* The page's own photograph, veiled, behind every block. 'cover' and a
     centred position so a portrait photo on a wide screen still fills it;
     'fixed' so the picture stays put while the page scrolls over it, which
     is the whole reason to put one there. */
  background-image: var(--lp-page-image, none);
  background-size: cover;
  background-position: center;
  background-attachment: fixed;
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
}
/* iOS never honours a fixed attachment properly — it sizes the picture to
   the viewport and leaves it juddering behind the scroll. A touch screen
   gets the plain, predictable version instead. */
@media (hover: none) { .lp-root { background-attachment: scroll; } }
.lp-root *, .lp-root *::before, .lp-root *::after { box-sizing: border-box; }
.lp-root p { margin: 0; }

/* ── announcement ── */
.lp-announce {
  background: var(--lp-accent);
  color: var(--lp-accent-text);
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  padding: 10px 16px;
  letter-spacing: .2px;
}

/* ── hero ── */
.lp-hero {
  max-width: 860px;
  margin: 0 auto;
  padding: 32px 20px 36px;
  text-align: center;
}
.lp-hero-img {
  display: block;
  width: 100%;
  max-width: 520px;
  margin: 0 auto 24px;
  height: auto;
  border-radius: var(--lp-radius);
  border: 1px solid var(--lp-border);
  background: var(--lp-card);
}
.lp-h1 {
  font-size: clamp(24px, 5.2vw, 38px);
  font-weight: var(--lp-heading-weight);
  line-height: 1.3;
  margin: 0 0 12px;
  letter-spacing: -.3px;
}
.lp-hero-sub {
  font-size: 15px;
  color: var(--lp-muted);
  max-width: 560px;
  margin: 0 auto;
}
.lp-price {
  font-size: 30px;
  font-weight: 900;
  color: var(--lp-accent);
  margin: 20px 0 0;
}
.lp-price span { font-size: 15px; font-weight: 700; }

/* ── the one button shape on the page ── */
.lp-cta {
  display: inline-block;
  margin-top: 22px;
  background: var(--lp-accent);
  color: var(--lp-accent-text);
  font-size: 16px;
  font-weight: 800;
  text-decoration: none;
  padding: 14px 44px;
  border-radius: var(--lp-radius);
  box-shadow: 0 6px 20px -8px var(--lp-accent);
  transition: background .15s ease, transform .15s ease;
}
.lp-cta:hover { background: var(--lp-accent-dark); transform: translateY(-1px); }
.lp-cta:active { transform: translateY(0); }

/* ── section rhythm: every block breathes the same ── */
.lp-section {
  max-width: 760px;
  margin: 0 auto;
  padding: 30px 20px;
}
.lp-h2 {
  font-size: clamp(19px, 3.6vw, 24px);
  font-weight: var(--lp-heading-weight);
  margin: 0 0 18px;
  text-align: center;
}
.lp-sub {
  text-align: center;
  color: var(--lp-muted);
  font-size: 13px;
  margin: -10px 0 18px;
}

/* ── benefits ── */
.lp-benefits { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.lp-benefits li {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: var(--lp-card);
  border: 1px solid var(--lp-border);
  border-radius: var(--lp-radius);
  padding: 14px 16px;
}
.lp-benefit-mark {
  flex: 0 0 26px;
  height: 26px;
  border-radius: 999px;
  background: var(--lp-accent-tint);
  color: var(--lp-accent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: 1px;
}
.lp-benefits strong { display: block; font-size: 14.5px; font-weight: 800; }
.lp-benefits p { font-size: 13px; color: var(--lp-muted); margin-top: 2px; }

/* ── gallery ── */
.lp-gallery { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.lp-gallery img {
  width: 100%;
  height: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: var(--lp-radius);
  border: 1px solid var(--lp-border);
}

/* ── free text ── */
.lp-prose p { font-size: 15px; color: var(--lp-text); margin-bottom: 12px; white-space: pre-wrap; }
.lp-prose p:last-child { margin-bottom: 0; }

/* ── offers ──
   A compact row, not a poster. Three tiers used to fill the whole screen,
   which made choosing between them a scrolling exercise; side by side and
   one line each, the comparison is the point again. */
.lp-offers { display: grid; gap: 8px; }
.lp-offer {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  column-gap: 12px;
  row-gap: 1px;
  text-align: start;
  width: 100%;
  font: inherit;
  color: inherit;
  cursor: pointer;
  background: var(--lp-card);
  border: 1.5px solid var(--lp-border);
  border-radius: var(--lp-radius);
  padding: 10px 14px;
  transition: border-color .15s ease, background .15s ease;
}
.lp-offer:hover { border-color: var(--lp-accent); }
.lp-offer-best { border-color: var(--lp-accent); background: var(--lp-accent-tint); }
.lp-offer-name {
  grid-area: 1 / 1;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13.5px;
  font-weight: 800;
}
.lp-offer-tag {
  background: var(--lp-accent);
  color: var(--lp-accent-text);
  font-size: 9.5px;
  font-weight: 800;
  padding: 1.5px 7px;
  border-radius: 999px;
  white-space: nowrap;
}
.lp-offer-qty { grid-area: 2 / 1; font-size: 11px; color: var(--lp-muted); }
.lp-offer-qty em { font-style: normal; color: var(--lp-accent); font-weight: 700; }
.lp-offer-price {
  grid-area: 1 / 2;
  text-align: end;
  font-size: 16px;
  font-weight: 900;
  color: var(--lp-accent);
  white-space: nowrap;
}
.lp-offer-price s {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--lp-muted);
  margin-inline-end: 6px;
}
.lp-offer-unit { grid-area: 2 / 2; text-align: end; font-size: 10px; color: var(--lp-muted); }

/* ── reviews ── */
.lp-reviews { display: grid; gap: 12px; }
.lp-reviews figure {
  margin: 0;
  background: var(--lp-card);
  border: 1px solid var(--lp-border);
  border-radius: var(--lp-radius);
  padding: 16px 18px;
}
.lp-stars { display: flex; gap: 2px; color: var(--lp-accent); margin-bottom: 8px; }
.lp-reviews blockquote { margin: 0; font-size: 14px; }
.lp-reviews figcaption { margin-top: 8px; font-size: 12px; font-weight: 700; color: var(--lp-muted); }

/* ── faq ── */
.lp-faq { display: grid; gap: 8px; }
.lp-faq-item {
  background: var(--lp-card);
  border: 1px solid var(--lp-border);
  border-radius: var(--lp-radius);
  overflow: hidden;
}
.lp-faq-open { border-color: var(--lp-accent-border); }
.lp-faq-item button {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: none;
  border: 0;
  font: inherit;
  color: inherit;
  text-align: start;
  font-weight: 700;
  font-size: 14px;
  padding: 14px 16px;
  cursor: pointer;
}
.lp-faq-item button svg { flex: 0 0 auto; color: var(--lp-muted); transition: transform .18s ease; }
.lp-faq-open button svg { transform: rotate(180deg); color: var(--lp-accent); }
.lp-faq-item p { padding: 0 16px 14px; font-size: 13.5px; color: var(--lp-muted); }

/* ── urgency ── */
.lp-urgency {
  max-width: 760px;
  margin: 0 auto;
  padding: 18px 20px;
  text-align: center;
  display: grid;
  gap: 10px;
  justify-items: center;
}
.lp-urgency > p { font-size: 14px; font-weight: 700; }
.lp-countdown { display: flex; align-items: center; gap: 6px; }
.lp-countdown span {
  background: var(--lp-accent);
  color: var(--lp-accent-text);
  font-size: 20px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  min-width: 46px;
  padding: 7px 4px;
  border-radius: calc(var(--lp-radius) / 1.6);
}
.lp-countdown i { color: var(--lp-accent); font-style: normal; font-weight: 900; }
.lp-countdown-over { font-size: 13px; color: var(--lp-muted); }
.lp-stock { font-size: 13px; color: var(--lp-muted); }
.lp-stock strong { color: var(--lp-accent); font-weight: 900; }

/* ── form ── */
.lp-form-section { max-width: 560px; }
/* The order form carries its own page gutter and its own vertical rhythm,
   because it is also dropped straight into a custom-HTML page where nothing
   else provides them. Inside a block it is not a page section, it is the
   section's content — and the two sets of padding stacked: on a 375px phone
   the card came out 271px wide, a quarter of the screen given away, which
   is what made it look squeezed and off-centre. The section owns the
   spacing here; the form just fills it. */
.lp-root #zaki-order-form { padding: 0; }

/* ── trust ── */
.lp-trust {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  max-width: 760px;
  margin: 0 auto;
  padding: 8px 20px 30px;
}
.lp-trust > div {
  flex: 1 1 140px;
  display: grid;
  justify-items: center;
  gap: 3px;
  text-align: center;
  background: var(--lp-card);
  border: 1px solid var(--lp-border);
  border-radius: var(--lp-radius);
  padding: 14px 10px;
  color: var(--lp-accent);
}
.lp-trust strong { font-size: 13px; font-weight: 800; color: var(--lp-text); }
.lp-trust span { font-size: 11.5px; color: var(--lp-muted); }

/* ── footer ── */
.lp-footer {
  border-top: 1px solid var(--lp-border);
  text-align: center;
  padding: 26px 20px 28px;
  display: grid;
  gap: 14px;
  justify-items: center;
}
.lp-footer-logo { max-height: 56px; width: auto; object-fit: contain; }
.lp-footer-cols {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 18px 12px;
  width: 100%;
  max-width: 760px;
  padding-top: 14px;
  border-top: 1px solid var(--lp-border);
}
.lp-footer-cols h3 {
  font-size: 13px;
  font-weight: 800;
  margin: 0 0 8px;
  padding-bottom: 6px;
  color: var(--lp-text);
  border-bottom: 2px solid var(--lp-accent);
  display: inline-block;
}
.lp-footer-cols ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.lp-footer-cols a {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--lp-muted);
  text-decoration: none;
}
.lp-footer-cols a:hover { color: var(--lp-accent); }
.lp-footer-phone {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--lp-accent);
  font-weight: 800;
  font-size: 14px;
  text-decoration: none;
}
.lp-footer p { font-size: 11.5px; color: var(--lp-muted); }

/* ── the button that follows you down ── */
.lp-sticky {
  position: fixed;
  inset-inline: 12px;
  bottom: 12px;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  max-width: 520px;
  margin: 0 auto;
  background: var(--lp-accent);
  color: var(--lp-accent-text);
  font-size: 15px;
  font-weight: 800;
  text-decoration: none;
  padding: 13px 22px;
  border-radius: var(--lp-radius);
  box-shadow: 0 10px 28px -10px rgba(0, 0, 0, .45);
}
.lp-sticky b { font-weight: 900; font-variant-numeric: tabular-nums; opacity: .92; }
.lp-sticky:active { transform: translateY(1px); }
/* Out of the way while the form it points at is on the screen.
   A button that says "order now" sitting on top of the order the visitor is
   already filling in is not urgency, it is an obstacle — and on a 375px
   phone it covered two of the fields. It leaves downwards and comes back
   the same way, so it reads as one object moving rather than two appearing. */
.lp-sticky {
  transition: transform .22s ease, opacity .22s ease;
}
.lp-sticky[data-away] {
  transform: translateY(160%);
  opacity: 0;
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .lp-sticky { transition: none; }
}
/* The button sends you to the form; it must not then sit on top of it,
   nor on the last line of the footer. Only when the button is there. */
.lp-root:has(.lp-sticky) .lp-form-section { padding-bottom: 80px; }
.lp-root:has(.lp-sticky) .lp-footer { padding-bottom: 86px; }

@media (min-width: 640px) {
  .lp-benefits { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .lp-gallery { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .lp-reviews { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .lp-offers { grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
}
/* ─────────────────────────────────────────────────────
   WHAT A BLOCK'S OWN LOOK OVERRIDES.

   The block styles above set an absolute font-size on every heading and
   centre them, so a size or a colour put on the wrapper lost every time:
   the seller pressed أكبر, nothing moved, and there was no way to tell
   whether the control was broken or the value was wrong.

   These say: when the seller HAS chosen, that choice wins inside this
   block. em rather than px, so the wrapper's own scale still multiplies
   through and a phone still gets a phone-sized heading.
   ───────────────────────────────────────────────────── */
/* The dashboard ships a rule on html[lang=ar] h1,h2,… — specificity
   (0,1,1), which beat a plain descendant selector, so a chosen font colour
   applied to everything EXCEPT the headings it was chosen for. Matching
   that shape puts this ahead of it without reaching for !important. */
html [data-look-color] :is(h1, h2, h3, h4, h5, h6, p, span, li, a, strong, em, blockquote, figcaption):not(.lp-cta):not(.lp-btn) {
  color: inherit;
}
[data-look-size] :is(h1, .lp-h1) { font-size: 2.1em; }
[data-look-size] :is(h2, .lp-h2) { font-size: 1.5em; }
[data-look-size] :is(h3, .lp-h3) { font-size: 1.2em; }
[data-look-size] :is(p, span, li, a) { font-size: 1em; }
/* Same problem as the colour: .lp-hero and .lp-h2 set text-align with a
   class, so a plain descendant rule tied and lost on source order. */
html [data-look-align] :is(h1, h2, h3, h4, p, div, section, ul, .lp-hero, .lp-h2, .lp-sub, .lp-section) {
  text-align: inherit;
}
[data-look-font] :is(h1, h2, h3, h4, p, span, li, a, button) { font-family: inherit; }
[data-look-italic] :is(h1, h2, h3, h4, p, span, li, a) { font-style: inherit; }
[data-look-weight] :is(h1, h2, h3, h4, p, span, li, a) { font-weight: inherit; }

/* A heading, a button and a paragraph are three different decisions. One
   colour for the whole block turned the words on a green button red, which
   is never what anybody means.

   Read through each variable's own FALLBACK, not through an attribute
   selector on the style text: a custom property set by React never appears
   in the style attribute string, so a [style*=--look-btn] selector matched
   nothing and every one of these silently did not apply. Unset, each falls
   back to exactly what the rule above it already said. */
html .lp-root :is(h1, h2, h3, h4, .lp-h1, .lp-h2) {
  color: var(--look-heading, inherit);
}
html .lp-root :is(.lp-cta, .lp-btn, .lp-sticky) {
  background: var(--look-btn-bg, var(--lp-accent));
  color: var(--look-btn-fg, var(--lp-accent-text));
  padding: var(--look-btn-pad, 14px 44px);
  font-size: var(--look-btn-size, 16px);
  width: var(--look-btn-width, auto);
  display: var(--look-btn-display, inline-block);
}
`;

/** Google Fonts stylesheet for the chosen Arabic family, or null for system. */
/**
 * The Google stylesheet for every family this page actually uses.
 *
 * Takes a LIST, because the theme picks one and each block may pick its
 * own — asking for the theme's alone left a block's chosen font falling
 * back to the system stack, which looks like the picker doing nothing.
 *
 * The URL was built across newlines, which a browser sends verbatim; one
 * request, one line.
 */
/**
 * The stylesheet for the font PICKER, which is a different problem.
 *
 * The picker draws twenty names each in its own face, and asking for every
 * weight of twenty families to render twenty words at one weight is most of
 * a megabyte thrown at a list. Stripping the weight axis leaves the regular
 * of each — exactly what the list shows — and the page's own faces are
 * requested separately, in full, by fontHref.
 */
export function specimenHref(...fonts: (string | null | undefined)[]): string | null {
  const wanted = [...new Set(fonts.filter(Boolean) as string[])]
    .map((f) => GOOGLE_FAMILY[f])
    .filter(Boolean)
    .map((f) => f.split(':')[0]);
  if (wanted.length === 0) return null;
  return `https://fonts.googleapis.com/css2?${wanted.map((f) => `family=${f}`).join('&')}&display=swap`;
}

export function fontHref(...fonts: (string | null | undefined)[]): string | null {
  // The families come from the ONE registry. This was a third copy of the
  // same list, and it had already fallen behind: two faces the picker
  // offered were missing here, so choosing either loaded nothing and drew
  // the fallback — the picker looking broken for no reason in its own code.
  const wanted = [...new Set(fonts.filter(Boolean) as string[])]
    .map((f) => GOOGLE_FAMILY[f])
    .filter(Boolean);
  if (wanted.length === 0) return null;
  return `https://fonts.googleapis.com/css2?${wanted.map((f) => `family=${f}`).join('&')}&display=swap`;
}

/**
 * THE FACES THIS MACHINE MAY USE AND THIS SITE MAY NOT SERVE.
 *
 * Declared apart from BLOCK_CSS and folded in only outside production, so a
 * built page carries no rule pointing at a font it is not allowed to serve.
 * The route behind these URLs answers 404 in production anyway — this is the
 * second lock, on the other side of the door.
 *
 * Built from the registry rather than written out: a face added there and
 * forgotten here would look broken for a reason nobody would think to check.
 */
const DEV_FONT_CSS = FONTS.filter((f) => f.devOnly)
  .map((f) => {
    // 'thmanyah sans' -> thmanyah-sans, the filename stem on disk.
    const family = f.stack.split(',')[0].replace(/'/g, '').trim();
    const stem = family.toLowerCase().replace(/\s+/g, '-');
    return [300, 400, 500, 700, 900]
      .map(
        (w) => `@font-face{font-family:'${family}';src:url('/api/dev-fonts/${stem}-${w}.woff2') format('woff2');font-weight:${w};font-style:normal;font-display:swap;}`
      )
      .join('\n');
  })
  .join('\n');

/**
 * Everything the page needs to draw itself, plus — on a developer's machine
 * only — the faces they are evaluating but may not publish.
 */
export const BLOCK_CSS_WITH_DEV_FONTS =
  process.env.NODE_ENV === 'production' ? BLOCK_CSS : `${DEV_FONT_CSS}
${BLOCK_CSS}`;
