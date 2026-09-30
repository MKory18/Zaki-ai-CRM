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

/**
 * AND A FILTER IS NOT NAMED BY WHAT IT HAPPENS TO BE SET TO.
 *
 * Measured on the running orders list: four `<Select>`s side by side, and
 * the accessibility tree gave every one of them the name «كل الحالات»,
 * «كل الجهات», «كل المحافظات», «كل شركات الشحن» — their own first option,
 * which is the browser's fallback when a select has no label. Change the
 * state filter and its name becomes «مشحون»: a control whose name is its
 * value has no name.
 *
 * `ui/Input`'s `Select` was built with a `label` prop that renders a real
 * `<label htmlFor>`; these call sites passed neither it nor `aria-label`.
 * The compact filter rows have no room for a visible label, so the fix is
 * `aria-label` — the name without the layout.
 */
describe('every filter in the orders group names itself', () => {
  const unnamed: string[] = [];
  let checked = 0;

  for (const file of files()) {
    /*
     * `=>` ENDS AN ARROW FUNCTION, NOT A TAG.
     *
     * The first version matched `<Select …>` with `[^>]*?`, which stops at
     * the first `>` — and every one of these carries
     * `onChange={(e) => …}`. So it read four characters of the tag, never
     * saw the `aria-label` that had just been added, and reported the
     * controls it was written to verify as still broken. The same trap
     * `rows-open-by-keyboard` records; the same answer: mask the arrows.
     */
    const src = readFileSync(join(ROOT, file), 'utf8').split('=>').join('\u0000\u0000');

    /*
     * ONLY THE SHARED COMPONENT, whose contract is explicit: `ui/Input`'s
     * `Select` renders a `<label htmlFor>` when told and nothing when not,
     * so a call site with neither `label` nor `aria-label` provably has no
     * name. A raw `<select>` may be WRAPPED in a `<label>`, and whether the
     * browser then associates the two is a question for the browser — the
     * live read is where those are judged, not here.
     */
    for (const m of src.matchAll(/<Select(\s[^>]*?)?>/g)) {
      const attrs = m[1] ?? '';
      checked++;
      if (/aria-label=|aria-labelledby=|\blabel=/.test(attrs)) continue;
      unnamed.push(`${file}: ${m[0].replace(/\s+/g, ' ').slice(0, 90)}`);
    }
  }

  it('found selects to check — a sweep over nothing proves nothing', () => {
    expect(checked).toBeGreaterThan(3);
  });

  it('and none is left to be named by its current value', () => {
    expect(
      unnamed,
      `قوائمُ اختيارٍ بلا اسمٍ — يُسمّيها المتصفّحُ بقيمتها:\n${unnamed.join('\n')}`
    ).toEqual([]);
  });
});
