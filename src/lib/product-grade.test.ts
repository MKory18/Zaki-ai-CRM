import { describe, expect, it } from 'vitest';
import {
  MIN_CONFIRMED_ORDERS,
  PRODUCT_BANDS,
  PRODUCT_GRADE_STATES,
  READINESS_GAP_KEYS,
  byProductGrade,
  catalogueReadiness,
  gradeProduct,
  productBand,
  productReadiness,
  type ProductCatalogue,
  type ProductFacts,
  type ProductSales,
} from './product-grade';

/**
 * THE GUARDS, WRITTEN AGAINST THE MEASURED DATABASE.
 *
 * Every figure in a test name was read off the dev database on 2026-09-29
 * before a line of the screen was touched: 114 products of which 12 have
 * ever been ordered and 3 clear the floor of ten; 90 with no price, 113 with
 * no image, 114 with no category; and `estimatedCostOfGoods` recorded on 4
 * of 119 delivered orders and on none of the three gradeable products.
 */

/** The shop's busiest product: SY-3ONG2U, 74 confirmed, 54 delivered, 18 back. */
const TOP: ProductSales = {
  confirmed: 74,
  delivered: 54,
  returned: 18,
  refused: 0,
  deliveredRevenue: 1023.98,
  deliveredCogs: 0, // measured: nothing recorded
  bestDeliveredValue: 21.82,
};

/** The best-landing one: SY-DQWTIA, 31 confirmed, 26 delivered, 5 back. */
const SECOND: ProductSales = {
  confirmed: 31,
  delivered: 26,
  returned: 5,
  refused: 0,
  deliveredRevenue: 557.5,
  deliveredCogs: 0,
  bestDeliveredValue: 21.82,
};

const READY: ProductCatalogue = { status: 'ACTIVE', basePrice: 20, imageCount: 1, hasCategory: true };
/** The measured shape of almost every row: no price, no image, no category. */
const BARE: ProductCatalogue = { status: 'ACTIVE', basePrice: 0, imageCount: 0, hasCategory: false };

const facts = (sales: ProductSales | null, catalogue: ProductCatalogue = READY): ProductFacts => ({
  productId: 'p1',
  catalogue,
  sales,
});

describe('the weights', () => {
  it('sum to a hundred, so a full score is a full score', () => {
    expect(PRODUCT_BANDS.reduce((s, b) => s + b.weight, 0)).toBe(100);
  });

  it('put the most on the question the owner actually asked', () => {
    const heaviest = [...PRODUCT_BANDS].sort((a, b) => b.weight - a.weight)[0];
    expect(heaviest.key).toBe('delivery_rate');
  });

  it('keeps the floor at the ten health.ts and channel-score already use', () => {
    expect(MIN_CONFIRMED_ORDERS).toBe(10);
  });

  it('measures three independent facts and no fourth restating one of them', () => {
    expect(PRODUCT_BANDS.map((b) => b.key)).toEqual(['delivery_rate', 'goods_margin', 'delivered_value']);
    expect(productBand('delivered_value').unit).toBe('money');
  });
});

describe('the floor', () => {
  it('grades the three products that clear it', () => {
    const g = gradeProduct(facts(TOP));
    expect(g.state).toBe('GRADED');
    expect(g.score?.sample).toBe(74);
  });

  it('refuses a number for the product with eight confirmed orders', () => {
    const g = gradeProduct(facts({ ...TOP, confirmed: 8, delivered: 7 }));
    expect(g.state).toBe('THIN_SAMPLE');
    expect(g.score).toBeNull();
    expect(g.why).toContain('8');
    expect(g.why).toContain(String(MIN_CONFIRMED_ORDERS));
  });

  it('names the bands it would have used, so the row is not merely blank', () => {
    const g = gradeProduct(facts({ ...TOP, confirmed: 2, delivered: 2 }));
    for (const band of PRODUCT_BANDS) expect(g.why).toContain(band.ar);
  });

  it('says «never ordered» rather than «too few» for the 102 that never were', () => {
    const g = gradeProduct(facts({ ...TOP, confirmed: 0, delivered: 0, returned: 0, refused: 0, deliveredRevenue: 0 }));
    expect(g.state).toBe('NEVER_ORDERED');
    expect(g.score).toBeNull();
  });

  it('tells «ordered and refused every time» apart from «never ordered»', () => {
    const g = gradeProduct(facts({ ...TOP, confirmed: 0, delivered: 0, returned: 0, refused: 3, deliveredRevenue: 0 }));
    expect(g.state).toBe('NEVER_CONFIRMED');
    expect(g.why).toContain('3');
  });

  it('paints nothing red for being unmeasured — 102 red rows teach a reader to ignore red', () => {
    for (const state of PRODUCT_GRADE_STATES) {
      const g =
        state === 'GRADED'
          ? gradeProduct(facts(TOP))
          : state === 'SALES_HIDDEN'
            ? gradeProduct(facts(null))
            : state === 'NEVER_ORDERED'
              ? gradeProduct(facts({ ...TOP, confirmed: 0, refused: 0 }))
              : state === 'NEVER_CONFIRMED'
                ? gradeProduct(facts({ ...TOP, confirmed: 0, refused: 2 }))
                : gradeProduct(facts({ ...TOP, confirmed: 3 }));
      expect(g.state).toBe(state);
      expect(g.tone).toBe(state === 'GRADED' ? 'good' : 'unknown');
    }
  });
});

