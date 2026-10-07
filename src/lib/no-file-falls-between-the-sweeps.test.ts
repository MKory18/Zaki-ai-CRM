import { describe, expect, it } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { THEME_EXEMPT, dashboardFiles, shopperFiles, themeExempt } from './guard-source';

/**
 * TWO SWEEPS THAT CLAIMED TO BE COMPLEMENTS, AND WERE NOT.
 *
 * Almost every rule in this repository is written against `dashboardFiles`
 * or `shopperFiles`, and the comment above the second one promises in
 * writing: «the exact complement of `dashboardFiles`, built from the same
 * list so the two can never drift apart and leave a file governed by
 * neither».
 *
 * They had drifted. `EDITOR_ONLY` was carved OUT of the shopper's half —
 * correctly, the page editor is the dashboard's — and never added back to
 * the dashboard's, so `BlockBuilder.tsx` and `SelectionBar.tsx` fell
 * between the two and **no guard in this repository could see them**.
 * BlockBuilder is the largest editor in the product.
 *
 * WHAT WAS FOUND THE MOMENT THEY BECAME VISIBLE: three destructive icon
 * buttons a screen reader announces as «button», six controls under 44px
 * with no desk twin, and an icon imported and never drawn. All fixed. What
 * remains is a restyle — 100 hand-written hexes and 43 type sizes — and it
 * is named in `THEME_EXEMPT` rather than left as a hole.
 *
 * THE TEST THAT MATTERS IS THE WALK. Naming the two files would be the
 * same kind of list that created the gap. This counts every `.tsx` and
 * `.ts` under `src` and requires each one to be in a sweep, so the next
 * carve-out fails here on the day it is written.
 */

const allFiles = (): string[] => {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(p) && !p.includes('.test.')) {
        out.push(`/${relative(process.cwd(), p).split('\\').join('/')}`);
      }
    }
  };
  walk(join(process.cwd(), 'src'));
  return out;
};

describe('every file this repository draws from is governed by something', () => {
  it('and the walk is a walk, not a handful', () => {
    expect(allFiles().length).toBeGreaterThan(400);
  });

  it('leaves no file in neither sweep', () => {
    const swept = new Set([...dashboardFiles('both'), ...shopperFiles('both')].map((f) => f.rel));
    const orphans = allFiles().filter((f) => !swept.has(f));
    expect(
      orphans,
      `ملفٌّ لا يراه أيُّ حارس — سقط بين المسحين:\n${orphans.join('\n')}`
    ).toEqual([]);
  });

  it('and no file in BOTH, because a rule would then be applied twice', () => {
    const dash = new Set(dashboardFiles('both').map((f) => f.rel));
    const shop = shopperFiles('both').map((f) => f.rel);
    const double = shop.filter((f) => dash.has(f));
    expect(double, `ملفٌّ في المسحين معاً:\n${double.join('\n')}`).toEqual([]);
  });
});

describe('the look rules the page editor is excused from', () => {
  it('is a named list of two, not a growing one', () => {
    /*
     * An exemption that can be extended quietly is a hole with a comment on
     * it. Adding a third file has to be a deliberate change to this number
     * and to the reason written in `guard-source.ts`.
     */
    expect(THEME_EXEMPT).toHaveLength(2);
    expect(THEME_EXEMPT.join('|')).toContain('BlockBuilder.tsx');
    expect(THEME_EXEMPT.join('|')).toContain('SelectionBar.tsx');
  });

  it('and they are IN the dashboard sweep — excused from the look, not from the rules', () => {
    const dash = dashboardFiles('both').map((f) => f.rel);
    for (const name of ['BlockBuilder.tsx', 'SelectionBar.tsx']) {
      expect(
        dash.some((f) => f.includes(name)),
        `${name}: خارج المسح من جديد — الثغرة عادت`
      ).toBe(true);
    }
  });

  it('and the excuse reaches exactly those files and nothing else', () => {
    expect(themeExempt('/src/components/landing/blocks/BlockBuilder.tsx')).toBe(true);
    expect(themeExempt('/src/components/landing/blocks/SelectionBar.tsx')).toBe(true);
    // The neighbours in the same folder are not excused.
    expect(themeExempt('/src/components/landing/blocks/PageBlocks.tsx')).toBe(false);
    expect(themeExempt('/src/components/screens/OrdersScreen.tsx')).toBe(false);
  });

  it('is used by the three look rules and by nothing else', () => {
    /*
     * The exemption must not spread. If a fourth guard starts skipping
     * these files, that is a rule quietly switched off — so the users are
     * counted, and the count is the thing that has to change on purpose.
     */
    const users = ['src/lib/one-palette.test.ts', 'src/lib/quality-gates.test.ts', 'src/lib/icons.test.ts'];
    const { execSync } = require('node:child_process') as typeof import('node:child_process');
    const found = execSync('git grep -l "themeExempt" -- src', { encoding: 'utf8' })
      .trim()
      .split(/\r?\n/)
      .map((f) => f.replace(/\\/g, '/'))
      .filter((f) => !f.endsWith('guard-source.ts') && !f.includes('no-file-falls-between'));
    expect(found.sort(), 'حارسٌ رابع بدأ يستثني المحرِّر').toEqual(users.sort());
  });
});
