import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { MIN_PRICE_SAMPLE, evidencedWasPrices, struckThroughPrice } from './price-honesty';

/**
 * A STRUCK-THROUGH PRICE MUST BE A PRICE SOMEBODY ACTUALLY PAID.
 *
 * Measured before this rule existed: `Offer.compareAtPrice` was typed by
 * hand and rendered as typed, and `ProductOffers.tsx` GENERATED it —
 * `basePrice × (quantity + free)` — under a comment calling that «a real
 * comparison, not an invented one». Four surfaces each hand-copied the
 * mapping, so there were four chances to get it wrong and no single place
 * to fix it.
 */

const N = MIN_PRICE_SAMPLE;

describe('what may be struck through', () => {
  const at = (over: Partial<Parameters<typeof struckThroughPrice>[0]> = {}) =>
    struckThroughPrice({ price: 100, claim: null, evidence: undefined, ...over });

  it('shows nothing when nothing proves a former price', () => {
    expect(at()).toBeNull();
    expect(at({ claim: 250 })).toBeNull();
  });

  it('shows what the orders prove, with no claim at all', () => {
    expect(at({ evidence: 140 })).toBe(140);
  });

  /** The seller's number is a ceiling, never a source. */
  it('never shows more of a saving than the orders prove', () => {
    expect(at({ claim: 900, evidence: 140 })).toBe(140);
  });

  it('honours a claim below the evidence — a shop may advertise less', () => {
    expect(at({ claim: 120, evidence: 140 })).toBe(120);
  });

  it('shows nothing that is not above what the customer pays', () => {
    expect(at({ evidence: 100 })).toBeNull();
    expect(at({ claim: 90, evidence: 140 })).toBeNull();
  });

  /**
   * THE ANCHOR. Every «shows nothing» above is worth what this line is
   * worth: a rule that returned null always would pass all of them.
   */
  it('does show a real one', () => {
    expect(at({ price: 108, claim: 130, evidence: 120 })).toBe(120);
  });
});

describe('where the evidence comes from', () => {
  const tx = (rows: { offerId: string | null; sellingPrice: number; n: number }[]) => ({
    order: {
      groupBy: vi.fn().mockResolvedValue(
        rows.map((r) => ({ offerId: r.offerId, sellingPrice: r.sellingPrice, _count: { _all: r.n } }))
      ),
    },
  });

  const offers = [{ id: 'o1', sellingPrice: 100 }];

  it('asks only about orders that reached the door', async () => {
    const t = tx([]);
    await evidencedWasPrices(t as never, offers);
    const where = t.order.groupBy.mock.calls[0][0].where;
    // An order cancelled at the door is not a sale, and a price nobody
    // handed money over for is not a former price.
    expect(where.deliveredAt).toEqual({ not: null });
    expect(where.offerId).toEqual({ in: ['o1'] });
  });

  /**
   * THE FLOOR, WRITTEN OUT.
   *
   * Every other test here counts in units of `MIN_PRICE_SAMPLE`, so lowering
   * the constant lowers the tests with it — measured: setting it to 1 broke
   * nothing at all. A number that is a decision has to be asserted as the
   * number it is, or it is not guarded, it is merely echoed.
   */
  it('is five, and five is a decision', async () => {
    expect(MIN_PRICE_SAMPLE).toBe(5);
    const four = await evidencedWasPrices(tx([{ offerId: 'o1', sellingPrice: 140, n: 4 }]) as never, offers);
    expect(four.get('o1')).toBeUndefined();
    const five = await evidencedWasPrices(tx([{ offerId: 'o1', sellingPrice: 140, n: 5 }]) as never, offers);
    expect(five.get('o1')).toBe(140);
  });

  it('refuses a price that sold fewer times than the floor', async () => {
    const got = await evidencedWasPrices(tx([{ offerId: 'o1', sellingPrice: 140, n: N - 1 }]) as never, offers);
    expect(got.get('o1')).toBeUndefined();
  });

  /** The negative control: one more sale and the same price counts. */
  it('accepts it at the floor', async () => {
    const got = await evidencedWasPrices(tx([{ offerId: 'o1', sellingPrice: 140, n: N }]) as never, offers);
    expect(got.get('o1')).toBe(140);
  });

  it('ignores prices at or below what the bundle costs now', async () => {
    const got = await evidencedWasPrices(
      tx([
        { offerId: 'o1', sellingPrice: 100, n: N * 4 },
        { offerId: 'o1', sellingPrice: 80, n: N * 4 },
      ]) as never,
      offers
    );
    expect(got.get('o1')).toBeUndefined();
  });

  /**
   * The LOWEST qualifying price, not the highest: of the prices this bundle
   * genuinely carried, the least flattering is the one we can least be
   * argued with about.
   */
  it('takes the least flattering price it can prove', async () => {
    const got = await evidencedWasPrices(
      tx([
        { offerId: 'o1', sellingPrice: 200, n: N },
        { offerId: 'o1', sellingPrice: 130, n: N },
        { offerId: 'o1', sellingPrice: 125, n: N - 1 },
      ]) as never,
      offers
    );
    expect(got.get('o1')).toBe(130);
  });

  it('asks nothing at all when there are no offers', async () => {
    const t = tx([]);
    expect((await evidencedWasPrices(t as never, [])).size).toBe(0);
    expect(t.order.groupBy).not.toHaveBeenCalled();
  });
});

describe('nobody renders a was-price on their own', () => {
  /**
   * The rule lives in two files. A fifth surface reading `compareAtPrice`
   * off an offer row and drawing it would be the defect this replaced —
   * four hand-copied mappings, each free to be a little wrong.
   *
   * The offers SCREEN and the offers API are allowed: one is where a seller
   * types the ceiling, the other is where it is stored.
   */
  /**
   * A COMPARISON, not a mention. `<s>{o.compareAtPrice…}</s>` is a render
   * and must stay allowed everywhere — the angle brackets of JSX are not an
   * opinion about whether a saving is real.
   */
  const DECIDES = /compareAtPrice\s*[<>]|[<>]=?\s*\w[\w.?]*\.compareAtPrice/;
  const ALLOWED = new Set([
    'src/lib/offers.ts',
    'src/app/api/offers/route.ts',
    'src/app/api/offers/[id]/route.ts',
    'src/components/products/ProductOffers.tsx',
  ]);

  const walk = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(join(process.cwd(), dir))) {
      const rel = `${dir}/${name}`;
      if (statSync(join(process.cwd(), rel)).isDirectory()) walk(rel, out);
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(rel);
    }
    return out;
  };

  const source = (f: string) =>
    readFileSync(join(process.cwd(), f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('only the five decide whether a was-price is a saving', () => {
    const deciding = walk('src').filter((f) => DECIDES.test(source(f)));
    expect(deciding.filter((f) => !ALLOWED.has(f))).toEqual([]);
  });

  /**
   * And the list is not stale: each file on it still names the field, so an
   * entry cannot quietly outlive the code it was written for.
   */
  it('and every file on the list still has a reason to be', () => {
    const naming = walk('src').filter((f) => source(f).includes('compareAtPrice'));
    expect([...ALLOWED].filter((f) => !naming.includes(f))).toEqual([]);
  });
});
