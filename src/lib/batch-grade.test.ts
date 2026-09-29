import { describe, it, expect } from 'vitest';
import {
  BANDS,
  MIN_BANDS,
  ORIGIN,
  batchMismatch,
  batchOrigin,
  costParts,
  gradeBatch,
  readBatches,
  type GradeInput,
} from './batch-grade';

/**
 * These guard the answer to the owner's own note — «ليش المنتجات الجاهزة
 * موجودة بتشغيلات الإنتاج» — and the grade that sits beside it. Both are
 * pure arithmetic over a row, which is the only reason either can be tested
 * at all: there is no model call anywhere in `batch-grade.ts` and a test
 * that had to mock one would be the first sign that there is.
 */

const run = (over: Partial<GradeInput> = {}): GradeInput => ({
  batchNumber: 'BATCH-2026-001',
  quantityProduced: 1000,
  costPerUnit: 3.5,
  totalProductionCost: 3500,
  manufacturingCost: 2000,
  packagingCost: 1000,
  rawMaterialCost: 500,
  otherCosts: 0,
  costLines: [],
  sellingPrice: 10,
  sourceType: 'MANUFACTURED',
  ...over,
});

describe('batchOrigin — which door put these units in', () => {
  it('a typed run number is a production run', () => {
    expect(batchOrigin({ batchNumber: 'BATCH-2026-108' })).toBe('PRODUCED');
  });

  it('RCV- is the ready-goods receiving door', () => {
    expect(batchOrigin({ batchNumber: 'RCV-20260928-002' })).toBe('RECEIVED');
  });

  it('ADJ- is a recount difference', () => {
    expect(batchOrigin({ batchNumber: 'ADJ-M3K9X1' })).toBe('ADJUSTED');
  });

  it('INIT- and SEED- are the opening balance — 89 of the 110 measured', () => {
    expect(batchOrigin({ batchNumber: 'INIT-a8f6e449' })).toBe('OPENING');
    expect(batchOrigin({ batchNumber: 'SEED-0001' })).toBe('OPENING');
  });

  it('a real opening-count key beats any prefix, because it is not inferred', () => {
    expect(batchOrigin({ batchNumber: 'BATCH-2026-001', openingCountId: 'c1' })).toBe('OPENING');
  });

  it('a purchased product cannot be a production run whatever its number says', () => {
    // The server refuses to open a run for a PURCHASED product
    // (/api/production returns WRONG_DOOR), so this is not a guess.
    expect(batchOrigin({ batchNumber: 'BATCH-999', sourceType: 'PURCHASED' })).toBe('RECEIVED');
  });

  it('every origin says why it is on the production screen, and where it belongs', () => {
    for (const facts of Object.values(ORIGIN)) {
      expect(facts.ar.length).toBeGreaterThan(0);
      expect(facts.why.length).toBeGreaterThan(0);
      expect(facts.href).toBeTruthy();
    }
  });
});

describe('costParts — what the cost is actually broken into', () => {
  it('counts only the buckets that hold money', () => {
    expect(costParts(run())).toBe(3);
    expect(costParts(run({ packagingCost: 0, rawMaterialCost: 0, totalProductionCost: 2000, costPerUnit: 2 }))).toBe(1);
  });

  it('a free-form line at zero explains no money, so it is not a part', () => {
    expect(costParts(run({ costLines: [{ amount: 0 }] }))).toBe(3);
    expect(costParts(run({ costLines: [{ amount: 120 }] }))).toBe(4);
  });
});

describe('the weights are fixed', () => {
  it('40 / 30 / 30, and a run can earn all of it', () => {
    expect(BANDS.map((b) => b.weight)).toEqual([40, 30, 30]);
    expect(BANDS.reduce((s, b) => s + b.weight, 0)).toBe(100);
  });
});

