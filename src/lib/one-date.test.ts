import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { arDate, arDateShort, arDateTime, arStamp } from './format';

/**
 * ONE WAY TO WRITE A DATE, AND ONE PLACE THAT KNOWS IT.
 *
 * `src/lib/format.ts` already said this in prose: «the screens had drifted
 * into three of each… the orders list printed "Sep 20, 2026"». The helpers
 * were written, some screens were moved onto them, and nothing stopped the
 * rest — so a sweep of the product found ELEVEN distinct date shapes, two
 * of them English inside an Arabic, right-to-left table:
 *
 *   سجلّ التدقيق       MMM d, yyyy HH:mm:ss   «Sep 29, 2026 14:03:11»
 *   بطاقة المنتج        MMM d                  «Sep 29»
 *   تشغيلات الإنتاج     d MMM yyyy (no locale) «29 Sep 2026»
 *   الموظفون، الصلاحيات yyyy-MM-dd
 *
 * A guard, not a note, because the note was already there and did not hold.
 */

const root = process.cwd();

function screens(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.tsx') && !p.includes('.test.')) out.push(relative(root, p).split('\\').join('/'));
    }
  };
  walk(join(root, 'src', 'components'));
  walk(join(root, 'src', 'app'));
  return out;
}

/** Comments blanked: four guards in this repo have failed on their own prose. */
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/**
 * THE ONE FILE ALLOWED TO CALL `format` WITH A PATTERN.
 *
 * `ui/DateRange.tsx` is the calendar itself: it lays out a grid of day
 * numbers and writes the `yyyy-MM-dd` that goes in a query string, neither
 * of which is a date shown to a person as a date. It owns those, and it is
 * the only exception.
 */
const OWNERS = ['src/lib/format.ts', 'src/components/ui/DateRange.tsx'];

describe('every date on every screen comes from the same four helpers', () => {
  const offenders: string[] = [];
  for (const file of screens()) {
    if (OWNERS.includes(file)) continue;
    const src = code(readFileSync(join(root, file), 'utf8'));
    /*
     * `[^\n]*?` and not `[^,)]+` for the first argument.
     *
     * Every offender in this product was written `format(new Date(x), '…')`
     * — and a first argument that refuses brackets cannot see past
     * `new Date(`. The first version of this guard passed on a mutation
     * that put the English audit timestamp back, which is the whole reason
     * a guard is mutated before it is believed.
     */
    for (const m of src.matchAll(/(^|[^.\w])format\([^\n]*?,\s*['"]([^'"\n]+)['"]/g)) {
      offenders.push(`${file}  →  ${m[2]}`);
    }
  }

  it('found screens to check — a sweep over nothing proves nothing', () => {
    expect(screens().length).toBeGreaterThan(80);
  });

  it('and none of them writes its own', () => {
    expect(
      offenders,
      `شاشاتٌ ترسم التاريخَ بنفسها بدل arDate/arDateTime/arDateShort/arStamp:\n${offenders.join('\n')}`
    ).toEqual([]);
  });
});

describe('the four shapes themselves', () => {
  const when = new Date('2026-09-20T20:39:07Z');

  it('are Arabic, and differ only in how much they say', () => {
    for (const text of [arDate(when), arDateTime(when), arDateShort(when), arStamp(when)]) {
      // The month is the tell: «سبتمبر», never «Sep».
      expect(text, text).toMatch(/[\u0600-\u06FF]/);
      // And the digits stay Latin, beside Latin order numbers and phones.
      expect(text, text).not.toMatch(/[\u0660-\u0669]/);
    }
    expect(arStamp(when), 'الطابعُ بلا ثوانٍ').toMatch(/:\d{2}:\d{2}$/);
    expect(arDate(when), 'اليومُ وحدَه ومعه وقت').not.toMatch(/:/);
  });

  it('and every one of them answers «—» to nothing at all', () => {
    for (const f of [arDate, arDateTime, arDateShort, arStamp]) {
      expect(f(null)).toBe('—');
      expect(f(undefined)).toBe('—');
      // A string that is not a date is a bug upstream; printing «Invalid
      // Date» down a column is not how a person finds out about it.
      expect(f('not a date')).toBe('—');
    }
  });
});
