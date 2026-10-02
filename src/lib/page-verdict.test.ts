import { describe, expect, it } from 'vitest';
import {
  MIN_DELIVERED,
  MIN_MARGIN,
  MIN_VISITORS,
  collectedPer100,
  conversionRate,
  deliveryRate,
  pageVerdict,
  type PageNumbers,
} from './page-verdict';
import { repoFile, stripComments } from './guard-source';

/**
 * «الصفحة الفائزة هي الي بتطلّع أكتر طلبات مُسلَّمة ومحصَّلة لكل ١٠٠ زائر
 * — مش الي بتطلّع أكتر فورمات.»
 *
 * The test that matters most is the one where the page with MORE orders
 * loses, because that is the whole point and the thing every other
 * analytics screen gets wrong.
 */

const page = (over: Partial<PageNumbers> = {}): PageNumbers => ({
  pageId: 'a',
  label: 'نسخة أ',
  visitors: 1000,
  orders: 50,
  delivered: 40,
  collected: 35,
  ...over,
});

describe('«مش الي بتطلّع أكتر فورمات»', () => {
  it('the page with more orders LOSES when fewer of them arrive', () => {
    const loud = page({ pageId: 'loud', label: 'وعود كتيرة', visitors: 1000, orders: 120, delivered: 40, collected: 30 });
    const quiet = page({ pageId: 'quiet', label: 'وعود صادقة', visitors: 1000, orders: 60, delivered: 55, collected: 50 });

    // The one every other dashboard would call the winner.
    expect(conversionRate(loud)!).toBeGreaterThan(conversionRate(quiet)!);

    const v = pageVerdict([loud, quiet]);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.winner).toBe('quiet');
  });

  it('and the two rates are reported separately, because they fail differently', () => {
    // «نسبة التحويل ونسبة التسليم منفصلين». A blended number hides which
    // half is wrong: a high conversion with a low delivery rate is a page
    // that over-promises.
    const over = page({ orders: 200, delivered: 40 });
    expect(conversionRate(over)).toBeCloseTo(0.2);
    expect(deliveryRate(over)).toBeCloseTo(0.2);
    expect(collectedPer100(over)).toBeCloseTo(3.5);
  });

  it('collected is the measure, not delivered — the money has to arrive', () => {
    const delivered = page({ pageId: 'd', visitors: 1000, orders: 60, delivered: 60, collected: 20 });
    const paid = page({ pageId: 'p', visitors: 1000, orders: 40, delivered: 40, collected: 40 });
    const v = pageVerdict([delivered, paid]);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.winner).toBe('p');
  });
});

describe('«ما في حكم قبل حد أدنى من الزوار والطلبات المُسلَّمة»', () => {
  it('refuses while a variant is short of visitors, and says how short', () => {
    const thin = page({ pageId: 'thin', visitors: 120, orders: 10, delivered: 9, collected: 9 });
    const v = pageVerdict([page(), thin]);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.waiting).toHaveLength(1);
    expect(v.waiting[0].pageId).toBe('thin');
    expect(v.waiting[0].needVisitors).toBe(MIN_VISITORS - 120);
    expect(v.waiting[0].needDelivered).toBe(MIN_DELIVERED - 9);
  });

  it('and while a variant is short of delivered orders, however many visitors', () => {
    const v = pageVerdict([page(), page({ pageId: 'b', visitors: 9000, orders: 12, delivered: 2, collected: 2 })]);
    expect(v.ok).toBe(false);
  });

  it('EVERY variant has to clear them, not the leader', () => {
    // A winner called against a variant nobody has seen yet is a winner
    // against nothing.
    const strong = page({ pageId: 'strong', visitors: 5000, orders: 400, delivered: 380, collected: 370 });
    const unseen = page({ pageId: 'unseen', visitors: 4, orders: 1, delivered: 1, collected: 1 });
    expect(pageVerdict([strong, unseen]).ok).toBe(false);
  });

  it('and one page alone is never a comparison', () => {
    expect(pageVerdict([page()]).ok).toBe(false);
    expect(pageVerdict([]).ok).toBe(false);
  });

  it('answers in exactly two shapes — there is no winner with a caveat', () => {
    // A caveat beside a name is read as a name.
    const v = pageVerdict([page(), page({ pageId: 'b' })]);
    if (v.ok) expect('waiting' in v).toBe(false);
    else expect('winner' in v).toBe(false);
  });
});

