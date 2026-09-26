import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatMoney, moneyText } from './money';

/**
 * Source without its comments.
 *
 * These guards assert that the CODE says something, and the note
 * explaining why it says it contains the same words. Three times this
 * session a guard has passed on its own documentation.
 */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * A FIGURE A PERSON READS, AND A FIGURE A MACHINE READS.
 *
 * They are not the same string, and the whole point of having two functions
 * is that neither drifts into the other's job. A separator on a waybill's
 * CSV column is a broken column; a missing one on a payout screen is
 * «1500000» and «150000» looking identical to somebody about to approve
 * one of them.
 */

describe('the figure a person reads', () => {
  it('separates thousands, so the shape of a number is its size', () => {
    expect(moneyText(1500000, 'SYP', 2)).toBe('1,500,000.00 SYP');
    expect(moneyText(150000, 'SYP', 2)).toBe('150,000.00 SYP');
    expect(moneyText(999, 'SYP', 2)).toBe('999.00 SYP');
    expect(moneyText(1000, 'SYP', 2)).toBe('1,000.00 SYP');
  });

  it('keeps the currency’s own decimals, never a global two', () => {
    // JOD has three. A dinar printed to two places is a tenth of a dinar
    // lost every time somebody reads it back.
    expect(moneyText(37.5, 'JOD', 3)).toBe('37.500 JOD');
    expect(moneyText(37.5, 'USD', 2)).toBe('37.50 USD');
    expect(moneyText(37, 'XYZ', 0)).toBe('37 XYZ');
  });

  it('puts the code after the number, always', () => {
    expect(moneyText(25, 'USD', 2).endsWith('USD')).toBe(true);
  });

  it('and prints nothing it was not given', () => {
    // A missing currency is a loading state, not a licence to assume
    // dollars on a screen where the store might be Syrian.
    expect(moneyText(25, null, 2)).toBe('25.00');
    expect(moneyText(25, undefined, 2)).toBe('25.00');
  });

  it('survives a number that is not one', () => {
    expect(moneyText(Number.NaN, 'USD', 2)).toBe('0.00 USD');
    expect(moneyText(Number.POSITIVE_INFINITY, 'USD', 2)).toBe('0.00 USD');
  });

  it('and a negative amount keeps its sign in front of the digits', () => {
    expect(moneyText(-1200, 'USD', 2)).toBe('-1,200.00 USD');
    expect(moneyText(-999.5, 'USD', 2)).toBe('-999.50 USD');
  });

  /**
   * WESTERN DIGITS, GUARANTEED BY CONSTRUCTION.
   *
   * `ar-EG` renders Arabic-Indic digits and bare `ar` is ICU-dependent, so
   * a figure formatted through a locale can change numeral system between
   * two screens — or between two machines. The grouping here is done by
   * hand precisely so no locale is ever consulted.
   */
  it('cannot produce Arabic-Indic digits, because it asks no locale', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/money.ts'), 'utf8');
    const body = src.slice(src.indexOf('export function moneyText'));
    expect(/toLocaleString|Intl\.NumberFormat/.test(body), 'التنسيق يمرّ بلغةٍ قد تقلب الأرقام').toBe(false);
    expect(/[٠-٩۰-۹]/.test(moneyText(1234567.89, 'USD', 2))).toBe(false);
  });
});

describe('the figure a machine reads', () => {
  it('has no separator in it, whatever the amount', () => {
    // It fills a CSV column a courier imports. A comma there is a broken
    // column, and in an amount field it is a number that fails to parse.
    expect(formatMoney(1500000, 'SYP', 2)).toBe('1500000.00 SYP');
    expect(formatMoney(1500000, 'SYP', 2)).not.toContain(',');
  });

  it('and the waybill still uses that one', () => {
    for (const rel of ['src/lib/waybill.ts', 'src/app/api/ops/labels/print/route.ts']) {
      const src = code(readFileSync(join(process.cwd(), rel), 'utf8'));
      expect(src, `${rel}: بوليصة تطبع فاصلة آلاف`).toContain('formatMoney');
      expect(src, `${rel}: تنسيق العين تسرّب إلى بوليصة`).not.toContain('moneyText');
    }
  });
});

describe('the component that draws it', () => {
  it('pins the direction, so the code cannot move to the front', () => {
    const src = code(readFileSync(join(process.cwd(), 'src/components/ui/Money.tsx'), 'utf8'));
    expect(src, 'الرمز قد ينقلب إلى صدر الرقم في فقرة عربية').toContain('dir="ltr"');
  });

  it('and gives every digit the same width, so a column lines up', () => {
    const src = code(readFileSync(join(process.cwd(), 'src/components/ui/Money.tsx'), 'utf8'));
    expect(src).toContain('tabular-nums');
  });

  it('and takes its colours from the theme', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/ui/Money.tsx'), 'utf8');
    expect(src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(src.match(/(?:bg|text)-(?:red|green|amber|emerald|rose|slate)-\d{2,3}/g) ?? []).toEqual([]);
  });
});
