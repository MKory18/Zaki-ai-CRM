/**
 * FORMATTING A SELECTION, WITHOUT OPENING THE PAGE TO ARBITRARY MARKUP.
 *
 * A seller wants what a word processor gives them: pick some words in a
 * headline, make them the brand colour, make them bigger. The obvious way
 * to store that is inline HTML with a `style` attribute, and the obvious
 * way is wrong twice over.
 *
 * It is wrong for security, because a `style` string is a free-text field
 * that ends up in a public page, and sanitising free-text CSS correctly is
 * a job nobody should take on in a shop's codebase.
 *
 * It is wrong for design, because a page where any word can be any colour
 * is a page that ends up with a red word, a blue word and a green word,
 * each chosen on a different day. The whole reason this builder produces
 * coherent pages is that the seller chooses from the theme rather than
 * from a colour wheel.
 *
 * So the markup stores INDEXES, not styles. `<span data-c="3">` means
 * "swatch three", `data-s="l"` means "one size up", `data-f="cairo"` means
 * a font from the library. Validating that is comparing against a list.
 * There is no CSS in the stored value, so there is no CSS to sanitise, and
 * the rendered result cannot leave the palette the page is built from.
 *
 * Old values keep working untouched: plain text is valid rich text, and
 * every field that accepts this accepted a plain string before.
 */

import { z } from 'zod';
import { FONT_KEYS, UPLOADED_FONT_RE } from './landing-theme';

/** The swatches a selection may be painted with, and what each one is. */
export const MARK_COLORS = [
  { key: 'a', label: 'لون الهوية', css: 'var(--lp-accent)' },
  { key: '0', label: 'أسود', css: '#111827' },
  { key: '1', label: 'أبيض', css: '#ffffff' },
  { key: '2', label: 'رمادي', css: '#697586' },
  { key: '3', label: 'أخضر', css: '#16a34a' },
  { key: '4', label: 'أزرق', css: '#0ea5e9' },
  { key: '5', label: 'برتقالي', css: '#f59e0b' },
  { key: '6', label: 'أحمر', css: '#ef4444' },
  { key: '7', label: 'بنفسجي', css: '#7c3aed' },
] as const;

/** Sizes relative to the surrounding text, never absolute. */
export const MARK_SIZES = [
  { key: 'xs', label: 'أصغر', em: '0.75em' },
  { key: 's', label: 'صغير', em: '0.87em' },
  { key: 'l', label: 'كبير', em: '1.2em' },
  { key: 'xl', label: 'أكبر', em: '1.5em' },
] as const;

export type MarkColor = (typeof MARK_COLORS)[number]['key'];
export type MarkSize = (typeof MARK_SIZES)[number]['key'];

const COLOR_KEYS = new Set<string>(MARK_COLORS.map((c) => c.key));
const SIZE_KEYS = new Set<string>(MARK_SIZES.map((s) => s.key));

/** Tags a selection may be wrapped in. Meaning, not appearance. */
const TAGS = new Set(['b', 'i', 'u', 's', 'mark', 'span', 'br']);

/** Attributes a span may carry, and what makes each one valid. */
const ATTRS: Record<string, (v: string) => boolean> = {
  'data-c': (v) => COLOR_KEYS.has(v),
  'data-s': (v) => SIZE_KEYS.has(v),
  'data-f': (v) => FONT_KEYS.includes(v as never) || UPLOADED_FONT_RE.test(v),
};

/** A tag deeper than this is a paste, not a seller formatting a phrase. */
const MAX_DEPTH = 6;
/** Longer than this is not a headline, whatever arrived in the field. */
export const MAX_RICH_LENGTH = 4000;

/**
 * Escape for text, WITHOUT escaping an escape.
 *
 * This runs on save and again on render, so it has to be stable: `a <b`
 * became `a &lt;b` on the first pass and `a &amp;lt;b` on the second, and
 * the seller watched their own text grow gibberish every time they saved.
 *
 * So an `&` that already begins an entity is left alone. It is the only
 * ambiguous character — a literal `&amp;` a seller typed is indistinguishable
 * from one we wrote, and rendering it as `&` is the far likelier intent.
 */
