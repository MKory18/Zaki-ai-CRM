/**
 * LANDING PAGE DYNAMIC COMPONENTS — Phase 2
 *
 * Turns declarative placeholders inside the (untrusted) custom HTML into
 * server-rendered, DB-backed markup:
 *
 *   <div data-zaki-product></div>            → product card (DB data)
 *   <div data-zaki-offers></div>             → offer cards (DB prices)
 *   <div data-zaki-recommendations></div>    → recommendation cards (DB)
 *   <div data-zaki-order-form></div>         → trusted-form anchor marker
 *   <button data-zaki-order> / <a data-zaki-order> → wired by a hard-coded
 *       server-generated interaction script (postMessage to the trusted
 *       parent page — the custom HTML never gets code execution).
 *
 * Security contract:
 *  - ALL displayed values come from the DB (product/offers/recommendations),
 *    HTML-escaped at render. The custom HTML cannot influence price,
 *    offerId, productId, companyId or totals — it can only place markers.
 *  - The interaction script is 100% hard-coded server output (no user input,
 *    slug is regex-validated) — the same trust model as the existing
 *    /api/public/landing-pages/[slug]/form.js bootstrap.
 *  - The parent page validates every postMessage: offer ids must exist in
 *    the page's own DB offers, other message types are ignored.
 *  - All replacements happen AFTER the user HTML is sanitized.
 */

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface DynamicProduct {
  name?: string | null;
  nameEn?: string | null;
  image?: string | null;
  description?: string | null;
  price?: number | null;
}

export interface DynamicOffer {
  id: string;
  name: string;
  quantity: number;
  freeQuantity: number;
  price: number;
  isDefault?: boolean;
}

export interface DynamicRecommendation {
  id: string;
  name: string;
  price: number;
  image: string | null;
}

const CARD_BASE =
  'border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin:8px 0;box-sizing:border-box;';

/** Product card — DB values only, escaped. */
export function renderProductBlock(p: DynamicProduct | null): string {
  if (!p || (!p.name && !p.image)) return '';
  const img = p.image
    ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" style="max-width:100%;border-radius:12px;display:block;margin:0 auto 12px">`
    : '';
  const name = p.name ? `<h2 style="margin:8px 0;font-size:26px;font-weight:800">${esc(p.name)}</h2>` : '';
  const desc = p.description ? `<p style="color:#555;line-height:1.8;margin:8px 0">${esc(p.description)}</p>` : '';
  const price = p.price != null ? `<p style="font-size:22px;font-weight:800;margin:8px 0">${esc(p.price)}</p>` : '';
  return `<div style="text-align:center;padding:16px 0">${img}${name}${desc}${price}</div>`;
}

/** Offer cards — clickable, real DB ids only. Selection flows to the trusted form via postMessage. */
export function renderOffersBlock(offers: DynamicOffer[], currency: string): string {
  if (!offers || offers.length === 0) return '';
  const cards = offers
    .map((o) => {
      const isDefault = o.isDefault ? ' data-zaki-selected="1"' : '';
      const qty = o.quantity + (o.freeQuantity > 0 ? ` + ${o.freeQuantity} مجانًا` : '');
      return (
        `<button type="button" data-zaki-offer-id="${esc(o.id)}"${isDefault} style="${CARD_BASE}display:block;width:100%;cursor:pointer;text-align:start;background:#fff;font:inherit">` +
        `<span style="display:flex;justify-content:space-between;gap:8px;align-items:center">` +
        `<span style="font-weight:700">${esc(o.name)}</span>` +
        `<span style="font-weight:800;color:#b8256e;white-space:nowrap">${esc(o.price)} ${esc(currency)}</span>` +
        `</span>` +
        `<span style="display:block;color:#697586;font-size:13px;margin-top:4px">${esc(qty)}</span>` +
        `</button>`
      );
    })
    .join('');
  return `<div data-zaki-offers-rendered style="margin:12px 0">${cards}</div>`;
}

