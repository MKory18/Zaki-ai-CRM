import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * ONE SET OF CORNERS.
 *
 * Eight different corner radii were in use across the dashboard, and the
 * reason is the ordinary one: nobody chose eight, each screen chose one.
 * The result reads as slightly broken rather than as a style — a card at
 * 12px beside a panel at 8px beside a button at 6px, on the same row, and
 * the eye notices without being able to say what is wrong.
 *
 * So there are three, and they mean something:
 *
 *   sm (4px)    something inside a cell — a chip, a tiny field
 *   md (6px)    a control you press or type into
 *   lg (8px)    a surface: a card, a panel, a dialog
 *   full        a pill or an avatar, which is not a size
 *
 * These are Tailwind's own sm/md/lg, unchanged, so naming them moved no
 * pixels at all for the 515 places that were already writing 8px or 6px by
 * hand. What moved is the 179 places that were 12px or 16px, and moving
 * them is the whole point.
 *
 * A STORE'S OWN PAGES ARE NOT IN THIS. A landing page and a storefront are
 * the seller's design, and a dashboard rule that reached them would be the
 * same mistake as a dashboard colour reaching them.
 */

const SKIP = [
  '/components/landing/',
  '/components/public/',
  '/components/store/',
  '/app/(public)/',
  '/app/lp/',
  '/app/s/',
];

function systemFiles(): { path: string; rel: string; src: string }[] {
  const out: { path: string; rel: string; src: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if ((p.endsWith('.tsx') || p.endsWith('.ts')) && !p.includes('.test.')) {
        const rel = `/${relative(process.cwd(), p).split('\\').join('/')}`;
        if (!SKIP.some((s) => rel.includes(s))) out.push({ path: p, rel, src: readFileSync(p, 'utf8') });
      }
    }
  };
  walk(join(process.cwd(), 'src', 'components'));
  walk(join(process.cwd(), 'src', 'app'));
  return out;
}

// The leading guard matters: without it this finds the "rounded" inside
// "backgrounded" and "Grounded on real data", and reports a screen for a
// corner that is a word in a sentence.
const RADIUS = /(?<![\w-])rounded(?:-[tbrlse]{1,2})?(?:-(\[[^\]]+\]|none|sm|md|lg|xl|2xl|3xl|full))?(?![\w-])/g;

/** A bare `rounded` is Tailwind's 4px, and a step nobody chose. */
const BARE = 'bare';

/** The four that mean something, plus `none`, which is a deliberate square. */
const ALLOWED = new Set(['sm', 'md', 'lg', 'full', 'none']);

describe('the corners of the dashboard', () => {
  it('are drawn from the scale, never measured in pixels by hand', () => {
    const offenders: string[] = [];
    for (const { rel, src } of systemFiles()) {
      for (const m of src.matchAll(RADIUS)) {
        if ((m[1] ?? BARE).startsWith('[')) offenders.push(`${rel}: ${m[0]}`);
      }
    }
    expect(offenders, `زاوية مقاسة باليد بدل السلّم:\n${offenders.slice(0, 20).join('\n')}`).toEqual([]);
  });

  it('and use no step outside it', () => {
    const offenders: string[] = [];
    for (const { rel, src } of systemFiles()) {
      for (const m of src.matchAll(RADIUS)) {
        if (!ALLOWED.has(m[1] ?? BARE)) offenders.push(`${rel}: ${m[0]}`);
      }
    }
    expect(offenders, `درجة خارج السلّم:\n${offenders.slice(0, 20).join('\n')}`).toEqual([]);
  });

  it('so every surface in the system has the SAME corner', () => {
    // The property the whole exercise is for, stated as a number: one
    // radius does the surfaces, and it is the common one.
    const counts = new Map<string, number>();
    for (const { src } of systemFiles()) {
      for (const m of src.matchAll(RADIUS)) {
        const step = m[1] ?? BARE;
        counts.set(step, (counts.get(step) ?? 0) + 1);
      }
    }
    const sized = [...counts.entries()].filter(([k]) => k !== 'full' && k !== 'none');
    const total = sized.reduce((s, [, n]) => s + n, 0);
    const [top, topCount] = sized.sort((a, b) => b[1] - a[1])[0];
    expect(top).toBe('lg');
    expect(topCount / total, 'الأسطح لم تعد على زاوية واحدة').toBeGreaterThan(0.9);
  });
});

/**
 * The guard on the guard: a shop's design is still the shop's.
 */
describe('a seller’s own pages', () => {
  it('were not restyled along with the dashboard', () => {
    const shop = readFileSync(join(process.cwd(), 'src/components/landing/blocks/Countdown.tsx'), 'utf8');
    // Not an assertion about a particular class — an assertion that the
    // sweep did not reach in here at all. Their corners are their own.
    expect(shop.includes('--sys-'), 'متغيّر لوحة التحكم تسرّب إلى صفحة بائع').toBe(false);
  });
});