describe('the delivery band', () => {
  it('reads out of what was confirmed, never out of everything brought', () => {
    const band = gradeProduct(facts(TOP)).score!.bands.find((b) => b.key === 'delivery_rate')!;
    // 54 of 74 = 73%, and 73% of 50 is 36.5 → 37
    expect(band.value).toBe(73);
    expect(band.points).toBe(37);
    expect(band.why).toContain('54');
    expect(band.why).toContain('74');
  });

  /**
   * A delivery rate over a hundred is not hypothetical: `order-state.ts`
   * records that this system's dashboard rate «could pass 100%» because
   * delivered and confirmed are counted from two different columns, and an
   * imported order can be DELIVERED without ever having been marked
   * CONFIRMED. The measured figure is still printed — it is a fault worth
   * seeing — but it may not buy more than the band is worth.
   */
  it('cannot earn more than its weight when more was delivered than confirmed', () => {
    const band = gradeProduct(facts({ ...TOP, confirmed: 10, delivered: 12 })).score!.bands.find(
      (b) => b.key === 'delivery_rate'
    )!;
    expect(band.value).toBe(120);
    expect(band.points).toBe(productBand('delivery_rate').weight);
  });

  it('separates two products the old screen ranked only by volume', () => {
    const top = gradeProduct(facts(TOP)).score!;
    const second = gradeProduct(facts(SECOND)).score!;
    // 31 confirmed beats 74 confirmed, because 84% lands and 73% does not.
    expect(second.total!).toBeGreaterThan(top.total!);
  });
});

describe('the margin band — cost is permissioned and cost is gated', () => {
  it('is ABSENT, not zero, for a caller who may not see cost', () => {
    const g = gradeProduct(facts({ ...TOP, deliveredCogs: null }));
    const band = g.score!.bands.find((b) => b.key === 'goods_margin')!;
    expect(band.points).toBeNull();
    expect(band.value).toBeNull();
    expect(band.why).toContain('لا تُعرَض');
  });

  it('drops its thirty points out of the total, so the row says «out of 70»', () => {
    const g = gradeProduct(facts({ ...TOP, deliveredCogs: null }));
    expect(g.score!.possible).toBe(70);
    expect(g.why).toContain('من 70');
  });

  it('leaks nothing: no cost, no margin and no figure cost could be derived from', () => {
    const g = gradeProduct(facts({ ...TOP, deliveredCogs: null }));
    const band = g.score!.bands.find((b) => b.key === 'goods_margin')!;
    expect(JSON.stringify(band)).not.toContain('1023.98');
    expect(band.reference).toBeNull();
  });

  it('refuses itself when the cost was simply never recorded — 4 of 119 delivered orders', () => {
    const g = gradeProduct(facts(TOP));
    const band = g.score!.bands.find((b) => b.key === 'goods_margin')!;
    expect(band.points).toBeNull();
    expect(band.why).toContain('لا كلفةَ');
    expect(g.score!.possible).toBe(70);
    expect(g.why).toContain('من 70');
  });

  it('scores it when a cost IS recorded, and shows both figures', () => {
    const g = gradeProduct(facts({ ...TOP, deliveredCogs: 204.8 }));
    const band = g.score!.bands.find((b) => b.key === 'goods_margin')!;
    // (1023.98 - 204.8) / 1023.98 = 80%, and 80% of 30 is 24
    expect(band.value).toBe(80);
    expect(band.points).toBe(24);
    expect(g.score!.possible).toBe(100);
  });

  it('prints a negative margin and scores it nothing — selling under cost IS the finding', () => {
    const g = gradeProduct(facts({ ...TOP, deliveredCogs: 2000 }));
    const band = g.score!.bands.find((b) => b.key === 'goods_margin')!;
    expect(band.value).toBeLessThan(0);
    expect(band.points).toBe(0);
  });

  it('states no margin at all when nothing has been delivered', () => {
    const g = gradeProduct(facts({ ...TOP, delivered: 0, deliveredRevenue: 0, deliveredCogs: 5 }));
    const band = g.score!.bands.find((b) => b.key === 'goods_margin')!;
    expect(band.points).toBeNull();
    expect(band.why).toContain('فراغ');
  });
});