/** Recommendation cards — display-only (upsell flow stays on the success screen). */
export function renderRecommendationsBlock(recs: DynamicRecommendation[], currency: string): string {
  if (!recs || recs.length === 0) return '';
  const cards = recs
    .map(
      (r) =>
        `<div style="${CARD_BASE}display:inline-block;width:150px;vertical-align:top;text-align:center;margin:6px">` +
        (r.image ? `<img src="${esc(r.image)}" alt="${esc(r.name)}" style="width:100%;border-radius:8px">` : '') +
        `<div style="font-weight:600;font-size:14px;margin-top:6px">${esc(r.name)}</div>` +
        `<div style="color:#b8256e;font-weight:800">${esc(r.price)} ${esc(currency)}</div>` +
        `</div>`
    )
    .join('');
  return `<div style="margin:12px 0;text-align:center">${cards}</div>`;
}

/** Trusted-form anchor — the real OrderForm is a React component OUTSIDE the iframe. */
export function renderOrderFormAnchor(): string {
  return `<div id="zaki-order-form-anchor" style="padding:8px 0"></div>`;
}

/** Replace every placeholder element carrying the given data-zaki-* attribute. */
function replacePlaceholder(html: string, attr: string, replacement: string): string {
  if (!html.includes(`data-zaki-${attr}`)) return html;
  // paired elements with content: <div data-zaki-x ...> ... </div>
  let out = html.replace(
    new RegExp(`<([a-zA-Z]+)\\b[^>]*\\bdata-zaki-${attr}\\b[^>]*>[\\s\\S]*?</\\1>`, 'gi'),
    replacement
  );
  // self-closing / unclosed leftovers
  out = out.replace(new RegExp(`<([a-zA-Z]+)\\b[^>]*\\bdata-zaki-${attr}\\b[^>]*/?>`, 'gi'), replacement);
  return out;
}

export interface ResolveDynamicInput {
  html: string;
  product: DynamicProduct | null;
  offers: DynamicOffer[];
  recommendations: DynamicRecommendation[];
  currency: string;
  /** omit the interaction script (used by the editor preview, which injects its own) */
  skipScript?: boolean;
  /** slug already regex-validated by callers; embedded into the hard-coded script */
  slug: string;
}

/**
 * Replace all data-zaki-* placeholders with server-rendered blocks and append
 * the hard-coded interaction script. Run AFTER sanitizeLandingHtml.
 */
export function resolveDynamicPlaceholders(input: ResolveDynamicInput): string {
  let html = input.html ?? '';

  html = replacePlaceholder(html, 'product', renderProductBlock(input.product));
  html = replacePlaceholder(html, 'offers', renderOffersBlock(input.offers, input.currency));
  html = replacePlaceholder(html, 'recommendations', renderRecommendationsBlock(input.recommendations, input.currency));
  html = replacePlaceholder(html, 'order-form', renderOrderFormAnchor());

  if (!input.skipScript && (html.includes('data-zaki-offer-id') || html.includes('data-zaki-order'))) {
    const script = buildInteractionScript(input.slug);
    if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, `${script}</body>`);
    else html += script;
  }
  return html;
}

/**
 * Hard-coded interaction bootstrap (server-generated — the custom HTML
 * contributes NOTHING to this code). It only:
 *  1. forwards clicks on server-rendered offer cards to the trusted parent
 *  2. forwards clicks on [data-zaki-order] CTA elements as a scroll request
 * The parent validates every message; unknown ids/types are ignored.
 */
export function buildInteractionScript(slug: string): string {
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return '';
  return `<script>(function(){'use strict';
function post(msg){ try { window.parent.postMessage(msg, '*'); } catch (e) {} }
document.addEventListener('click', function (ev) {
  var n = ev.target;
  while (n && n !== document.body) {
    if (n.getAttribute) {
      var oid = n.getAttribute('data-zaki-offer-id');
      if (oid) { ev.preventDefault(); post({ type: 'zaki:offer', offerId: oid }); return; }
      if (n.hasAttribute && n.hasAttribute('data-zaki-order')) {
        ev.preventDefault();
        post({ type: 'zaki:scroll-form' });
        var anchor = document.getElementById('zaki-order-form-anchor');
        if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    n = n.parentNode;
  }
}, true);
})();</script>`;
}
