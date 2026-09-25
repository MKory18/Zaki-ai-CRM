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
  background: var(--lp-header-bg, var(--lp-card));
  border-bottom: 1px solid var(--lp-border);
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
  font-size: 16px;
  font-weight: var(--lp-heading-weight);
  line-height: 1.3;
}
.sf-brand em {
  display: block;
  font-style: normal;
  font-size: 11.5px;
  color: var(--lp-muted);
}
.sf-phone {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  font-size: 13.5px;
  font-weight: 800;
  text-decoration: none;
  color: var(--lp-accent);
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

/* ── shop hero ── */
.sf-hero {
  max-width: 1100px;
  margin: 0 auto;
  padding: 36px 20px 8px;
  text-align: center;
}
.sf-hero h1 {
  font-size: clamp(22px, 4.6vw, 34px);
  font-weight: var(--lp-heading-weight);
  margin: 0 0 8px;
  letter-spacing: -.3px;
}
.sf-hero p { font-size: 14.5px; color: var(--lp-muted); max-width: 620px; margin: 0 auto; }

/* ── product grid ── */
.sf-grid-wrap { max-width: 1100px; margin: 0 auto; padding: 24px 20px 40px; }
.sf-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.sf-card {
  display: flex;
  flex-direction: column;
  background: var(--lp-card);
  border: 1px solid var(--lp-border);
  border-radius: var(--lp-radius);
  overflow: hidden;
  text-decoration: none;
  color: inherit;
  transition: border-color .15s ease, transform .15s ease;
}
.sf-card:hover { border-color: var(--lp-accent); transform: translateY(-2px); }
.sf-card-img {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  background: var(--lp-page);
  display: block;
}
.sf-card-none {
  width: 100%;
  aspect-ratio: 1 / 1;
  background: var(--lp-accent-tint);
}
.sf-card-body { padding: 12px 14px 14px; display: grid; gap: 4px; }
.sf-card-name {
  font-size: 13.5px;
  font-weight: 800;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.sf-card-price { font-size: 15px; font-weight: 900; color: var(--lp-accent); }
.sf-card-price small { font-size: 10.5px; font-weight: 600; color: var(--lp-muted); }

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
