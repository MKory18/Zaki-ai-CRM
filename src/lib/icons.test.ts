import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ICONS } from '../components/shell/icons';

/**
 * ONE FAMILY, THREE SIZES, AND A MIRROR THAT KNOWS WHICH GLYPHS TO TURN.
 *
 * The dashboard drew 794 icons from a stroke-only family, which made the
 * one rule that matters impossible to state: a selected item could only say
 * so with colour, and colour alone is what a person misses when four items
 * are the same shape and one is slightly brighter.
 *
 * A seller's own pages keep theirs. Their design is theirs, and this
 * migration has no business in it.
 */

const SELLERS = [
  '/components/landing/', '/components/public/', '/components/store/',
  '/app/(public)/', '/app/lp/', '/app/s/',
];

function dashboard(): { rel: string; src: string }[] {
  const out: { rel: string; src: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if ((p.endsWith('.ts') || p.endsWith('.tsx')) && !p.includes('.test.')) {
        const rel = `/${relative(process.cwd(), p).split('\\').join('/')}`;
        if (!SELLERS.some((s) => rel.includes(s))) out.push({ rel, src: readFileSync(p, 'utf8') });
      }
    }
  };
  walk(join(process.cwd(), 'src'));
  return out;
}

describe('one icon family', () => {
  it('and the dashboard draws from it alone', () => {
    const strays = dashboard().filter((f) => f.src.includes("from 'lucide-react'")).map((f) => f.rel);
    expect(strays, `عائلة أيقونات ثانية في لوحة التحكم:\n${strays.join('\n')}`).toEqual([]);
  });

  it('while a seller’s own pages keep theirs untouched', () => {
    const sellers = readFileSync(join(process.cwd(), 'src/components/landing/blocks/PageBlocks.tsx'), 'utf8');
    expect(sellers, 'ترحيل لوحة التحكم امتدّ إلى صفحات البائع').toContain('lucide-react');
  });
});

describe('the size of an icon', () => {
  const ICON = /<(Ri\w+(?:Line|Fill))((?:\s[^>]*?)?)\/?>/g;
  const SIZE = /(?<![\w-])([wh])-(\d+(?:\.\d+)?)(?![\w-])/g;

  it('is 16, 20 or 24 — never 12, never 14, never 40', () => {
    const offenders: string[] = [];
    for (const { rel, src } of dashboard()) {
      for (const m of src.matchAll(ICON)) {
        const found: Record<string, number> = {};
        for (const s of m[2].matchAll(SIZE)) found[s[1]] = Number(s[2]) * 4;
        if (found.w === undefined || found.h === undefined) continue;
        if (found.w !== found.h) continue; // not a square; its own problem
        if (![16, 20, 24].includes(found.w)) offenders.push(`${rel}: ${m[1]} at ${found.w}px`);
      }
    }
    expect(offenders, `أيقونة خارج سلّم ١٦/٢٠/٢٤:\n${offenders.slice(0, 15).join('\n')}`).toEqual([]);
  });
});

/**
 * MIRRORING IS A LIST, NOT A RULE.
 *
 * An arrow, a chevron, a send and an undo point somewhere, and in a
 * right-to-left screen they point the wrong way unless turned. A magnifier,
 * a clock, a play triangle, a phone and a chart do NOT: turned, they are
 * simply wrong — a mirrored clock reads as one running backwards.
 */