const ENTITY = /&(?:[a-zA-Z][a-zA-Z0-9]{1,30}|#\d{1,7}|#x[0-9a-fA-F]{1,6});/y;

function escapeText(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '<') { out += '&lt;'; continue; }
    if (ch === '>') { out += '&gt;'; continue; }
    if (ch === '&') {
      ENTITY.lastIndex = i;
      const m = ENTITY.exec(s);
      if (m) { out += m[0]; i += m[0].length - 1; continue; }
      out += '&amp;';
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Keep only what the toolbar can produce; turn everything else into text.
 *
 * An allowlist walked by hand rather than a regex sweep: a regex that
 * deletes `<script>` deletes the ones it recognises, and this has to be
 * right about the ones it does not.
 *
 * An unrecognised TAG is dropped and its text kept, because the commonest
 * way markup reaches this field is a paste from a word processor, and a
 * seller pasting a paragraph wants the paragraph and not a wall of escaped
 * angle brackets. A `<` that never opens a tag stays as a character.
 */
export function sanitizeRich(input: string | null | undefined): string {
  if (!input) return '';
  const src = String(input).slice(0, MAX_RICH_LENGTH);

  const out: string[] = [];
  const open: string[] = [];
  let i = 0;

  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt === -1) {
      out.push(escapeText(src.slice(i)));
      break;
    }
    if (lt > i) out.push(escapeText(src.slice(i, lt)));

    const gt = src.indexOf('>', lt);
    // A '<' with no '>' after it is a character, not a tag.
    if (gt === -1) {
      out.push(escapeText(src.slice(lt)));
      break;
    }

    const raw = src.slice(lt + 1, gt).trim();
    i = gt + 1;

    // ── closing tag ──
    if (raw.startsWith('/')) {
      const name = raw.slice(1).trim().toLowerCase();
      if (!TAGS.has(name)) continue; // never opened by us; drop it
      // Close back to it, so `<b><i></b>` cannot leave `<i>` hanging open.
      const at = open.lastIndexOf(name);
      if (at === -1) continue;
      for (let k = open.length - 1; k >= at; k--) out.push(`</${open[k]}>`);
      open.length = at;
      continue;
    }

    // ── opening tag ──
    const m = /^([a-z0-9]+)/i.exec(raw);
    if (!m) continue;
    const name = m[1].toLowerCase();
    if (!TAGS.has(name)) continue;

    if (name === 'br') {
      out.push('<br />');
      continue;
    }
    if (open.length >= MAX_DEPTH) continue;

    // Attributes: only the three, only with values from their lists.
    const attrs: string[] = [];
    const re = /([a-z-]+)\s*=\s*"([^"]*)"|([a-z-]+)\s*=\s*'([^']*)'/gi;
    let a: RegExpExecArray | null;
    while ((a = re.exec(raw))) {
      const key = (a[1] || a[3] || '').toLowerCase();
      const value = a[2] ?? a[4] ?? '';
      const ok = ATTRS[key];
      if (ok && ok(value)) attrs.push(`${key}="${value}"`);
    }
    // A span carrying nothing says nothing; it would only be noise to undo.
    if (name === 'span' && attrs.length === 0) continue;

    open.push(name);
    out.push(`<${name}${attrs.length ? ' ' + attrs.join(' ') : ''}>`);
  }

  // Anything still open is closed, in order.
  for (let k = open.length - 1; k >= 0; k--) out.push(`</${open[k]}>`);

  return out.join('');
}

/** The words alone — for a page title, a meta description, a search index. */
export function richToText(input: string | null | undefined): string {
  if (!input) return '';
  return String(input)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Does this value need the rich renderer, or is it just words? */
export function isRich(input: string | null | undefined): boolean {
  return Boolean(input && /<\/?[a-z]/i.test(input));
}

/**
 * The stylesheet the marks resolve through.
 *
 * Generated from the same lists the toolbar offers, so a swatch added there
 * cannot be a swatch the page has no rule for.
 */
export function richTextCss(): string {
  const color = MARK_COLORS.map(
    (c) => `.lp-root [data-c="${c.key}"]{color:${c.css};}`
  ).join('\n');
  const size = MARK_SIZES.map(
    (s) => `.lp-root [data-s="${s.key}"]{font-size:${s.em};}`
  ).join('\n');
  return `${color}
${size}
/* The highlighter uses the theme's own pale tint, so it cannot clash with
   the page it is drawn on — and the text keeps its own colour. */
.lp-root mark{background:var(--lp-accent-tint);color:inherit;padding:0 .15em;border-radius:.2em;}
.lp-root u{text-decoration-thickness:.08em;text-underline-offset:.15em;}`;
}

/**
 * A seller-written text field, with the limit on the WORDS and not the marks.
 *
 * A 120-character headline that a seller has coloured two words of is still
 * a 120-character headline — the span around them is not something they
 * wrote and not something a visitor reads. Counting the markup against them
 * would mean the limit tightens every time they format anything, which is
 * the sort of rule that makes people stop formatting.
 *
 * So the raw value gets generous room, is sanitised, and is then measured
 * as text. Sanitising here rather than only in the editor because this is
 * the last place a value can be stopped: the public page reads the stored
 * row directly.
 */
export function richTextSchema(max: number) {
  return z
    .string()
    .max(Math.min(MAX_RICH_LENGTH, max * 4 + 300))
    .transform(sanitizeRich)
    .refine((v) => richToText(v).length <= max, {
      message: `النص أطول من ${max} حرفاً`,
    });
}
