import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * ONE PALETTE, AND IT BELONGS TO THE THEME.
 *
 * A hundred and forty-four classes across thirteen files painted
 * themselves from Tailwind's own palette or from a hex — `bg-indigo-50`,
 * `text-violet-700`, `border-[#e3e8ef]` — and every one of them had the
 * same two problems.
 *
 * THEY DO NOT FOLLOW THE THEME. A person who picks the light theme or the
 * calm one gets those exact colours anyway, pasted on top of a palette
 * that moved around them.
 *
 * AND THEY ARE LIGHT-MODE ONLY. A `-50` background is a near-white chip,
 * and the default theme here is dark. Three shipping stages — تغليف,
 * جاهز للاستلام, تم الشحن — were near-white chips with near-white text on
 * the theme most of this product is read in.
 *
 * There were three hues for "in progress, further along", which is not a
 * fifth meaning: the stage is said by the WORD on the chip. They are
 * neutral now, and the four tones are the whole vocabulary.
 *
 * A SELLER'S OWN PAGES ARE NOT IN THIS. A landing page and a storefront
 * are the seller's design, and a dashboard rule reaching them would be the
 * same mistake as a dashboard colour reaching them.
 */

const SELLERS = [
  '/components/landing/', '/components/public/', '/components/store/',
  '/app/(public)/', '/app/lp/', '/app/s/',
];

const HUES =
  'blue|purple|slate|gray|grey|emerald|rose|amber|green|red|indigo|teal|cyan|sky|orange|yellow|pink|violet|fuchsia|lime|stone|zinc|neutral';

const RAW = new RegExp(
  `(?<![\\w-])(?:hover:|focus:|active:|group-hover:|md:|lg:|sm:|dark:)?(?:bg|text|border|ring|divide|from|via|to|fill|stroke|outline|decoration|accent|caret)-(?:${HUES})-\\d{2,3}`,
  'g'
);

/**
 * Comments stripped, line numbers kept.
 *
 * A note naming a forbidden class contains that class, and deleting a
 * block comment outright deletes its newlines too — so every line number
 * after the first one is reported short and the offender list points at
 * innocent lines.
 */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^(\s*)\/\/.*$/gm, '$1');
}

/**
 * Template literals blanked out, newlines kept.
 *
 * The landing-page editor GENERATES the seller's page: its markup and its
 * stylesheet live in template literals, brand pink and all, and those
 * colours are theirs. A guard that read them would be asking a seller's
 * page to follow the dashboard's theme — the same mistake in reverse.
 */
function stripTemplates(src: string): string {
  const out = src.split('');
  const blank = (i: number) => {
    if (src[i] !== '\n') out[i] = ' ';
  };
  let i = 0;
  while (i < src.length) {
    if (src[i] !== '`') {
      i++;
      continue;
    }
    blank(i);
    i++;
    let depth = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') {
        blank(i);
        blank(i + 1);
        i += 2;
        continue;
      }
      if (c === '$' && src[i + 1] === '{') depth++;
      else if (c === '}' && depth > 0) depth--;
      else if (c === '`' && depth === 0) {
        blank(i);
        i++;
        break;
      }
      blank(i);
      i++;
    }
  }
  return out.join('');
}

function dashboard(): { rel: string; src: string }[] {
  const out: { rel: string; src: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.tsx') && !p.includes('.test.')) {
        const rel = `/${relative(process.cwd(), p).split('\\').join('/')}`;
        if (!SELLERS.some((s) => rel.includes(s))) out.push({ rel, src: readFileSync(p, 'utf8') });
      }
    }
  };
  walk(join(process.cwd(), 'src'));
  return out;
}

describe('the colours on a dashboard screen', () => {
  it('come from the theme, never from Tailwind’s own palette', () => {
    const offenders: string[] = [];
    for (const { rel, src } of dashboard()) {
      const lines = code(src).split('\n');
      for (let i = 0; i < lines.length; i++) {
        for (const m of lines[i].matchAll(RAW)) offenders.push(`${rel}:${i + 1}  ${m[0]}`);
      }
    }
    expect(offenders, `لونٌ خارج الثيم:\n${offenders.slice(0, 25).join('\n')}`).toEqual([]);
  });

  /**
   * A THIRD PARTY'S BRAND IS NOT THIS PRODUCT'S PALETTE.
   *
   * Telegram's blue on the Telegram integration is a fact about Telegram,
   * the way its logo is. Painting it `--sys-primary` would not make it
   * follow the theme; it would make it the wrong mark. Named here rather
   * than waved through, so a fourth colour cannot join the list quietly.
   */
  const OTHER_BRANDS = new Set([
    '#229ed9', // Telegram
    '#53bdeb', // WhatsApp's read receipt
    '#1877f2', // Meta
    '#000000', // TikTok
    '#fffc00', // Snapchat
    '#4285f4', // Google
    '#ffffff', // Google's white mark
  ]);

  it('and no screen writes a hex of its own', () => {
    const offenders: string[] = [];
    for (const { rel, src } of dashboard()) {
      const lines = stripTemplates(code(src)).split('\n');
      for (let i = 0; i < lines.length; i++) {
        // A hex in a className or a style attribute. A default `value` on
        // a colour picker is the seller choosing a colour — that is data.
        const styling = /className=|\bstyle=\{/.test(lines[i]);
        if (!styling) continue;
        for (const m of lines[i].matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
          if (OTHER_BRANDS.has(m[0].toLowerCase())) continue;
          offenders.push(`${rel}:${i + 1}  ${m[0]}`);
        }
      }
    }
    expect(offenders, `لونٌ مكتوبٌ بيده:\n${offenders.slice(0, 20).join('\n')}`).toEqual([]);
  });

  it('while a seller’s own pages keep theirs untouched', () => {
    const sellers = readFileSync(
      join(process.cwd(), 'src/components/landing/blocks/PageBlocks.tsx'),
      'utf8'
    );
    const theirs = new RegExp(RAW.source, 'g').test(sellers) || /#[0-9a-fA-F]{6}/.test(sellers);
    expect(theirs, 'الترحيل امتدّ إلى صفحات البائع').toBe(true);
  });
});
