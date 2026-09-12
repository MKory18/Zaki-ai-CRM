/**
 * LANDING PAGE HTML/CSS SANITIZER — server-side, Phase 1.
 *
 * Uploaded/edited landing HTML is untrusted content. It is ONLY ever served
 * inside a sandboxed iframe (opaque origin, see /lp/[slug]) and CSP'd, but we
 * sanitize at SAVE time as defense in depth so the stored artifact itself
 * carries no active content:
 *   - <script> tags (anywhere, incl. inside attributes tricks)
 *   - inline event handlers (on*)
 *   - javascript: / vbscript: / data:text/html URLs (href, src, action, ...)
 *   - <iframe>, <object>, <embed>, <base>, <meta http-equiv=refresh>
 *   - form action hijacking (forms are allowed but action is dropped; the
 *     trusted Zaki order flow never relies on uploaded forms)
 * CSS is stripped of expression()/behavior/@import/javascript: vectors.
 *
 * This is a pragmatic whitelist-leaning filter (no full DOM parser deps in
 * Phase 1); the sandbox + CSP remain the primary isolation boundary.
 */

export const MAX_LANDING_CSS_BYTES = 512 * 1024;

export interface LandingPageSettings {
  width?: 'full' | 'contained';
  maxWidth?: number;
  background?: string;
  direction?: 'rtl' | 'ltr';
  fontFamily?: string;
}

/** Sanitize untrusted landing HTML. Returns cleaned HTML string. */
export function sanitizeLandingHtml(html: string): string {
  let out = html ?? '';

  // 1) Remove script blocks entirely (multiline, case-insensitive)
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  // stray script open/close leftovers
  out = out.replace(/<\/?script\b[^>]*>/gi, '');

  // 2) Remove dangerous containers entirely (with their content for base/meta)
  out = out.replace(/<iframe\b[\s\S]*?<\/iframe\s*>/gi, '');
  out = out.replace(/<iframe\b[^>]*\/?>/gi, '');
  out = out.replace(/<object\b[\s\S]*?<\/object\s*>/gi, '');
  out = out.replace(/<embed\b[^>]*\/?>/gi, '');
  out = out.replace(/<base\b[^>]*>/gi, '');
  // meta refresh / meta with http-equiv
  out = out.replace(/<meta\b[^>]*http-equiv\b[^>]*>/gi, '');

  // 3) Strip ALL inline event handlers (on*)
  out = out.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // 4) Neutralize dangerous URL schemes in any attribute
  //    (javascript:, vbscript:, data:text/html — incl. encoded variants)
  const dangerousUrl = /(?:j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t|v\s*b\s*s\s*c\s*r\s*i\s*p\s*t|d\s*a\s*t\s*a\s*:\s*t\s*e\s*x\s*t\s*\/\s*h\s*t\s*m\s*l)/i;
  out = out.replace(/(\w+\s*=\s*)(["']?)([^"'>]*)/gi, (m, attr: string, q: string, val: string) => {
    if (dangerousUrl.test(val)) return `${attr}${q}#`;
    return m;
  });
  // href/src/action with javascript: written without quotes
  out = out.replace(/(href|src|action|formaction)\s*=\s*(?:j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t|v\s*b\s*s\s*c\s*r\s*i\s*p\s*t|d\s*a\s*t\s*a\s*:\s*t\s*e\s*x\s*t\s*\/\s*h\s*t\s*m\s*l)[^>\s]*/gi, '$1="#"');

  // 5) Forms may exist (the public form.js flow uses a host div, not uploaded
  //    forms) — strip their action/submit hijacking vectors.
  out = out.replace(/<form\b([^>]*)>/gi, (m, attrs: string) => `<form${attrs.replace(/\saction\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')}>`);

  // 6) style attributes with expression()/javascript: are dead in modern
  //    browsers, stripped anyway for depth:
  out = out.replace(/\sstyle\s*=\s*("([^"]*)")/gi, (m, q: string, val: string) =>
    /expression\s*\(|javascript\s*:|@import/i.test(val) ? ' style=""' : m
  );

  return out;
}

/** Sanitize untrusted landing CSS. Returns cleaned CSS string. */
export function sanitizeLandingCss(css: string): string {
  let out = css ?? '';
  // expression(), behavior, -moz-binding (old IE vectors, dead but stripped)
  out = out.replace(/expression\s*\([^)]*\)/gi, '');
  out = out.replace(/behavior\s*:[^;}]+;?/gi, '');
  out = out.replace(/-moz-binding\s*:[^;}]+;?/gi, '');
  // @import can fetch remote CSS (and old-IE javascript: URLs)
  out = out.replace(/@import[^;]+;?/gi, '');
  // javascript: / data:text/html URLs in url(...)
  out = out.replace(/url\s*\(\s*(['"]?)\s*(?:j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t|v\s*b\s*s\s*c\s*r\s*i\s*p\s*t|d\s*a\s*t\s*a\s*:\s*t\s*e\s*x\s*t\s*\/\s*h\s*t\s*m\s*l)[^)]*\)/gi, 'url("#")');
  // comments can be used to split tokens in old filters — normalize
  out = out.replace(/\/\*[\s\S]*?\*\//g, '');
  return out;
}

/** Validate + normalize page settings JSON from the editor. */
export function parseLandingSettings(raw: unknown): LandingPageSettings | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const out: LandingPageSettings = {};
  if (s.width === 'full' || s.width === 'contained') out.width = s.width;
  if (typeof s.maxWidth === 'number' && Number.isFinite(s.maxWidth) && s.maxWidth >= 320 && s.maxWidth <= 1920) {
    out.maxWidth = Math.round(s.maxWidth);
  }
  if (typeof s.background === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(s.background)) out.background = s.background;
  if (s.direction === 'rtl' || s.direction === 'ltr') out.direction = s.direction;
  if (typeof s.fontFamily === 'string' && /^[\w\s,'"\-]{0,120}$/.test(s.fontFamily)) out.fontFamily = s.fontFamily.slice(0, 120);
  return out;
}

/** Whitelisted dynamic variables available in landing HTML. */
export const LANDING_VARIABLES = [
  'product.name',
  'product.nameEn',
  'product.image',
  'product.description',
  'product.price',
] as const;

function escapeHtml(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Replace whitelisted {{variable}} placeholders with server-side product
 * values (HTML-escaped). Unknown placeholders are left untouched. Values
 * always come from the DB — never from the request.
 */
export function applyLandingVariables(
  html: string,
  data: { name?: string | null; nameEn?: string | null; image?: string | null; description?: string | null; price?: number | null }
): string {
  if (!html) return html;
  const map: Record<string, string> = {
    'product.name': escapeHtml(data.name ?? ''),
    'product.nameEn': escapeHtml(data.nameEn ?? ''),
    'product.image': escapeHtml(data.image ?? ''),
    'product.description': escapeHtml(data.description ?? ''),
    'product.price': escapeHtml(data.price != null ? String(data.price) : ''),
  };
  return html.replace(/\{\{\s*([a-zA-Z.]+)\s*\}\}/g, (m, key: string) => (key in map ? map[key] : m));
}
