import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { count, money, numeric } from './numeric-input';
import { stripComments } from './guard-source';

/**
 * WHAT A HOSTILE NUMBER DOES AT THE DOOR.
 *
 * `z.coerce.number()` is `Number(value)`, which is more generous than the
 * schemas using it intended. Measured against the order and inventory
 * schemas as they stood: `null` became 0, `[]` became 0, `"0x10"` became
 * 16. None reached past the bounds as a LARGER number, so nothing was
 * overcharged — but a price that should have failed validation silently
 * became free, and that is the sort of thing found weeks later in a
 * margin rather than in a stack trace.
 */

describe('a number arriving from outside', () => {
  const qty = count(999, 1);
  const price = money(100000);

  it('accepts a number, and a string written the way a number is written', () => {
    expect(qty.parse(5)).toBe(5);
    expect(qty.parse('5')).toBe(5);
    expect(qty.parse(' 5 ')).toBe(5);
    // Query strings are the reason strings are accepted at all.
    expect(price.parse('1500.75')).toBe(1500.75);
    expect(price.parse('5e-1')).toBe(0.5);
  });

  it('refuses the values that used to become a silent zero', () => {
    for (const bad of [null, undefined, [], {}, '', '   ', true, false]) {
      expect(price.safeParse(bad).success, `${JSON.stringify(bad)} صار رقماً`).toBe(false);
    }
    // The one that became sixteen.
    expect(qty.safeParse('0x10').success, 'سلسلة ست عشرية صارت كمية').toBe(false);
    expect(price.safeParse('0x10').success).toBe(false);
  });

  it('refuses what is not finite, and what is out of bounds', () => {
    for (const bad of [NaN, Infinity, -Infinity, 'NaN', 'Infinity', '1e400']) {
      expect(price.safeParse(bad).success, `${String(bad)} مرّ`).toBe(false);
    }
    expect(qty.safeParse(0).success, 'كمية صفر مرّت').toBe(false);
    expect(qty.safeParse(1000).success).toBe(false);
    expect(qty.safeParse(2.5).success, 'كسر مرّ حيث يُنتظر عدد صحيح').toBe(false);
    expect(price.safeParse(-1).success, 'سعر سالب مرّ').toBe(false);
  });

  it('and the plain numeric() keeps the same rule', () => {
    expect(numeric().safeParse('12').success).toBe(true);
    expect(numeric().safeParse(null).success).toBe(false);
  });
});

/**
 * The doors that move money or stock use it. Others may still coerce —
 * a page number read loosely costs nobody anything.
 */
describe('the doors that move money or stock', () => {
  const FILES = [
    'src/app/api/orders/route.ts',
    'src/app/api/inventory/route.ts',
    'src/app/api/production/[id]/route.ts',
    'src/lib/offers.ts',
  ];

  it('read their numbers strictly', () => {
    for (const f of FILES) {
      const src = stripComments(readFileSync(join(process.cwd(), f), 'utf8'));
      expect(src, `${f} لا يستورد القارئ الصارم`).toMatch(/from '(@\/lib|\.)\/numeric-input'/);
      expect(src, `${f} ما زال يقرأ رقماً برخاوة`).not.toMatch(/z\.coerce\.number\(\)/);
    }
  });
});
