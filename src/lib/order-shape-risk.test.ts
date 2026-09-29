import { describe, expect, it } from 'vitest';
import {
  differs,
  driversFor,
  leversFor,
  separation,
  shapeRisk,
  MIN_LEVER_SHIPMENTS,
  MIN_SEGMENT_SHIPMENTS,
  MIN_SHOP_SHIPMENTS,
  MIN_Z,
  type SegmentOutcome,
  type ShapeInput,
} from './order-shape-risk';

/**
 * THE FIXTURES ARE REAL. Every count below is measured from the courier's
 * own statements for صحة بلس — 4543 shipments across 28 statements booked
 * 23/08/2026 → 26/09/2026, of which 1353 came back. So this guard does not
 * test the rule against numbers invented to make it pass: it tests it
 * against the operation it was written for, and a change that would have
 * given the owner different advice on his real orders fails here.
 */

const SHOP: SegmentOutcome = { shipments: 4543, returned: 1353 };

const UNITS_1: SegmentOutcome = { shipments: 3488, returned: 1153 };
const UNITS_2: SegmentOutcome = { shipments: 193, returned: 49 };
const UNITS_3: SegmentOutcome = { shipments: 850, returned: 151 };

const CASH: SegmentOutcome = { shipments: 4338, returned: 1353 };
const SHAM_CASH: SegmentOutcome = { shipments: 195, returned: 0 };

const SCARS: SegmentOutcome = { shipments: 1529, returned: 597 };
const TRUFFLE: SegmentOutcome = { shipments: 1784, returned: 411 };

const HOMS: SegmentOutcome = { shipments: 359, returned: 121 };
const TARTOUS: SegmentOutcome = { shipments: 187, returned: 35 };
const QUNEITRA: SegmentOutcome = { shipments: 14, returned: 8 };

describe('the shop as the statements actually record it', () => {
  it('returns 29.8% of what it ships', () => {
    expect(SHOP.returned / SHOP.shipments).toBeCloseTo(0.2978, 3);
  });

  /**
   * THE CLAIM THE WHOLE LIB RESTS ON: the units effect is not the product
   * mix in disguise. Inside ONE product, three units come back far less
   * often than one.
   */
  it('and three units come back less than one INSIDE a single product', () => {
    const scars1: SegmentOutcome = { shipments: 1365, returned: 557 };
    const scars3: SegmentOutcome = { shipments: 50, returned: 11 };
    expect(scars1.returned / scars1.shipments).toBeCloseTo(0.408, 2);
    expect(scars3.returned / scars3.shipments).toBeCloseTo(0.22, 2);
    const truffle1: SegmentOutcome = { shipments: 999, returned: 277 };
    const truffle3: SegmentOutcome = { shipments: 757, returned: 130 };
    expect(truffle1.returned / truffle1.shipments).toBeCloseTo(0.277, 2);
    expect(truffle3.returned / truffle3.shipments).toBeCloseTo(0.172, 2);
    // And both hold at the bar this rule speaks at.
    expect(differs(scars1, scars3)).toBe(true);
    expect(differs(truffle1, truffle3)).toBe(true);
  });
});

describe('separation — the one formula that decides whether a claim is made', () => {
  it('finds no difference between a segment and itself', () => {
    expect(separation(UNITS_1, UNITS_1)).toBeCloseTo(0, 6);
    expect(differs(UNITS_1, UNITS_1)).toBe(false);
  });

  it('is silent rather than certain when a side is empty', () => {
    // Not «no difference» — nothing to compare. A zero here would read as
    // «identical» and let a claim through on no evidence at all.
    expect(separation({ shipments: 0, returned: 0 }, SHOP)).toBeNull();
    expect(differs({ shipments: 0, returned: 0 }, SHOP)).toBe(false);
  });

  /**
   * AND «NOTHING CAME BACK ON EITHER SIDE» IS ALSO NOTHING TO COMPARE.
   *
   * Two segments that both returned zero make the pooled rate zero and the
   * standard error zero with it. Answering 0 there would read as «measured,
   * and identical»; the truth is that no return has been observed in either,
   * which is a different sentence. `differs` agrees with both answers, so
   * only a direct test holds the contract — and a caller reading this
   * function itself is the one who would be misled.
   */
  it('is silent when neither side has ever had a return', () => {
    expect(separation({ shipments: 195, returned: 0 }, { shipments: 300, returned: 0 })).toBeNull();
    expect(separation({ shipments: 50, returned: 50 }, { shipments: 60, returned: 60 })).toBeNull();
  });

  it('separates none-of-195 from a third of the shop, overwhelmingly', () => {
    const rest: SegmentOutcome = { shipments: 4348, returned: 1353 };
    const z = separation(SHAM_CASH, rest);
    expect(z).not.toBeNull();
    expect(z as number).toBeLessThan(-8);
  });

  /**
   * AND IT REFUSES THE GOVERNORATE THAT MERELY LOOKS WORSE.
   *
   * حمص returns 33.7% against a shop rate of 29.8% and sits third on the
   * report's own table — and at 359 shipments that gap is under two
   * standard errors. Acting on it would send an agent to ask a customer in
   * حمص for prepayment on the strength of a bad fortnight.
   */
  it('refuses a governorate whose gap is noise at its sample size', () => {
    const rest: SegmentOutcome = { shipments: SHOP.shipments - HOMS.shipments, returned: SHOP.returned - HOMS.returned };
    const z = separation(HOMS, rest);
    expect(z).not.toBeNull();
    expect(Math.abs(z as number)).toBeLessThan(MIN_Z);
    expect(differs(HOMS, rest)).toBe(false);
  });
});

