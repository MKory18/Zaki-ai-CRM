import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * ONE ICON PER CONCEPT.
 *
 * The question is not which icon — it is whether the same word carries
 * the same picture everywhere. A person learns the picture; a second
 * picture for the same act makes them read the label every time, which
 * is the whole cost of having icons at all.
 *
 * Three were split when this was written, each a minority of one:
 *
 *   «إدخال بالذكاء الاصطناعي»  the SAME button on two screens —
 *                              RiMagicLine on the orders list,
 *                              RiSparkling2Line on the dashboard
 *   «الإعدادات»                RiEqualizer2Line in four places,
 *                              RiSettings3Line on Telegram orders
 *   «تحديث»                    RiRefreshLine in fifteen places,
 *                              RiArrowGoForwardLine on installed apps
 *
 * Each followed the majority. Nothing was redesigned; the odd one out was
 * simply brought into line.
 */

const root = process.cwd();
const ARABIC_RUN = /[\u0600-\u06FF][\u0600-\u06FF\s\u064B-\u0652]*/g;

function tsxFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.tsx') && !p.includes('.test.')) out.push(relative(root, p).split('\\').join('/'));
    }
  };
  walk(join(root, 'src', 'components'));
  return out;
}

const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('the same word carries the same icon', () => {
  /** word → icon → the files that pair them. */
  const byWord = new Map<string, Map<string, string[]>>();

  for (const file of tsxFiles()) {
    const src = code(readFileSync(join(root, file), 'utf8'));
    for (const m of src.matchAll(/<Button\b[\s\S]*?<\/Button>/g)) {
      const block = m[0];
      const icons = [...new Set([...block.matchAll(/<(Ri[A-Za-z0-9]+)/g)].map((i) => i[1]))];
      // A button with two icons is a state (spinner / idle), not a concept.
      if (icons.length !== 1) continue;

      /*
       * The word ON the button: its text nodes, not the Arabic inside a
       * `{...}` expression. Reading the longest Arabic run anywhere in
       * the element picked a string out of an onClick handler and
       * reported a «معاينة» button as a «تحديث» one — which is how this
       * sweep learned to mistrust itself.
       */
      const visible = block.replace(/\{[^{}]*\}/g, ' ').replace(/<[^>]*>/g, ' ');
      const words = [...visible.matchAll(ARABIC_RUN)]
        .map((w) => w[0].trim())
        .filter((w) => w.length > 2);

      /*
       * AN ICON-ONLY BUTTON STILL NAMES ITSELF — in `title`, which is
       * what it says to a mouse and to a screen reader. Leaving those
       * out left «تحديث» with a single visible occurrence, and a concept
       * that appears once cannot be inconsistent with anything: the
       * guard passed a mutation that changed its icon outright.
       */
      const titled = block.match(/title="([^"]*[؀-ۿ][^"]*)"/);
      if (words.length === 0 && !titled) continue;
      const word = words.length > 0 ? words.sort((a, b) => b.length - a.length)[0] : titled![1].trim();

      if (!byWord.has(word)) byWord.set(word, new Map());
      const seen = byWord.get(word)!;
      if (!seen.has(icons[0])) seen.set(icons[0], []);
      seen.get(icons[0])!.push(file);
    }
  }

  it('found buttons to compare — a sweep over nothing proves nothing', () => {
    expect(byWord.size).toBeGreaterThan(40);
  });

  it('and no word is drawn two ways', () => {
    const split: string[] = [];
    for (const [word, icons] of byWord) {
      if (icons.size < 2) continue;
      const shapes = [...icons].map(([icon, files]) => `${icon} (${files.length}× ${files[0]})`);
      split.push(`«${word}»  ${shapes.join('  ·  ')}`);
    }
    expect(split, `كلمةٌ واحدةٌ بأيقونتين:\n${split.join('\n')}`).toEqual([]);
  });
});