describe('which glyphs turn in RTL', () => {
  const DIRECTIONAL = /^Ri(Arrow|SendPlane|LoginBox|LogoutBox|ExternalLink)/;
  const NEVER = /^Ri(Search|Timer|Play|Pause|Phone|Check|Close|PieChart|LineChart|BarChart|Camera)/;
  const TAG = /<(Ri\w+(?:Line|Fill))((?:\s[^>]*?)?)\/?>/g;

  it('the directional ones carry the class', () => {
    const missing: string[] = [];
    for (const { rel, src } of dashboard()) {
      for (const m of src.matchAll(TAG)) {
        if (!DIRECTIONAL.test(m[1])) continue;
        // Up and down do not change under a left-right mirror.
        if (/^RiArrow(Up|Down)(?!.*(Left|Right))/.test(m[1])) continue;
        if (!m[2].includes('icon-mirror')) missing.push(`${rel}: ${m[1]}`);
      }
    }
    expect(missing, `أيقونة اتجاهية بلا انعكاس:\n${missing.slice(0, 12).join('\n')}`).toEqual([]);
  });

  it('and the ones that must never turn do not', () => {
    const wrong: string[] = [];
    for (const { rel, src } of dashboard()) {
      for (const m of src.matchAll(TAG)) {
        if (NEVER.test(m[1]) && m[2].includes('icon-mirror')) wrong.push(`${rel}: ${m[1]}`);
      }
    }
    expect(wrong, `أيقونة غير اتجاهية تنعكس:\n${wrong.join('\n')}`).toEqual([]);
  });

  it('and nothing is turned twice, which is the same as not at all', () => {
    const doubled: string[] = [];
    for (const { rel, src } of dashboard()) {
      for (const [i, line] of src.split('\n').entries()) {
        if (!line.includes('icon-mirror')) continue;
        if (/rotate-180|scale-x|isRtl/.test(line)) doubled.push(`${rel}:${i + 1}`);
      }
    }
    expect(doubled, `انعكاس مزدوج يلغي نفسه:\n${doubled.join('\n')}`).toEqual([]);
  });

  it('and the flip exists in the stylesheet, by class', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/(system)/system.css'), 'utf8');
    expect(css).toMatch(/\[dir="rtl"\]\s*\.icon-mirror\s*\{[^}]*scaleX\(-1\)/);
    // And NOT a blanket rule on every svg, which would reverse the clock.
    expect(/\[dir="rtl"\]\s*svg\s*\{/.test(css), 'انعكاسٌ شامل على كل أيقونة').toBe(false);
  });
});

describe('the navigation', () => {
  it('has a line and a fill for every route icon', () => {
    for (const [name, pair] of Object.entries(ICONS)) {
      expect(pair.line, `${name}: بلا نسخة خطية`).toBeTruthy();
      expect(pair.fill, `${name}: بلا نسخة ممتلئة`).toBeTruthy();
      expect(pair.line, `${name}: الخطية والممتلئة واحدة`).not.toBe(pair.fill);
    }
  });

  it('and fills the item you are on, in both navigations', () => {
    for (const rel of ['src/components/shell/Sidebar.tsx', 'src/components/shell/MobileNav.tsx']) {
      const src = readFileSync(join(process.cwd(), rel), 'utf8');
      expect(src, `${rel}: القائمة لا تملأ العنصر الحالي`).toMatch(/iconFor\(route\.icon,\s*\w+\)/);
    }
  });

  it('and every route the registry names has an icon here', () => {
    const registry = readFileSync(join(process.cwd(), 'src/lib/route-registry.ts'), 'utf8');
    const named = new Set([...registry.matchAll(/,\s*'(\w+)',\s*(?:\[|null)/g)].map((m) => m[1]));
    const missing = [...named].filter((n) => !(n in ICONS));
    expect(missing, `مسارٌ بأيقونة غير معرّفة: ${missing.join('، ')}`).toEqual([]);
  });
});

describe('an icon-only button', () => {
  it('always says what it is', () => {
    const nameless: string[] = [];
    for (const { rel, src } of dashboard()) {
      for (const m of src.matchAll(/<button\b([\s\S]*?)<\/button>/g)) {
        const whole = m[0];
        const tag = whole.slice(0, whole.indexOf('>') + 1);
        const inner = whole.slice(whole.indexOf('>') + 1);
        const text = inner.replace(/<[^>]*>/g, '');
        if (!inner.includes('<Ri')) continue;
        if (/[\u0600-\u06FFA-Za-z0-9]/.test(text)) continue;
        if (tag.includes('aria-label') || inner.includes('sr-only')) continue;
        nameless.push(`${rel}: ${(/<(Ri\w+)/.exec(inner) ?? [])[1] ?? '?'}`);
      }
    }
    expect(nameless, `زرّ أيقونة بلا اسم:\n${nameless.join('\n')}`).toEqual([]);
  });
});