const shapeOf = (over: ShapeInput = {}): ShapeInput => ({
  product: { label: 'كريم إزالة الندبات', outcome: SCARS },
  units: {
    label: 'قطعة واحدة',
    outcome: UNITS_1,
    alternatives: [
      { label: '3 قطع', outcome: UNITS_3 },
      { label: 'قطعتان', outcome: UNITS_2 },
    ],
  },
  region: { label: 'حمص', outcome: HOMS },
  payment: {
    label: 'كاش',
    outcome: CASH,
    alternatives: [{ label: 'شام كاش', outcome: SHAM_CASH }],
  },
  ...over,
});

describe('drivers — what about this order comes back more often', () => {
  it('names the product and the single unit, and leaves حمص out of it', () => {
    const drivers = driversFor(shapeOf(), SHOP);
    const dims = drivers.map((d) => d.dimension);
    expect(dims).toContain('product');
    expect(dims).toContain('units');
    expect(dims, 'محافظة فرقُها ضجيج صارت سبباً').not.toContain('region');
  });

  it('measures each one against the REST of the shop, not against the whole', () => {
    // Cash is 4338 of 4543 shipments. Against the whole it is a point and a
    // half; against the 205 shipments that are not cash it is everything.
    const [cash] = driversFor({ payment: shapeOf().payment }, SHOP);
    expect(cash.dimension).toBe('payment');
    expect(cash.points).toBeGreaterThan(25);
  });

  it('reports a dimension that is BETTER than the rest, with negative points', () => {
    const [d] = driversFor({ region: { label: 'طرطوس', outcome: TARTOUS } }, SHOP);
    expect(d.points).toBeLessThan(0);
    expect(d.why).toContain('أقلّ');
  });

  it('refuses a governorate of 14 shipments however bad it looks', () => {
    // القنيطرة returns 8 of 14 — 57%, the worst rate in the report, and a
    // sample that cannot carry a sentence said to a customer.
    expect(QUNEITRA.shipments).toBeLessThan(MIN_SEGMENT_SHIPMENTS);
    expect(driversFor({ region: { label: 'القنيطرة', outcome: QUNEITRA } }, SHOP)).toEqual([]);
  });

  it('says nothing at all until the shop itself has a record', () => {
    expect(driversFor(shapeOf(), { shipments: 60, returned: 20 })).toEqual([]);
    expect(MIN_SHOP_SHIPMENTS).toBeGreaterThan(60);
  });

  /**
   * THE FLOOR IS THE SHOP'S OWN SIZE, NOT AN ACCIDENT OF THE SEGMENTS.
   *
   * The case above is also refused because its segments are larger than the
   * shop, which is nonsense data — so it would pass even with the shop floor
   * deleted. This one is internally consistent: 60 parcels, a 30-parcel
   * segment that returned 12 and a remainder that returned none. Both sides
   * clear the segment floor and separate cleanly, and the answer must still
   * be silence, because 60 parcels is not a shop rate anybody should be told
   * about on a phone call.
   */
  it('and refuses even a clean, separated split inside too small a shop', () => {
    const shop: SegmentOutcome = { shipments: 60, returned: 12 };
    const seg: SegmentOutcome = { shipments: 30, returned: 12 };
    expect(differs(seg, { shipments: 30, returned: 0 })).toBe(true);
    expect(driversFor({ product: { label: 'منتج', outcome: seg } }, shop)).toEqual([]);
  });

  it('puts the worst driver first', () => {
    const drivers = driversFor(shapeOf(), SHOP);
    for (let i = 1; i < drivers.length; i++) {
      expect(drivers[i - 1].points).toBeGreaterThanOrEqual(drivers[i].points);
    }
  });
});

