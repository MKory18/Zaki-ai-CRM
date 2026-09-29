import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * THE CATALOGUE IS FETCHED IN ONE PLACE.
 *
 * `useProducts` exists because, in its own words, «seven screens each
 * wrote this fetch by hand, through three different clients, and two of
 * them asked for `?limit=200` — which the route caps at 100». The hook was
 * written and some callers were moved onto it. Six were not, and three of
 * those were the order dialogs.
 *
 * Two things go wrong when a screen fetches it itself:
 *
 *   A BARE `fetch` DOES NOT REDIRECT ON AN EXPIRED SESSION. `apiJson` and
 *   `apiFetch` send the person to sign in; `fetch` returns 401, the
 *   `.catch` sets an empty list, and the picker says «لا نتائج» about a
 *   catalogue the person simply is no longer logged in to see.
 *
 *   AND A SECOND COPY DRIFTS. A limit, a filter, a shape — the two lists
 *   answer the same question differently, on two screens, in one session.
 *
 * The screens that MANAGE products are exempt: they read and write the
 * whole record, which is not what the picker's catalogue is.
 */

const root = process.cwd();

/**
 * The catalogue's own screens. `ProductsScreen` is the catalogue editor —
 * it POSTs and PATCHes the same rows it lists — and `ManufacturingScreen`
 * and `LandingPagesScreen` are named here as KNOWN and not yet moved, so
 * the number can only go down.
 */
const NOT_YET_MOVED = [
  'src/components/screens/ProductsScreen.tsx',
  'src/components/screens/ManufacturingScreen.tsx',
  'src/components/screens/LandingPagesScreen.tsx',
];

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

describe('nothing fetches the product catalogue behind the hook', () => {
  const offenders: string[] = [];
  for (const file of tsxFiles()) {
    if (NOT_YET_MOVED.includes(file)) continue;
    const src = code(readFileSync(join(root, file), 'utf8'));
    if (/['"`]\/api\/products['"`]/.test(src)) offenders.push(file);
  }

  it('found screens to check — a sweep over nothing proves nothing', () => {
    expect(tsxFiles().length).toBeGreaterThan(80);
  });

  it('and every consumer goes through useProducts', () => {
    expect(
      offenders,
      `تجلب الكتالوجَ بنفسها بدل useProducts:\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  /**
   * The exemption list is a debt, not a licence: it is written down so it
   * can be paid off, and this fails if a name on it stops needing to be.
   */
  it('and the list of the not-yet-moved is honest', () => {
    for (const file of NOT_YET_MOVED) {
      const src = code(readFileSync(join(root, file), 'utf8'));
      expect(src, `${file}: لم تعد تجلب الكتالوج — احذفها من قائمة الاستثناء`).toMatch(
        /['"`]\/api\/products['"`]/
      );
    }
  });
});
