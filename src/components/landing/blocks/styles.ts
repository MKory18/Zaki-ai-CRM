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
.lp-root {
  font-family: var(--lp-font);
  color: var(--lp-text);
  background: var(--lp-page);
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
}
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
`;

/** Google Fonts stylesheet for the chosen Arabic family, or null for system. */
export function fontHref(font: string): string | null {
  const families: Record<string, string> = {
    tajawal: 'Tajawal:wght@400;500;700;800;900',
    cairo: 'Cairo:wght@400;600;700;800;900',
    almarai: 'Almarai:wght@400;700;800',
  };
  const family = families[font];
  return family ? `https://fonts.googleapis.com/css2?family=${family}&display=swap` : null;
}