describe('the value band', () => {
  it('reads one delivered order against the best product in the same shop', () => {
    const band = gradeProduct(facts(TOP)).score!.bands.find((b) => b.key === 'delivered_value')!;
    // 1023.98 / 54 = 18.96 against 21.82 → 0.869 of 20 → 17
    expect(band.value).toBe(18.96);
    expect(band.reference).toBe(21.82);
    expect(band.points).toBe(17);
  });

  it('gives the whole band to the only product that has sold anything', () => {
    const band = gradeProduct(facts({ ...TOP, bestDeliveredValue: null })).score!.bands.find(
      (b) => b.key === 'delivered_value'
    )!;
    expect(band.points).toBe(productBand('delivered_value').weight);
  });

  it('scores nothing rather than zero when nothing has been delivered', () => {
    const band = gradeProduct(facts({ ...TOP, delivered: 0, deliveredRevenue: 0 })).score!.bands.find(
      (b) => b.key === 'delivered_value'
    )!;
    expect(band.points).toBeNull();
  });
});

describe('the total', () => {
  it('is the sum of the rounded bands, so the parts add up to the headline', () => {
    const score = gradeProduct(facts({ ...TOP, deliveredCogs: 204.8 })).score!;
    const parts = score.bands.filter((b) => b.points !== null).reduce((s, b) => s + b.points!, 0);
    expect(score.total).toBe(parts);
  });

  it('is out of the weights that actually applied, never out of a hundred by default', () => {
    const score = gradeProduct(facts(TOP)).score!;
    expect(score.possible).toBe(50 + 20);
    expect(score.total!).toBeLessThanOrEqual(score.possible);
  });

  it('names the bands that fell out, so thirty missing points do not read as a bad product', () => {
    const g = gradeProduct(facts(TOP));
    expect(g.why).toContain(productBand('goods_margin').ar);
  });
});

describe('performance is permissioned too', () => {
  it('says so instead of claiming the product never sold', () => {
    const g = gradeProduct(facts(null, BARE));
    expect(g.state).toBe('SALES_HIDDEN');
    expect(g.score).toBeNull();
    expect(g.sales).toBeNull();
  });

  it('still answers the readiness question, which is catalogue data anyone may see', () => {
    const g = gradeProduct(facts(null, BARE));
    expect(g.readiness.gaps.map((x) => x.key)).toEqual(['price', 'image', 'category']);
  });
});

describe('readiness', () => {
  it('blocks on a missing price, because the storefront filters on basePrice > 0', () => {
    const r = productReadiness({ ...READY, basePrice: 0 });
    expect(r.tone).toBe('bad');
    expect(r.sellable).toBe(false);
    expect(r.gaps.find((g) => g.key === 'price')!.blocking).toBe(true);
  });

  it('does not block on an image or a category — neither appears in any where clause', () => {
    const r = productReadiness({ ...READY, imageCount: 0, hasCategory: false });
    expect(r.tone).toBe('ok');
    expect(r.sellable).toBe(true);
    expect(r.gaps.every((g) => !g.blocking)).toBe(true);
  });

  it('calls a complete record ready, and names the three fields it checked', () => {
    const r = productReadiness(READY);
    expect(r.tone).toBe('good');
    expect(r.gaps).toHaveLength(0);
    expect(READINESS_GAP_KEYS).toEqual(['price', 'image', 'category']);
  });

  it('does not scold a product somebody withdrew on purpose', () => {
    const r = productReadiness({ ...BARE, status: 'INACTIVE' });
    expect(r.gaps).toHaveLength(0);
    expect(r.tone).toBe('unknown');
    expect(r.why).toContain('INACTIVE');
  });

  it('refuses to answer the stock question — stock-health.ts owns it', () => {
    const r = productReadiness(READY);
    expect(r.why).not.toContain('مخزون');
    expect(READINESS_GAP_KEYS).not.toContain('stock' as never);
  });

  it('says why in words for every gap it names', () => {
    const r = productReadiness(BARE);
    for (const gap of r.gaps) expect(gap.why.length).toBeGreaterThan(20);
  });
});

