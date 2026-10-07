import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMMISSION_RATE_MAX, readCommissionRate } from './user-commission-rate';
import { readBasePrice } from './product-base-price';

/**
 * ONE COLUMN, ONE RULE — AND THE DOORS MAY NOT BRING THEIR OWN.
 *
 * `User.commissionRate` had two doors. `/api/users` validated it and wrote
 * the column's own default; `/api/moderators` validated nothing and wrote
 * `parseFloat(commissionRate) || 5.0`, a number declared in no schema, no
 * migration and no other door. `Product.basePrice` had two doors as well,
 * both writing `parseFloat(basePrice) || 0`, so a typo priced a product at
 * nothing and answered 200.
 *
 * The rules are values now, in one file each. This test checks the reading
 * BEHAVIOUR and then checks that no door has quietly grown a second rule
 * next to the shared one — a fallback re-added at a write site is how the
 * first divergence happened, and it reads as policy while bypassing it.
 */

/**
 * COMMENTS BLANKED, so a docblock NAMING the old defect is not read as the
 * defect. Both doors explain what they used to write, in the words the
 * sweep below looks for.
 */
const read = (rel: string) =>
  readFileSync(join(process.cwd(), rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const RATE_DOORS = ['src/app/api/users/route.ts', 'src/app/api/moderators/route.ts'];
const PRICE_DOORS = ['src/app/api/products/route.ts', 'src/app/api/products/[id]/route.ts'];

describe('the rate a person types is the rate that is read', () => {
  it('reads a typed zero as zero, not as nothing', () => {
    expect(readCommissionRate(0)).toBe(0);
  });

  it('reads an absent rate as the column default', () => {
    expect(readCommissionRate(undefined)).toBe(0);
  });

  it('reads the number that was typed', () => {
    expect(readCommissionRate(7.5)).toBe(7.5);
    expect(readCommissionRate(COMMISSION_RATE_MAX)).toBe(COMMISSION_RATE_MAX);
  });

  it('refuses what is not a rate rather than inventing one', () => {
    for (const bad of ['abc', '', '5', '5%', null, true, {}, NaN, Infinity, -1, COMMISSION_RATE_MAX + 1]) {
      expect(readCommissionRate(bad), `rate ${String(bad)}`).toBeNull();
    }
  });
});

describe('the price a person types is the price that is read', () => {
  it('reads a typed zero as zero — a sample has a real price', () => {
    expect(readBasePrice(0)).toBe(0);
    expect(readBasePrice('0')).toBe(0);
  });

  it('reads the number that was typed, from a number or from a form string', () => {
    expect(readBasePrice(12.5)).toBe(12.5);
    expect(readBasePrice(' 12.5 ')).toBe(12.5);
  });

  it('refuses what is not a price rather than calling it free', () => {
    // '3,5' and '12abc' are the two `parseFloat` would have turned into a
    // WRONG price (3 and 12) instead of a refusal.
    for (const bad of ['abc', '3,5', '12abc', '', '   ', null, undefined, true, {}, NaN, Infinity, -0.01]) {
      expect(readBasePrice(bad), `price ${String(bad)}`).toBeNull();
    }
  });
});

describe('no door carries a second rule for a column it shares', () => {
  it('neither rate door declares a rate of its own', () => {
    for (const door of RATE_DOORS) {
      const src = read(door);
      expect(src, `${door}: لا يستورد قاعدة النسبة المشتركة`).toContain('@/lib/user-commission-rate');
      // The 5.0 nobody declared, and the `||` that let a typed zero become it.
      expect(src, `${door}: نسبة مكتوبة في الباب`).not.toMatch(/commissionRate[^\n]*\|\|/);
      expect(src.match(/commissionRate:\s*parseFloat/), `${door}: parseFloat على النسبة`).toBeNull();
    }
  });

  it('neither price door declares a price rule of its own', () => {
    for (const door of PRICE_DOORS) {
      const src = read(door);
      expect(src, `${door}: لا يستورد قارئ السعر المشترك`).toContain('@/lib/product-base-price');
      expect(src.match(/parseFloat\(basePrice\)/), `${door}: parseFloat على السعر`).toBeNull();
      expect(src, `${door}: سعر بـfallback`).not.toMatch(/basePrice[^\n]*\|\|\s*0/);
    }
  });
});