/**
 * ONE SET OF HEIGHTS.
 *
 * Measured on the orders screen before this: an input at 34px, a button at
 * 30, a second button at 32 and a dropdown at 36 - four heights in one row.
 * Nobody chose four. The height was padding plus whatever font size the
 * size happened to carry, so it was arithmetic, and arithmetic drifts.
 *
 *   sm  32px  a control inside a row
 *   md  40px  everything else: toolbars, forms, dialogs
 *   lg  48px  the one action a screen is for
 *
 * A chip or a badge is not a control and has no stated height - it is as
 * tall as its text, which is what makes it read as a label rather than as
 * something to press.
 */
describe('the height of a control', () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

  it('is stated by the shared button, not left to arithmetic', () => {
    const src = read('src/components/ui/Button.tsx');
    expect(src).toMatch(/sm:\s*'h-8/);
    expect(src).toMatch(/md:\s*'h-10/);
    expect(src).toMatch(/lg:\s*'h-12/);
  });

  it('and by the shared field, so a field matches the button beside it', () => {
    const src = read('src/components/ui/Input.tsx');
    // The input and the select. A textarea is multi-line and is not one.
    expect((src.match(/'h-10 w-full/g) ?? []).length).toBe(2);
  });

  it('and 36px is gone - the step that fit nothing', () => {
    const offenders: string[] = [];
    for (const { rel, src } of systemFiles()) {
      for (const m of src.matchAll(/(?<![\w.-])h-9(?![\d.])/g)) {
        const at = m.index ?? 0;
        const around = src.slice(Math.max(0, at - 90), at + 90);
        // A matching width, or an image fit: a square icon button, an
        // avatar, a logo box. Their height belongs to the shape.
        if (/\bw-9\b/.test(around) || /object-(?:contain|cover)/.test(around)) continue;
        offenders.push(rel + ': ' + around.replace(/\s+/g, ' ').trim().slice(0, 70));
      }
    }
    expect(offenders, 'ارتفاع ٣٦ عاد:\n' + offenders.slice(0, 10).join('\n')).toEqual([]);
  });

  it('and a square stayed square', () => {
    // The sweep that gave every control a stated height reached the icon
    // buttons and the avatars too, and a 36x36 avatar came out 40x36.
    const offenders: string[] = [];
    for (const { rel, src } of systemFiles()) {
      for (const m of src.matchAll(/class[nN]ame=\{?[`"']([^`"']*)[`"']/g)) {
        if (/\bw-9\b/.test(m[1]) && /\bh-10\b/.test(m[1])) offenders.push(rel + ': ' + m[1].slice(0, 60));
      }
    }
    expect(offenders, 'شكل مربّع صار مستطيلاً:\n' + offenders.join('\n')).toEqual([]);
  });
});

/**
 * ONE LADDER OF TEXT SIZES, AND A FLOOR UNDER IT.
 *
 * Fourteen sizes were in use, five of them measured by hand because
 * Tailwind's ladder stops at 12px: 11, 10.5, 10, 9.5, 9. Three hundred
 * lines sat on one of the bottom four.
 *
 * Nine-pixel Arabic is not small text, it is a smudge. The script carries
 * meaning in the marks above and below the letters, and at that size they
 * merge into the line - in a warehouse, at arm's length, in bad light. So
 * `caption` at 11px is the floor, and there is nothing below it.
 */
describe('the size of text', () => {
  const SIZE = /(?<![\w-])text-(\[[0-9.]+(?:px|rem)\]|caption|xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)(?![\w-])/g;

  it('is never measured by hand', () => {
    const offenders: string[] = [];
    for (const { rel, src } of systemFiles()) {
      for (const m of src.matchAll(SIZE)) {
        if (m[1].startsWith('[')) offenders.push(`${rel}: ${m[0]}`);
      }
    }
    expect(offenders, `حجم خطّ مقاس باليد:\n${offenders.slice(0, 20).join('\n')}`).toEqual([]);
  });

  it('and never smaller than the floor', () => {
    // The guard is on the token, because the pixels live in one place now.
    const globals = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
    const m = /--text-caption:\s*([0-9.]+)rem/.exec(globals);
    expect(m, 'اختفت درجة أصغر حجم').toBeTruthy();
    expect(Number(m![1]) * 16, 'أصغر حجم نزل تحت ١١ بكسل').toBeGreaterThanOrEqual(11);
  });

  it('and the floor leaves room for Arabic to breathe', () => {
    const globals = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
    const m = /--text-caption--line-height:\s*([0-9.]+)/.exec(globals);
    expect(m, 'أصغر حجم بلا ارتفاع سطر').toBeTruthy();
    expect(Number(m![1])).toBeGreaterThanOrEqual(1.5);
  });

  it('and adding it did not reach into a seller’s pages', () => {
    // It lives in the file every page loads, which is only acceptable
    // because it ADDS a utility and overrides nothing.
    const globals = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
    const theme = /@theme\s*\{([^}]*)\}/.exec(globals);
    expect(theme, 'اختفت كتلة السلّم').toBeTruthy();
    for (const line of theme![1].split('\n')) {
      const name = /(--[\w-]+):/.exec(line);
      if (!name) continue;
      expect(
        name[1].startsWith('--text-caption'),
        `${name[1]} يعيد تعريف درجة قائمة — وهذا يصل إلى صفحات البائعين`
      ).toBe(true);
    }
  });
});
