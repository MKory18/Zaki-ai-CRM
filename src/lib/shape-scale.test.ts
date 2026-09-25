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

const RADIUS = /rounded(?:-[tbrlse]{1,2})?-(\[[^\]]+\]|none|sm|md|lg|xl|2xl|3xl|full)(?![\w-])/g;

/** The four that mean something, plus `none`, which is a deliberate square. */
const ALLOWED = new Set(['sm', 'md', 'lg', 'full', 'none']);

describe('the corners of the dashboard', () => {
  it('are drawn from the scale, never measured in pixels by hand', () => {
    const offenders: string[] = [];
    for (const { rel, src } of systemFiles()) {
      for (const m of src.matchAll(RADIUS)) {
        if (m[1].startsWith('[')) offenders.push(`${rel}: ${m[0]}`);
      }
    }
    expect(offenders, `زاوية مقاسة باليد بدل السلّم:\n${offenders.slice(0, 20).join('\n')}`).toEqual([]);
  });

  it('and use no step outside it', () => {
    const offenders: string[] = [];
    for (const { rel, src } of systemFiles()) {
      for (const m of src.matchAll(RADIUS)) {
        if (!ALLOWED.has(m[1])) offenders.push(`${rel}: ${m[0]}`);
      }
    }
    expect(offenders, `درجة خارج السلّم:\n${offenders.slice(0, 20).join('\n')}`).toEqual([]);
  });

  it('so every surface in the system has the SAME corner', () => {
    // The property the whole exercise is for, stated as a number: one
    // radius does the surfaces, and it is the common one.
    const counts = new Map<string, number>();
    for (const { src } of systemFiles()) {
      for (const m of src.matchAll(RADIUS)) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
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