describe('the order of the rows', () => {
  it('puts the graded ones first, best first', () => {
    const a = gradeProduct({ ...facts(TOP), productId: 'a' });
    const b = gradeProduct({ ...facts(SECOND), productId: 'b' });
    expect([a, b].sort(byProductGrade).map((g) => g.productId)).toEqual(['b', 'a']);
  });

  it('never places an ungraded row under a low-scoring measured one', () => {
    const graded = gradeProduct({ ...facts({ ...TOP, delivered: 1 }), productId: 'low' });
    const never = gradeProduct({ ...facts({ ...TOP, confirmed: 0, refused: 0 }), productId: 'never' });
    expect([never, graded].sort(byProductGrade).map((g) => g.productId)).toEqual(['low', 'never']);
  });

  it('gathers the never-ordered rows at the very end', () => {
    const thin = gradeProduct({ ...facts({ ...TOP, confirmed: 3 }), productId: 'thin' });
    const never = gradeProduct({ ...facts({ ...TOP, confirmed: 0, refused: 0 }), productId: 'never' });
    const refusedOnly = gradeProduct({ ...facts({ ...TOP, confirmed: 0, refused: 2 }), productId: 'refused' });
    expect([never, refusedOnly, thin].sort(byProductGrade).map((g) => g.productId)).toEqual([
      'thin',
      'refused',
      'never',
    ]);
  });
});

describe('the catalogue sentence', () => {
  const catalogue = () => [
    gradeProduct({ ...facts(TOP, BARE), productId: '1' }),
    gradeProduct({ ...facts(SECOND, BARE), productId: '2' }),
    gradeProduct({ ...facts({ ...TOP, confirmed: 3 }, BARE), productId: '3' }),
    gradeProduct({ ...facts({ ...TOP, confirmed: 0, refused: 2 }, BARE), productId: '4' }),
    gradeProduct({ ...facts({ ...TOP, confirmed: 0, refused: 0 }, READY), productId: '5' }),
  ];

  it('counts every state, so a mostly blank column is explained rather than suspected', () => {
    const r = catalogueReadiness(catalogue());
    expect(r.total).toBe(5);
    expect(r.graded).toBe(2);
    expect(r.thinSample).toBe(1);
    expect(r.neverConfirmed).toBe(1);
    expect(r.neverOrdered).toBe(1);
  });

  it('counts the catalogue backlog per field — the number the owner can act on', () => {
    const r = catalogueReadiness(catalogue());
    expect(r.gaps.find((g) => g.key === 'price')!.count).toBe(4);
    expect(r.notSellable).toBe(4);
    expect(r.incomplete).toBe(4);
  });

  /**
   * «Cannot be shown at all» and «shown badly» are two different backlogs
   * and two different afternoons of work. A summary that added them
   * together would send somebody to upload images when the shop cannot
   * price the goods.
   */
  it('counts what cannot be sold apart from what is merely incomplete', () => {
    const noPrice: ProductCatalogue = { status: 'ACTIVE', basePrice: 0, imageCount: 1, hasCategory: true };
    const noImage: ProductCatalogue = { status: 'ACTIVE', basePrice: 20, imageCount: 0, hasCategory: true };
    const rows = [
      gradeProduct({ ...facts(TOP, noPrice), productId: 'a' }),
      gradeProduct({ ...facts(TOP, noPrice), productId: 'b' }),
      gradeProduct({ ...facts(TOP, noImage), productId: 'c' }),
      gradeProduct({ ...facts(TOP, READY), productId: 'd' }),
    ];
    const r = catalogueReadiness(rows);
    expect(r.notSellable).toBe(2);
    expect(r.incomplete).toBe(3);
    expect(r.gaps.find((g) => g.key === 'price')!.count).toBe(2);
    expect(r.gaps.find((g) => g.key === 'image')!.count).toBe(1);
  });

  it('mentions only what is true of this catalogue', () => {
    const r = catalogueReadiness([gradeProduct({ ...facts(TOP), productId: '1' })]);
    expect(r.why).toContain('1 له درجة');
    expect(r.why).not.toContain('لم يُطلب قطّ');
  });

  it('answers an empty list without inventing a total', () => {
    expect(catalogueReadiness([]).why).toBe('لا منتجَ في هذه القائمة.');
  });

  it('names the bands the grade is built from', () => {
    const r = catalogueReadiness(catalogue());
    expect(r.madeOf).toEqual(PRODUCT_BANDS.map((b) => b.ar));
  });
});

describe('western digits only, and no model anywhere', () => {
  it('writes no Arabic-Indic digit in any sentence this file produces', () => {
    const rows = [
      gradeProduct(facts(TOP, BARE)),
      gradeProduct(facts({ ...TOP, deliveredCogs: 204.8 })),
      gradeProduct(facts({ ...TOP, confirmed: 3 })),
      gradeProduct(facts({ ...TOP, confirmed: 0, refused: 2 })),
      gradeProduct(facts(null, BARE)),
      gradeProduct(facts({ ...TOP, confirmed: 0, refused: 0 }, { ...BARE, status: 'INACTIVE' })),
    ];
    const text = JSON.stringify([rows, catalogueReadiness(rows)]);
    expect(text).not.toMatch(/[٠-٩۰-۹]/);
  });
});