describe('gradeBatch — the bands a batch can and cannot earn', () => {
  it('a fully recorded run earns everything and says so', () => {
    const g = gradeBatch(run());
    expect(g.earned).toBe(100);
    expect(g.earnable).toBe(100);
    expect(g.tone).toBe('good');
    expect(g.bands.map((b) => b.key)).toEqual(['priced', 'itemised', 'sellable']);
  });

  it('a receipt of ready goods is NOT charged for the breakdown it never had', () => {
    // «70 من 70» and it means it: a supplier invoice has one price, and that
    // price is the whole truth of what the delivery cost.
    const g = gradeBatch(
      run({
        batchNumber: 'RCV-20260928-002',
        sourceType: 'PURCHASED',
        quantityProduced: 12,
        costPerUnit: 4,
        totalProductionCost: 48,
        manufacturingCost: 0,
        packagingCost: 0,
        rawMaterialCost: 0,
        sellingPrice: 20,
      })
    );
    expect(g.origin).toBe('RECEIVED');
    expect(g.bands.map((b) => b.key)).toEqual(['priced', 'sellable']);
    expect(g.earnable).toBe(70);
    expect(g.earned).toBe(70);
    expect(g.tone).toBe('good');
  });

  it('one lump of cost is half marks, not a pass', () => {
    const g = gradeBatch(run({ packagingCost: 0, rawMaterialCost: 0, totalProductionCost: 2000, costPerUnit: 2 }));
    expect(g.parts).toBe(1);
    expect(g.bands.find((b) => b.key === 'itemised')!.earned).toBe(15);
    expect(g.tone).toBe('ok');
    expect(g.earned).toBe(85);
  });

  it('no breakdown at all on a run earns nothing for that band', () => {
    const g = gradeBatch(
      run({ manufacturingCost: 0, packagingCost: 0, rawMaterialCost: 0, otherCosts: 0, totalProductionCost: 3500 })
    );
    expect(g.bands.find((b) => b.key === 'itemised')!.earned).toBe(0);
  });

  it('an unpriced batch is bad immediately and never «لا يكفي»', () => {
    // Every unit sold out of a zero-cost batch reads as pure profit, for
    // ever, with no later correction. It must never be quietly set aside.
    const g = gradeBatch(
      run({
        batchNumber: 'INIT-abc',
        costPerUnit: 0,
        totalProductionCost: 0,
        manufacturingCost: 0,
        packagingCost: 0,
        rawMaterialCost: 0,
        sellingPrice: null,
      })
    );
    expect(g.tone).toBe('bad');
    expect(g.label).toBe('بلا كلفة');
    // And it earns nothing for the band it failed. The verdict and the
    // points are decided in two places, so both are held.
    expect(g.bands.find((b) => b.key === 'priced')!.earned).toBe(0);
    expect(g.earned).toBe(0);
  });

  it('selling at or below cost is bad however tidy the rest is', () => {
    const g = gradeBatch(run({ costPerUnit: 10, totalProductionCost: 10000, manufacturingCost: 10000, packagingCost: 0, rawMaterialCost: 0, sellingPrice: 10 }));
    expect(g.tone).toBe('bad');
    expect(g.label).toBe('تُباع بخسارة');
    expect(g.bands.find((b) => b.key === 'sellable')!.earned).toBe(0);
  });

  it('a margin band is not scored when the product has no price', () => {
    const g = gradeBatch(run({ sellingPrice: 0 }));
    expect(g.bands.map((b) => b.key)).toEqual(['priced', 'itemised']);
    expect(g.earnable).toBe(70);
  });

  it('below MIN_BANDS no grade is given at all — the 89 measured opening rows', () => {
    const g = gradeBatch(
      run({
        batchNumber: 'INIT-7b0e03e7',
        quantityProduced: 200,
        costPerUnit: 0.5,
        totalProductionCost: 100,
        manufacturingCost: 100,
        packagingCost: 0,
        rawMaterialCost: 0,
        sellingPrice: 0,
      })
    );
    expect(g.origin).toBe('OPENING');
    expect(g.bands.length).toBeLessThan(MIN_BANDS);
    expect(g.tone).toBe('unknown');
    expect(g.earned).toBe(g.earnable);
  });

  it('a zero-quantity batch is judged on nothing', () => {
    const g = gradeBatch(run({ quantityProduced: 0 }));
    expect(g.tone).toBe('unknown');
  });

  it('every band states what it measured and what that earned', () => {
    for (const b of gradeBatch(run()).bands) {
      expect(b.why).toContain('من');
      expect(b.why.length).toBeGreaterThan(8);
    }
  });

  it('and no reason is written in Eastern digits', () => {
    const g = gradeBatch(run({ costPerUnit: 0 }));
    const text = [g.why, g.label, ...g.bands.map((b) => b.why)].join(' ');
    expect(text).not.toMatch(/[٠-٩]/);
  });
});

