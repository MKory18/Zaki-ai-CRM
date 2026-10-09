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

describe('the page editor, which no longer needs excusing', () => {
  /**
   * THIS SECTION HELD AN EXEMPTION. The editor stood on its own slate
   * palette — 141 hand-written hexes and 43 type sizes off the scale — and
   * two files were held off the LOOK rules while that was true, named here
   * so the hole could not grow.
   *
   * The owner asked for the conversion and it was done, so the list is
   * empty. What replaced the exemption is better than an empty list: the
   * files MOVED. They sat in `/components/landing/`, the shopper's tree,
   * because they edit landing blocks — and that path was the root of every
   * special case about them. It made them invisible to both sweeps, and it
   * made the theme tokens they now carry a violation of
   * `theme-isolation`'s rule that «the system's look never reaches a shop».
   *
   * In `/components/landing-editor/` the path tells the truth, so
   * `dashboardFiles` finds them with no help and `shopperFiles` passes
   * them by. The hole, the exemption and the special case all go together.
   */
  it('keeps no exemption at all', () => {
    expect(THEME_EXEMPT).toEqual([]);
    expect(themeExempt('/src/components/landing-editor/BlockBuilder.tsx')).toBe(false);
  });

  it('and is in the dashboard sweep by its PATH, not by a carve-out', () => {
    const dash = dashboardFiles('both').map((f) => f.rel);
    for (const name of ['landing-editor/BlockBuilder.tsx', 'landing-editor/SelectionBar.tsx']) {
      expect(dash.some((f) => f.includes(name)), `${name}: خارج مسح لوحة التحكم`).toBe(true);
    }
    // And the shopper's sweep does not also claim them — Ⅰ above forbids
    // a file being in both, but naming these two says WHICH side they are.
    const shop = shopperFiles('both').map((f) => f.rel);
    for (const name of ['landing-editor/BlockBuilder.tsx', 'landing-editor/SelectionBar.tsx']) {
      expect(shop.some((f) => f.includes(name)), `${name}: محسوب على المتسوّق`).toBe(false);
    }
  });

  it('and nothing is left under the old path', () => {
    // A move that leaves a copy behind is two editors, one of them stale.
    const all = dashboardFiles('both').concat(shopperFiles('both')).map((f) => f.rel);
    expect(all.filter((f) => f.includes('landing/blocks/BlockBuilder'))).toEqual([]);
    expect(all.filter((f) => f.includes('landing/blocks/SelectionBar'))).toEqual([]);
  });

  it('and no guard is still skipping a file by name', () => {
    /*
     * `themeExempt` survives as a function so the mechanism is there if a
     * future look rule genuinely needs one — but nothing may be using it
     * while the list is empty, because a call that can never fire reads as
     * live policy.
     */
    const { execSync } = require('node:child_process') as typeof import('node:child_process');
    const found = execSync('git grep -l "themeExempt" -- src', { encoding: 'utf8' })
      .trim()
      .split(/\r?\n/)
      .map((f) => f.replace(/\\/g, '/'))
      .filter((f) => !f.endsWith('guard-source.ts') && !f.includes('no-file-falls-between'));
    // The three look rules may still CALL it; with an empty list the call
    // is a no-op, and that is the state this test records.
    expect(found.length, 'حُرّاسٌ يَستعملون استثناءً فارغاً').toBeLessThanOrEqual(3);
  });
});
