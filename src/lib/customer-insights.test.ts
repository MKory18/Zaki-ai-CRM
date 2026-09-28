import { describe, expect, it } from 'vitest';
import { customerFacts } from './customer-insights';
import { repoFile, stripComments } from './guard-source';

/**
 * THE CUSTOMER BOOK, COUNTED ONCE.
 *
 * The screen showed a per-customer grade and nothing else, and on the real
 * book every one of 178 customers graded «new»: a verdict needs three
 * decided orders and almost nobody has them. So the screen carried 178
 * chips that all said «not enough» — a feature that is indistinguishable
 * from a broken one.
 *
 * These counts are what the data can actually answer, and one function
 * answers them for both readers: the strip above the list, and the
 * assistant. Two adders over the same rows is how a screen and an endpoint
 * come to tell a seller different numbers.
 */

const row = (over: Partial<Parameters<typeof customerFacts>[0][number]> = {}) => ({
  totalOrders: 0,
  deliveredOrders: 0,
  cancelledOrders: 0,
  totalPurchaseValue: 0,
  lastOrderDate: null,
  city: null,
  ...over,
});

const NOW = new Date('2026-09-28T00:00:00Z');

describe('the figures above the list', () => {
  it('counts who ordered, who repeated, who received and who refused', () => {
    const f = customerFacts(
      [
        row(),
        row({ totalOrders: 1, deliveredOrders: 1, lastOrderDate: '2026-09-20' }),
        row({ totalOrders: 3, deliveredOrders: 2, cancelledOrders: 1, lastOrderDate: '2026-09-01' }),
        row({ totalOrders: 2, cancelledOrders: 2, lastOrderDate: '2026-08-01' }),
      ],
      NOW
    );
    expect(f.total).toBe(4);
    expect(f.ordered).toBe(3);
    expect(f.repeat, 'المكرِّر هو من طلب مرّتين فأكثر').toBe(2);
    expect(f.received).toBe(2);
    expect(f.refused).toBe(2);
    // Three delivered out of six decided.
    expect(f.deliveryRate).toBe(50);
  });

  it('says nothing about a rate when nothing is decided', () => {
    expect(customerFacts([row({ totalOrders: 2 }), row()], NOW).deliveryRate).toBeNull();
  });

  /**
   * Somebody added by hand and never sold to is not «quiet», they are new.
   * Counting them as dormant would put a number on the screen that reads
   * «you are losing customers» when nobody was ever gained.
   */
  it('and counts as dormant only somebody who once ordered', () => {
    const old = '2020-01-01';
    const f = customerFacts([row({ lastOrderDate: old }), row({ totalOrders: 1, lastOrderDate: old })], NOW);
    expect(f.dormant).toBe(1);
  });

  it('counts the governorates, biggest first', () => {
    const f = customerFacts(
      [row({ city: 'حلب' }), row({ city: 'دمشق' }), row({ city: 'حلب' }), row({ city: '  ' })],
      NOW
    );
    expect(f.cities[0]).toEqual({ city: 'حلب', count: 2 });
    expect(f.cities).toHaveLength(2);
  });
});

/**
 * NO NAME, NO PHONE, NO ADDRESS REACHES THE MODEL.
 *
 * The assistant is given this object and nothing else about customers.
 * The identity of a person who bought something is not part of any
 * question worth asking a model, and it is the one thing that cannot be
 * taken back once sent.
 */
describe('what the assistant is given', () => {
  const ask = () => stripComments(repoFile('src/app/api/growth/intelligence/ask/route.ts'));

  it('is the same function the screen reads', () => {
    expect(ask()).toMatch(/customerFacts\(rows, new Date\(\)\)/);
    expect(stripComments(repoFile('src/app/api/customers/route.ts'))).toMatch(/customerFacts\(/);
  });

  it('and carries no field that identifies anybody', () => {
    const src = ask();
    const block = src.slice(src.indexOf("want.has('CUSTOMERS')"), src.indexOf('context.customers') + 200);
    for (const pii of ['fullName', 'phone', 'rawPhone', 'altPhone', 'address', 'notes']) {
      expect(block, `${pii} يُرسَل إلى النموذج`).not.toContain(pii);
    }
    // What it does select: counters and the city, which is counted not listed.
    expect(block).toContain('totalOrders');
    expect(block).toContain('deliveredOrders');
  });

  it('and the facts object itself holds no row', () => {
    const f = customerFacts([row({ totalOrders: 1, city: 'حلب' })], NOW);
    const json = JSON.stringify(f);
    expect(json).not.toContain('fullName');
    // Cities are a tally, never a person's location.
    expect(f.cities).toEqual([{ city: 'حلب', count: 1 }]);
  });
});

describe('the screen', () => {
  const screen = () => stripComments(repoFile('src/components/screens/CustomersScreen.tsx'));

  it('draws the list with the one list component', () => {
    const src = screen();
    expect(src).toMatch(/<Rows/);
    expect(src, 'ما زالت شبكةَ بطاقاتٍ خاصّةً بها').not.toMatch(/Customer Cards Grid/);
  });

  it('shows the whole book’s figures, not a count of the page', () => {
    expect(screen()).toMatch(/setFacts\(data\.facts \?\? null\)/);
  });

  it('and hides a verdict it cannot support', () => {
    expect(screen()).toMatch(/score\.grade !== 'new' &&/);
  });
});