describe('batchMismatch — the stored figures against each other', () => {
  it('silent when they agree, which was true for 110 of 110 measured', () => {
    expect(batchMismatch(run())).toBeNull();
  });

  it('refuses a zero quantity outright — there is no unit cost to divide to', () => {
    expect(batchMismatch(run({ quantityProduced: 0 }))).toMatch(/الكمية صفر/);
  });

  it('catches a unit cost that is not the total over the quantity', () => {
    expect(batchMismatch(run({ costPerUnit: 9 }))).toMatch(/تكلفة الوحدة/);
  });

  it('catches a total that is not the sum of its own parts', () => {
    expect(batchMismatch(run({ costLines: [{ amount: 500 }] }))).toMatch(/مجموع بنود/);
  });

  it('does not report a receipt as broken for having no parts to sum', () => {
    expect(
      batchMismatch(
        run({
          manufacturingCost: 0, packagingCost: 0, rawMaterialCost: 0, otherCosts: 0,
          quantityProduced: 12, costPerUnit: 4, totalProductionCost: 48,
        })
      )
    ).toBeNull();
  });

  it('tolerates the float noise a stored cost actually carries', () => {
    // 4.199999999999999 is a real stored costPerUnit on BATCH-001.
    expect(batchMismatch(run({ quantityProduced: 1000, totalProductionCost: 4200, costPerUnit: 4.199999999999999, manufacturingCost: 4200, packagingCost: 0, rawMaterialCost: 0 }))).toBeNull();
  });
});

describe('readBatches — the screen-wide read, countable by hand', () => {
  const grades = [
    gradeBatch(run({ batchNumber: 'BATCH-001' })),
    gradeBatch(run({ batchNumber: 'RCV-20260928-001', sourceType: 'PURCHASED', quantityProduced: 1, costPerUnit: 5, totalProductionCost: 5, manufacturingCost: 0, packagingCost: 0, rawMaterialCost: 0, sellingPrice: 20 })),
    gradeBatch(run({ batchNumber: 'INIT-1', quantityProduced: 200, costPerUnit: 0.5, totalProductionCost: 100, manufacturingCost: 100, packagingCost: 0, rawMaterialCost: 0, sellingPrice: 0 })),
    gradeBatch(run({ batchNumber: 'INIT-2', quantityProduced: 200, costPerUnit: 0.5, totalProductionCost: 100, manufacturingCost: 100, packagingCost: 0, rawMaterialCost: 0, sellingPrice: 0 })),
  ];

  it('counts every door, and the rows that are not production', () => {
    const r = readBatches(grades);
    expect(r.total).toBe(4);
    expect(r.notProduction).toBe(3);
    expect(r.byOrigin).toEqual([
      { origin: 'PRODUCED', count: 1 },
      { origin: 'RECEIVED', count: 1 },
      { origin: 'OPENING', count: 2 },
    ]);
    expect(r.ungraded).toBe(2);
  });

  it('leads with the worst thing, not the first thing', () => {
    const unpriced = gradeBatch(run({ costPerUnit: 0, totalProductionCost: 0, manufacturingCost: 0, packagingCost: 0, rawMaterialCost: 0 }));
    const losing = gradeBatch(run({ costPerUnit: 10, totalProductionCost: 10000, manufacturingCost: 10000, packagingCost: 0, rawMaterialCost: 0, sellingPrice: 10 }));
    const broken = gradeBatch(run({ costPerUnit: 9 }));

    // Money already mis-stated outranks money about to be.
    expect(readBatches([broken, unpriced, losing]).headline).toMatch(/لا تتفق/);
    expect(readBatches([unpriced, losing]).headline).toMatch(/بلا كلفة/);
    expect(readBatches([losing, ...grades]).headline).toMatch(/بخسارة/);
    // And with nothing wrong, the confusion the owner actually reported.
    expect(readBatches(grades).headline).toMatch(/ليست تشغيلات إنتاج/);
  });

  it('says nothing when there is nothing to say', () => {
    expect(readBatches([gradeBatch(run())]).headline).toBeNull();
    expect(readBatches([]).headline).toBeNull();
  });

  it('and the read is Western-digit only', () => {
    expect(readBatches(grades).headline ?? '').not.toMatch(/[٠-٩]/);
  });
});