describe('levers — what can still be changed, and what it is worth', () => {
  it('offers three units and شام كاش, biggest gain first', () => {
    const levers = leversFor(shapeOf());
    expect(levers.length).toBeGreaterThanOrEqual(2);
    expect(levers[0].to).toBe('شام كاش');
    expect(levers[0].points).toBeGreaterThan(30);
    const units = levers.find((l) => l.dimension === 'units');
    expect(units?.to).toBe('3 قطع');
    expect(units?.points).toBeCloseTo(15.3, 0);
  });

  /**
   * A LEVER IS ADVICE, SO IT ONLY POINTS DOWNHILL. Offering «قطعتان» here
   * would be true (25.4% against 33.1%) and offering «قطعة واحدة» to an
   * order of three would be advice to make the outcome worse.
   */
  it('never suggests a change that returns MORE often', () => {
    const levers = leversFor({
      units: {
        label: '3 قطع',
        outcome: UNITS_3,
        alternatives: [{ label: 'قطعة واحدة', outcome: UNITS_1 }],
      },
    });
    expect(levers).toEqual([]);
  });

  it('will not advise from a sample under the lever floor', () => {
    // Two units is a real improvement on one — and at 193 shipments it is
    // above the floor, while a 40-shipment alternative is not.
    expect(UNITS_2.shipments).toBeGreaterThan(MIN_LEVER_SHIPMENTS);
    const thin = leversFor({
      units: { label: 'قطعة واحدة', outcome: UNITS_1, alternatives: [{ label: '4 قطع', outcome: { shipments: 40, returned: 2 } }] },
    });
    expect(thin).toEqual([]);
  });

  it('and not from a difference that is noise', () => {
    const a: SegmentOutcome = { shipments: 200, returned: 60 };
    const b: SegmentOutcome = { shipments: 200, returned: 54 };
    expect(differs(a, b)).toBe(false);
    expect(leversFor({ units: { label: 'أ', outcome: a, alternatives: [{ label: 'ب', outcome: b }] } })).toEqual([]);
  });
});

describe('the verdict, and the three ways it stays silent', () => {
  it('calls a single-unit cash order of the worst product HIGH', () => {
    const r = shapeRisk(shapeOf(), SHOP);
    expect(r.verdict).toBe('HIGH');
    expect(r.shopRate).toBeCloseTo(0.2978, 3);
    expect(r.why).toContain('%');
    expect(r.levers.length).toBeGreaterThan(0);
  });

  /**
   * TEN POINTS, NOT A RATIO — the reason written in the lib. A shape that
   * doubles a 3% rate is not a reason to ask anybody for prepayment.
   */
  it('calls a shape that is worse but only slightly WATCH', () => {
    const shop: SegmentOutcome = { shipments: 4000, returned: 400 }; // 10%
    const seg: SegmentOutcome = { shipments: 1000, returned: 160 }; // 16%
    const r = shapeRisk({ product: { label: 'منتج', outcome: seg } }, shop);
    expect(r.verdict).toBe('WATCH');
  });

  it('calls a shape with nothing against it SAFE, and says so in words', () => {
    const r = shapeRisk({ region: { label: 'طرطوس', outcome: TARTOUS } }, SHOP);
    expect(r.verdict).toBe('SAFE');
    expect(r.why).toContain('لا شيء');
  });

  it('has no verdict at all on a shop too young to have a rate', () => {
    const r = shapeRisk(shapeOf(), { shipments: 60, returned: 11 });
    expect(r.verdict).toBeNull();
    expect(r.shopRate).toBeCloseTo(0.1833, 3);
    expect(r.why).toContain('60');
    expect(r.drivers).toEqual([]);
  });

  it('and none on a shop with no shipments, without dividing by zero', () => {
    const r = shapeRisk({}, { shipments: 0, returned: 0 });
    expect(r.verdict).toBeNull();
    expect(r.shopRate).toBeNull();
  });

  /**
   * THE DEV DATABASE, pinned rather than discovered later: 171 orders, 32
   * of them returned. A young shop is NOT silenced wholesale — its biggest
   * product is 74 of those shipments and comes back 27% of the time against
   * 12% for the rest, which is 14 points and separates at the bar. So the
   * rule speaks, and it prints the count (74) beside the rate so a reader
   * can weigh it.
   *
   * What a young shop cannot do is offer a LEVER: advice needs 50 shipments
   * on both sides of the change, and nothing here has that.
   */
  it('names one driver on a 171-order record, and offers no advice', () => {
    const young: SegmentOutcome = { shipments: 171, returned: 32 };
    const r = shapeRisk(
      {
        product: {
          label: 'منتج',
          outcome: { shipments: 74, returned: 20 },
          alternatives: [{ label: 'منتج آخر', outcome: { shipments: 31, returned: 2 } }],
        },
      },
      young
    );
    expect(r.shopRate).toBeCloseTo(0.187, 2);
    expect(r.verdict).toBe('HIGH');
    expect(r.drivers).toHaveLength(1);
    expect(r.drivers[0].shipments).toBe(74);
    expect(r.drivers[0].why).toContain('74');
    expect(r.levers, 'نصيحة من عيّنة لا تحملها').toEqual([]);
  });
});
