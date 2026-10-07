import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { count, money as amount } from '@/lib/numeric-input';
import { computeCod } from '@/lib/money';

/**
 * THE NINTH VACUOUS GUARD — DELETED, NOT SWAPPED.
 *
 * `POST /api/orders` built its COD lines and its order items with
 *
 *     unitPrice: line.quantity > 0 ? (line.unitPrice || 0) / line.quantity
 *                                  : line.unitPrice || 0
 *
 * and by that point `line.unitPrice` is ALWAYS a finite number. Both ends
 * are checked below rather than asserted: an explicit `items[]` line is
 * `unitPrice: amount(100000)` — `money()` from `numeric-input`, so
 * `min(0).max(100000)` and nothing non-numeric survives it — and the
 * single-product shorthand is `unitPrice: sellingPrice ?? 0`, where
 * `sellingPrice` is the same reader and the `??` has already absorbed «not
 * sent».
 *
 * So the only falsy value `||` could ever meet is a legitimate `0`, which
 * it replaced with `0`. It read as live policy and never ran once — the
 * shape this audit has now found nine times. Swapping it for `??` would
 * have preserved the appearance and changed nothing.
 *
 * WHAT IS ASSERTED HERE IS THE FIGURE, not the expression: a free unit is
 * still free, and a priced one is still priced, with the fallback gone.
 */

/** The line schema as the route declares it. */
const line = z.object({
  productId: z.string().min(10).max(64),
  quantity: count(999, 1),
  unitPrice: amount(100_000),
});

describe('by the time the fallback ran, there was nothing left for it to catch', () => {
  it('because the schema refuses every value that could be falsy and not zero', () => {
    for (const bad of ['', '   ', null, undefined, NaN, 'abc', [], {}, false, '3,5', -1]) {
      const r = line.safeParse({ productId: 'p'.repeat(12), quantity: 1, unitPrice: bad });
      expect(r.success, `سعر «${String(bad)}» مرّ من المخطَّط`).toBe(false);
    }
  });

  it('and the only falsy value it accepts is a real zero', () => {
    const v = line.parse({ productId: 'p'.repeat(12), quantity: 1, unitPrice: 0 });
    expect(v.unitPrice).toBe(0);
    // Which is exactly what `|| 0` replaced it with. Nothing changed, ever.
    expect(v.unitPrice || 0).toBe(v.unitPrice);
  });

  it('and the shorthand path has already resolved «not sent» before it gets here', () => {
    const shorthand = z.object({ sellingPrice: amount(100_000).optional() });
    expect(shorthand.parse({}).sellingPrice).toBeUndefined();
    // `unitPrice: sellingPrice ?? 0` — the `??` is the one that does work.
    expect(shorthand.parse({}).sellingPrice ?? 0).toBe(0);
    expect(shorthand.parse({ sellingPrice: 0 }).sellingPrice ?? 0).toBe(0);
  });
});

describe('and the figures the order carries are unchanged by the deletion', () => {
  const minorUnit = 2;

  it('a free unit is still free: a zero line total stays zero', () => {
    const v = line.parse({ productId: 'p'.repeat(12), quantity: 2, unitPrice: 0 });
    const cod = computeCod({
      lines: [{ quantity: v.quantity, unitPrice: v.quantity > 0 ? v.unitPrice / v.quantity : v.unitPrice }],
      discount: 0,
      deliveryFee: 1.5,
      priceIncludesDelivery: false,
      minorUnit,
    });
    expect(cod.subtotal).toBe(0);
    expect(cod.cod).toBe(1.5); // the fee alone, which is what a gift costs
  });

  it('and a priced line is still priced — the legacy «line total» reading is intact', () => {
    // `unitPrice` arrives as the TOTAL for the line's quantity, which is
    // what every caller sends; 3 units at a line total of 50.
    const v = line.parse({ productId: 'p'.repeat(12), quantity: 3, unitPrice: 50 });
    const per = v.quantity > 0 ? v.unitPrice / v.quantity : v.unitPrice;
    expect(per).toBeCloseTo(16.666666, 5);
    const cod = computeCod({
      lines: [{ quantity: v.quantity, unitPrice: per }],
      discount: 0,
      deliveryFee: 0,
      priceIncludesDelivery: false,
      minorUnit,
    });
    expect(cod.subtotal).toBe(50);
    expect(cod.cod).toBe(50);
  });
});

describe('and the route no longer carries the fallback', () => {
  const src = readFileSync(join(process.cwd(), 'src/app/api/orders/route.ts'), 'utf8')
    // Its own docblock quotes the deleted line, and a guard that reads its
    // own prose is the failure this repository has hit four times.
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  it('in either of the two places it was written', () => {
    expect(src).not.toMatch(/line\.unitPrice \|\| 0/);
    // And it was not swapped for the other operator, which would read the
    // same and run just as never.
    expect(src).not.toMatch(/line\.unitPrice \?\? 0/);
  });

  it('and reads the price plainly in both', () => {
    const hits = src.match(/line\.quantity > 0 \? line\.unitPrice \/ line\.quantity : line\.unitPrice/g);
    expect(hits).toHaveLength(2);
  });

  it('and the schema that makes that safe is still the strict one', () => {
    expect(src).toMatch(/unitPrice: amount\(100000\)/);
    expect(src).toMatch(/money as amount/);
    expect(src).toMatch(/unitPrice: sellingPrice \?\? 0/);
  });
});
