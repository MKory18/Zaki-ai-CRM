import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * A BUTTON WHOSE WHOLE CONTENT IS AN ARROW HAS NO NAME.
 *
 * Read off the running screen, not the source: on `/orders` every
 * interactive element in the page body announces itself — the printer says
 * «اطبع بوليصة 1234», the refresh says «تحديث», the late filter says
 * «شُحنت منذ 10 أيام أو أكثر…» — except two. The pagination arrows came
 * back as `button` and nothing else, to the accessibility tree and to this
 * audit alike.
 *
 * So the screen already had the standard; two controls were outside it.
 * That is the shape this product keeps finding: an owner was written, most
 * places were moved onto it, and nothing stopped the rest.
 *
 * SCOPED TO THE ORDERS GROUP, deliberately. This is Pass 1's group, and a
 * product-wide sweep of every icon button belongs to the consistency pass
 * with the rest of the interaction rules. Widening the two globs below is
 * how that pass starts.
 */

const ROOT = process.cwd();

const SCOPE = [
  'src/components/orders',
  'src/components/screens/OrdersScreen.tsx',
];

function files(): string[] {
  const out: string[] = [];
  const walk = (abs: string) => {
    if (statSync(abs).isDirectory()) {
      for (const name of readdirSync(abs)) walk(join(abs, name));
      return;
    }
    if (/\.tsx$/.test(abs)) out.push(relative(ROOT, abs).split('\\').join('/'));
  };
  for (const entry of SCOPE) walk(join(ROOT, entry));
  return out;
}

/**
 * Every `<button …>…</button>` and `<Button …>…</Button>`, with its opening
 * tag and its children — enough to ask «is there a word in here».
 */
function buttons(src: string): { open: string; body: string }[] {
  const out: { open: string; body: string }[] = [];
  for (const tag of ['button', 'Button']) {
    const re = new RegExp(`<${tag}(\\s[^>]*?)?>([\\s\\S]*?)</${tag}>`, 'g');
    for (const m of src.matchAll(re)) out.push({ open: m[1] ?? '', body: m[2] });
  }
  return out;
}

/**
 * Any Arabic word the button renders, or an expression that renders one.
 *
 * The narrow first version read `{label}` only and flagged
 * `{ar ? a.labelAr : a.labelEn}` \u2014 a button that does say what it does \u2014
 * so it matches the whole interpolation when a label is named inside it.
 */
const WORDS = /[\u0600-\u06FF]{2,}|\{t\.\w+|\{[^}]*[Ll]abel[^}]*\}|\{children\}/;

describe('every icon-only control in the orders group says what it does', () => {
  const nameless: string[] = [];
  let checked = 0;

  for (const file of files()) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    for (const { open, body } of buttons(src)) {
      // Comments inside the body are prose about the control, not its label.
      const visible = body
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
        .replace(/\/\*[\s\S]*?\*\//g, ' ');
      const hasIcon = /<Ri[A-Za-z0-9]+\b/.test(visible) || /<[A-Z]\w*Icon\b/.test(visible);
      if (!hasIcon) continue;
      checked++;
      if (WORDS.test(visible)) continue;
      if (/aria-label=|title=/.test(open)) continue;
      nameless.push(`${file}: ${open.replace(/\s+/g, ' ').trim().slice(0, 90)}`);
    }
  }

  it('found icon buttons to check — a sweep over nothing proves nothing', () => {
    expect(checked).toBeGreaterThan(10);
  });

  it('and none of them is announced as «button» and nothing more', () => {
    expect(
      nameless,
      `أزرارٌ أيقونةٌ بلا اسمٍ يُنطَق:\n${nameless.join('\n')}`
    ).toEqual([]);
  });
});
