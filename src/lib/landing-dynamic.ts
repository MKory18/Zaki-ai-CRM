/**
 * LANDING PAGE DYNAMIC COMPONENTS + BEHAVIOR LAYER — Phase 2
 *
 * Philosophy: the custom HTML owns the DESIGN. Zaki never injects visible
 * UI on its own — it only adds a BEHAVIOR layer to elements the user marked
 * with data-zaki-* attributes:
 *
 *   CUSTOM HTML → SANITIZED HTML → ZAKI BEHAVIOR LAYER → TRUSTED BRIDGE
 *   → TRUSTED REACT ORDER FORM → SERVER ORDER API → DATABASE
 *
 * Placeholders (server-rendered from the DB, escaped):
 *   <div data-zaki-product></div>            → product card (DB values only)
 *   <div data-zaki-offers></div>             → offer cards (DB prices/ids)
 *   <div data-zaki-recommendations></div>    → recommendation cards (DB)
 *   <div data-zaki-order-form></div>         → optional trusted-form anchor
 *
 * Actions (behavior only — no design imposed):
 *   <button data-zaki-action="order">        → open/scroll to trusted form
 *   <a data-zaki-action="scroll-order">      → scroll request
 *   <button data-zaki-action="offer" data-zaki-offer="ID"> → select offer
 *   (legacy <button data-zaki-order> keeps working)
 *
 * Fixed CTA positioning (opt-in only):
 *   data-zaki-position="fixed-bottom|fixed-top|floating" → adds a class from
 *   the behavior stylesheet. Position ONLY — colors/fonts are never imposed
 *   unless requested via validated data-zaki-* styling attributes.
 *
 * Security contract:
 *  - All displayed values come from the DB, HTML-escaped. data-price,
 *    data-company-id, data-product-id etc. from the custom HTML are ignored.
 *  - The behavior script is 100% hard-coded server output (no user input;
 *    slug regex-validated). Style values are validated by strict allowlists
 *    (see safeStyleValue) BEFORE touching element.style — invalid values are
 *    silently ignored, never surfaced as errors.
 *  - postMessage is the ONLY channel to the trusted parent; the bridge
 *    re-validates message shape, action allowlist and the offer allowlist.
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
        `<button type="button" data-zaki-action="offer" data-zaki-offer="${esc(o.id)}"${isDefault} style="${CARD_BASE}display:block;width:100%;cursor:pointer;text-align:start;background:#fff;font:inherit">` +
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

// ─────────────────────────────────────────────────────────────
// SAFE CSS VALUE VALIDATORS (behavior layer)
// Strict allowlists — anything that is not a simple, safe value is
// silently ignored (no error surfaced to the client).
// ─────────────────────────────────────────────────────────────

const RE_COLOR = /^#[0-9a-fA-F]{3,8}$|^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0?\.\d+|1(?:\.0+)?)\s*)?\)$/;
const RE_LEN = /^\d+(?:\.\d+)?(?:px|rem|em|%)$/;
const RE_PADDING = /^\d+(?:\.\d+)?(?:px|rem|em|%)?(?:\s+\d+(?:\.\d+)?(?:px|rem|em|%))?$/;

const STYLE_RULES: Record<string, { re: RegExp; max: number; prop: string }> = {
  bg: { re: RE_COLOR, max: 30, prop: 'background-color' },
  color: { re: RE_COLOR, max: 30, prop: 'color' },
  'font-size': { re: RE_LEN, max: 20, prop: 'font-size' },
  'font-weight': { re: /^\d{2,3}$|^normal$|^bold$/, max: 10, prop: 'font-weight' },
  radius: { re: RE_LEN, max: 20, prop: 'border-radius' },
  width: { re: RE_LEN, max: 20, prop: 'width' },
  padding: { re: RE_PADDING, max: 50, prop: 'padding' },
  shadow: { re: /^[\w\s.,#()\[\]-]+$/, max: 100, prop: 'box-shadow' },
  bottom: { re: RE_LEN, max: 20, prop: 'bottom' },
  'z-index': { re: /^\d{1,6}$/, max: 6, prop: 'z-index' },
};

/**
 * Validate one data-zaki-* style attribute → CSS property value, or null.
 * Rejects: javascript:, expression(), url(), </style>, ; { } < > and
 * over-length values. Invalid → null (never an error to the client).
 */