describe('«النظام بيقترح الفائز» — ولا يحكم على ما لا يُفرَّق', () => {
  it('says too close rather than naming one, when the lead is inside the margin', () => {
    const a = page({ pageId: 'a', visitors: 1000, orders: 50, delivered: 45, collected: 40 });
    const b = page({ pageId: 'b', visitors: 1000, orders: 50, delivered: 45, collected: 38 });
    const v = pageVerdict([a, b]);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    // 4.0 vs 3.8 — five percent apart, inside the ten percent line.
    expect(v.tooClose).toBe(true);
    expect(v.winner).toBeNull();
  });

  it('and names one when the lead is wider', () => {
    const a = page({ pageId: 'a', visitors: 1000, orders: 60, delivered: 55, collected: 50 });
    const b = page({ pageId: 'b', visitors: 1000, orders: 50, delivered: 40, collected: 30 });
    const v = pageVerdict([a, b]);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.tooClose).toBe(false);
    expect(v.winner).toBe('a');
  });

  it('the margin is relative, so two points mean different things at two levels', () => {
    expect(MIN_MARGIN).toBeGreaterThan(0);
    // 4.0 vs 3.8 is inside it; 0.4 vs 0.2 is not.
    const near = pageVerdict([
      page({ pageId: 'a', visitors: 1000, collected: 40, orders: 50, delivered: 45 }),
      page({ pageId: 'b', visitors: 1000, collected: 38, orders: 50, delivered: 45 }),
    ]);
    const far = pageVerdict([
      page({ pageId: 'c', visitors: 1000, collected: 4, orders: 50, delivered: 45 }),
      page({ pageId: 'd', visitors: 1000, collected: 2, orders: 50, delivered: 45 }),
    ]);
    expect(near.ok && near.tooClose).toBe(true);
    expect(far.ok && far.tooClose).toBe(false);
  });

  it('and nothing is a winner when nothing was collected', () => {
    const v = pageVerdict([
      page({ pageId: 'a', collected: 0 }),
      page({ pageId: 'b', collected: 0 }),
    ]);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.winner).toBeNull();
  });
});

describe('«ما بيطفّي الخاسر لحاله»', () => {
  it('nothing in this module can change a page', () => {
    const src = stripComments(repoFile('src/lib/page-verdict.ts'));
    // No database, no mutation, no flag. A system that switched pages off
    // would be deciding with the same thin numbers and no way to be
    // argued with.
    for (const forbidden of ['db.', 'prisma', 'update', 'delete', 'isPublished', 'disable']) {
      expect(src.includes(forbidden), forbidden).toBe(false);
    }
  });

  it('and the sample travels with the verdict, so a person can judge it', () => {
    const v = pageVerdict([page(), page({ pageId: 'b', collected: 10 })]);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    for (const row of v.ranked) {
      expect(row.visitors).toBeGreaterThan(0);
      expect(row.delivered).toBeGreaterThanOrEqual(0);
    }
  });

  it('every variant is ranked, not only the winner', () => {
    const v = pageVerdict([page({ pageId: 'a' }), page({ pageId: 'b', collected: 10 }), page({ pageId: 'c', collected: 20 })]);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.ranked.map((r) => r.pageId)).toEqual(['a', 'c', 'b']);
  });

  it('and it claims no statistical significance it cannot show', () => {
    // THE CODE, not the prose. The comment at the top of that file
    // explains why it is NOT a significance test, and a guard reading its
    // own explanation fails on it — which has happened to five guards in
    // this repository.
    const src = stripComments(repoFile('src/lib/page-verdict.ts'));
    // A p-value beside a sample of forty is a lie dressed as rigour.
    for (const word of ['pValue', 'significan', 'confidence']) {
      expect(src.includes(word), word).toBe(false);
    }
  });
});

describe('a page nobody visited', () => {
  it('has no rate rather than a rate of zero', () => {
    // Zero reads as «it fails»; nothing reads as «we do not know».
    expect(collectedPer100(page({ visitors: 0 }))).toBeNull();
    expect(conversionRate(page({ visitors: 0 }))).toBeNull();
    expect(deliveryRate(page({ orders: 0 }))).toBeNull();
  });
});

/**
 * THE NUMBERS THE VERDICT IS FED.
 *
 * `pageVerdict` cannot be wrong about what «collected» means — it is handed
 * a number. The place that CAN be wrong is the query, and it is in another
 * file by design: this one decides and has no database in it. So the rule
 * about what counts as collected is guarded where it lives.
 */
describe('«محصَّلة» means the money arrived, not the parcel', () => {
  const src = () => stripComments(repoFile('src/lib/landing-analytics.ts'));

  it('counts only orders whose settlement says the company has the cash', () => {
    // A parcel handed over on Tuesday whose cash reaches the company on
    // Friday is delivered on Tuesday and collected on Friday. A page
    // judged on the first is judged on money that has not arrived.
    expect(src()).toContain("settlementStatus: { in: ['COLLECTED', 'SETTLED'] }");
  });

  it('and delivered is counted separately, from the delivery date', () => {
    expect(src()).toContain("deliveredAt: { not: null }");
  });

  it('every variant starts at zero, so a page with no rows is not missing', () => {
    // A page absent from a groupBy result has no orders — not «unknown».
    expect(src()).toContain('{ visitors: 0, orders: 0, delivered: 0, collected: 0 }');
  });
});