export function safeStyleValue(attr: string, value: string): string | null {
  if (typeof value !== 'string') return null;
  const rule = STYLE_RULES[attr];
  if (!rule) return null;
  const v = value.trim();
  if (!v || v.length > rule.max) return null;
  if (/[;{}<>]|(?:j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t)|(?:e\s*x\s*p\s*r\s*e\s*s\s*s\s*i\s*o\s*n\s*\()|(?:u\s*r\s*l\s*\()/i.test(v)) return null;
  return rule.re.test(v) ? v : null;
}

const POSITION_VALUES = ['fixed-bottom', 'fixed-top', 'floating'] as const;

/** Behavior-layer stylesheet: position classes ONLY (no design imposed). */
export const BEHAVIOR_CSS = `
.zaki-fixed-bottom { position: fixed !important; left: 50%; bottom: 20px; transform: translateX(-50%); z-index: 9999; }
.zaki-fixed-top { position: fixed !important; left: 50%; top: 20px; transform: translateX(-50%); z-index: 9999; }
.zaki-floating { position: fixed !important; left: 20px; bottom: 20px; z-index: 9999; }
`;

export function buildBehaviorStyleTag(): string {
  return `<style id="zaki-behavior-style">${BEHAVIOR_CSS}</style>`;
}

/** Replace every placeholder element carrying the given data-zaki-* attribute. */
function replacePlaceholder(html: string, attr: string, replacement: string): string {
  if (!html.includes(`data-zaki-${attr}`)) return html;
  let out = html.replace(
    new RegExp(`<([a-zA-Z]+)\\b[^>]*\\bdata-zaki-${attr}\\b[^>]*>[\\s\\S]*?</\\1>`, 'gi'),
    replacement
  );
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
 * Replace all data-zaki-* placeholders with server-rendered blocks, inject
 * the behavior stylesheet and the hard-coded interaction script.
 * Run AFTER sanitizeLandingHtml.
 */
export function resolveDynamicPlaceholders(input: ResolveDynamicInput): string {
  let html = input.html ?? '';

  html = replacePlaceholder(html, 'product', renderProductBlock(input.product));
  html = replacePlaceholder(html, 'offers', renderOffersBlock(input.offers, input.currency));
  html = replacePlaceholder(html, 'recommendations', renderRecommendationsBlock(input.recommendations, input.currency));
  html = replacePlaceholder(html, 'order-form', renderOrderFormAnchor());

  // Behavior stylesheet + script only when the page uses the behavior layer
  const usesBehavior = /data-zaki-(?:action|order\b|offer\b|position)/.test(html);
  if (usesBehavior) {
    const styleTag = buildBehaviorStyleTag();
    if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, `${styleTag}</head>`);
    else html = styleTag + html;
  }

  if (!input.skipScript && usesBehavior) {
    const script = buildBehaviorScript(false);
    if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, `${script}</body>`);
    else html += script;
  }
  return html;
}

/**
 * True when the custom HTML asks for ordering in any way
 * (data-zaki-action="order"/"scroll-order", legacy data-zaki-order,
 * or the optional data-zaki-order-form marker). Used by the public page to
 * decide whether the trusted OrderForm should exist at all.
 */
export function detectOrderIntent(html: string | null | undefined): boolean {
  if (!html) return false;
  return /data-zaki-(?:action\s*=\s*["'](order|scroll-order)["']|order-form|order(?![\w-]))/.test(html);
}

/**
 * Hard-coded behavior bootstrap (server-generated — the custom HTML
 * contributes NOTHING to this code):
 *   1. Opt-in positioning: data-zaki-position ∈ allowlist → adds the
 *      behavior-layer class (position only, never colors/fonts).
 *   2. Opt-in styling: data-zaki-bg/color/... validated with strict
 *      allowlists before el.style.setProperty — invalid values are ignored.
 *   3. Actions: order / scroll-order / offer (+ legacy data-zaki-order) →
 *      postMessage {type:'ZAKI_ORDER'} to the trusted parent. The bridge
 *      re-validates everything; the iframe gets no data back.
 * `preview` variant: same positioning/styling, offers highlight locally,
 * CTAs scroll to the in-frame anchor (no real orders in preview).
 */
export function buildBehaviorScript(preview: boolean): string {
  // Shared, hard-coded validator logic (identical rules to safeStyleValue)
  const script = `(function(){'use strict';
var POS = { 'fixed-bottom':1, 'fixed-top':1, 'floating':1 };
var RULES = {
  'bg': [/^#[0-9a-fA-F]{3,8}$|^rgba?\\\\(\\\\s*\\\\d{1,3}\\\\s*,\\\\s*\\\\d{1,3}\\\\s*,\\\\s*\\\\d{1,3}\\\\s*(,\\\\s*(0?\\\\.\\\\d+|1(\\\\.0+)?)\\\\s*)?\\\\)$/, 30, 'background-color'],
  'color': [/^#[0-9a-fA-F]{3,8}$|^rgba?\\\\(\\\\s*\\\\d{1,3}\\\\s*,\\\\s*\\\\d{1,3}\\\\s*,\\\\s*\\\\d{1,3}\\\\s*(,\\\\s*(0?\\\\.\\\\d+|1(\\\\.0+)?)\\\\s*)?\\\\)$/, 30, 'color'],
  'font-size': [/^\\\\d+(?:\\\\.\\\\d+)?(?:px|rem|em|%)$/, 20, 'font-size'],
  'font-weight': [/^\\\\d{2,3}$|^normal$|^bold$/, 10, 'font-weight'],
  'radius': [/^\\\\d+(?:\\\\.\\\\d+)?(?:px|rem|em|%)$/, 20, 'border-radius'],
  'width': [/^\\\\d+(?:\\\\.\\\\d+)?(?:px|rem|em|%)$/, 20, 'width'],
  'padding': [/^\\\\d+(?:\\\\.\\\\d+)?(?:px|rem|em|%)?(?:\\\\s+\\\\d+(?:\\\\.\\\\d+)?(?:px|rem|em|%))?$/, 50, 'padding'],
  'shadow': [/^[\\\\w\\\\s.,#()\\\\[\\\\]-]+$/, 100, 'box-shadow'],
  'bottom': [/^\\\\d+(?:\\\\.\\\\d+)?(?:px|rem|em|%)$/, 20, 'bottom'],
  'z-index': [/^\\\\d{1,6}$/, 6, 'z-index']
};
var BAD = /;\\\\s*\\\\{\\\\}|<>|j\\\\s*a\\\\s*v\\\\s*a\\\\s*s\\\\s*c\\\\s*r\\\\s*i\\\\s*p\\\\s*t|e\\\\s*x\\\\s*p\\\\s*r\\\\s*e\\\\s*s\\\\s*s\\\\s*i\\\\s*o\\\\s*n|url\\\\(/i;
function sv(name, raw) {
  var r = RULES[name]; if (!r) return null;
  var v = String(raw == null ? '' : raw).trim();
  if (!v || v.length > r[1] || BAD.test(v)) return null;
  return r[0].test(v) ? v : null;
}
var styled = document.querySelectorAll('[data-zaki-action],[data-zaki-order]');
for (var i = 0; i < styled.length; i++) {
  var el = styled[i];
  var pos = el.getAttribute('data-zaki-position');
  if (pos && POS[pos]) el.classList.add('zaki-' + pos);
  for (var k2 = 0; k2 < el.attributes.length; k2++) {
    var at = el.attributes[k2];
    if (at.name.indexOf('data-zaki-') !== 0) continue;
    var key = at.name.replace('data-zaki-', '');
    if (key === 'position' || key === 'action' || key === 'offer' || key === 'offer-id') continue;
    var val = sv(key, at.value);
    if (val != null) { try { el.style.setProperty(RULES[key][2], val); } catch (e) {} }
  }
}
function post(msg){ try { window.parent.postMessage(msg, '*'); } catch (e) {} }
document.addEventListener('click', function (ev) {
  var n = ev.target;
  while (n && n !== document.body) {
    if (n.getAttribute) {
      var act = n.getAttribute('data-zaki-action');
      var legacy = n.hasAttribute && n.hasAttribute('data-zaki-order');
      var oid = n.getAttribute('data-zaki-offer') || n.getAttribute('data-zaki-offer-id');
      if ((act === 'offer' || (!act && legacy && oid)) && oid) {
        ev.preventDefault();
        ${preview ? "n.style.borderColor = '#b8256e'; n.style.background = '#fdf2f7';" : "post({ type: 'ZAKI_ORDER', action: 'select-offer', offerId: String(oid) });"}
        return;
      }
      if (act === 'order' || act === 'scroll-order' || (legacy && !oid && !act)) {
        ev.preventDefault();
        ${preview
          ? "var a = document.getElementById('zaki-order-form-anchor'); if (a) a.scrollIntoView({ behavior: 'smooth', block: 'start' }); else { var t = document.createElement('div'); t.textContent = 'Preview: سيُفتح نموذج الطلب الموثوق هنا'; t.style.cssText = 'position:fixed;left:50%;bottom:80px;transform:translateX(-50%);background:#121926;color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;z-index:10000'; document.body.appendChild(t); setTimeout(function(){ t.remove(); }, 1800); }"
          : "post({ type: 'ZAKI_ORDER', action: 'open' });"}
        return;
      }
    }
    n = n.parentNode;
  }
}, true);
})();`;
  return `<script>${script}</script>`;
}