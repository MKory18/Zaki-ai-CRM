import { describe, expect, it } from 'vitest';
import { dashboardFiles, repoFile, stripComments } from './guard-source';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * A PERCENTAGE ON A DASHBOARD IS READ AS A VERDICT ON SOMEBODY'S WORK.
 *
 * The owner's rule for every indicator: «كل مؤشّر يبيّن قاعدة الاحتساب».
 *
 * And it is not decoration. «نسبة التأكيد ٩٧٪» means one thing out of the
 * orders that were DECIDED and another out of every order created — the
 * second falls every time intake speeds up, so it measures the size of the
 * queue rather than the quality of the work. Two people reading the same
 * number with different denominators in mind are not disagreeing about the
 * business; they are disagreeing about arithmetic, and one of them is
 * about to act on it.
 *
 * The strongest guard here is the TYPE: `rule` is a required prop on
 * `KpiCard`, so a card cannot be added without one — `tsc` refuses it, and
 * no test has to remember. These claims hold the parts a type cannot: that
 * the sentence is a sentence, that it is DRAWN, and that nobody adds a
 * second kind of indicator card that has no rule at all.
 * ═══════════════════════════════════════════════════════════════════════
 */

describe('every indicator card', () => {
  it('demands its rule in the type, so one cannot ship without it', () => {
    const src = stripComments(repoFile('src/components/ui/Card.tsx'));
    const props = src.slice(src.indexOf('export function KpiCard'), src.indexOf('export function KpiCard') + 2000);
    // Not `rule?:` — the whole point is that it cannot be left out.
    expect(props, 'قاعدة الاحتساب صارت اختياريّة').toMatch(/\brule:\s*string/);
    expect(props).not.toMatch(/\brule\?:/);
  });

  it('and draws it where a phone can reach it', () => {
    /*
     * A `title` attribute does not exist on a phone, and the phone is
     * where this screen is read. So the rule is in the markup, behind a
     * disclosure a tap or a keyboard can open.
     */
    const src = stripComments(repoFile('src/components/ui/Card.tsx'));
    expect(src, 'القاعدة محسوبة وما حدا بيرسمها').toContain('{rule}');
    expect(src, 'القاعدة مخبّأة بـtitle — ما بتنفتح على موبايل').not.toMatch(/title=\{rule\}/);
  });

  it('and every card in the product passes a real sentence', () => {
    // A `rule=""` would satisfy the type and say nothing.
    let cards = 0;
    for (const { rel, src } of dashboardFiles()) {
      for (const m of stripComments(src).matchAll(/<KpiCard\b[\s\S]*?\/>/g)) {
        cards++;
        const found = /rule=(?:"([^"]*)"|\{`([^`]*)`\})/.exec(m[0]);
        expect(found, `${rel}: كرت بلا قاعدة احتساب`).not.toBeNull();
        const text = (found![1] ?? found![2] ?? '').trim();
        expect(text.length, `${rel}: قاعدة احتساب فاضية أو قصيرة`).toBeGreaterThan(25);
      }
    }
    expect(cards, 'ما لقيت ولا كرت مؤشّر').toBeGreaterThanOrEqual(8);
  });

  it('and the rules name a denominator, not just a feeling', () => {
    /*
     * The failure this is about is «٩٧٪ of what». A rule that says «نسبة
     * التأكيد» again is the same silence in more words — so each one has
     * to name what it is divided by, or what it is summed over.
     */
    const words = ['÷', 'مجموع', 'ناقص', 'مقسوم', 'زائد'];
    for (const { rel, src } of dashboardFiles()) {
      for (const m of stripComments(src).matchAll(/rule=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        const text = m[1] ?? m[2] ?? '';
        expect(
          words.some((w) => text.includes(w)),
          `${rel}: قاعدة ما بتسمّي مقاماً ولا مجموعاً: ${text.slice(0, 60)}`
        ).toBe(true);
      }
    }
  });
});

describe('and no indicator says what the code does not do', () => {
  it('no rule mentions a tax, a fee or زكاة — there is no such field', () => {
    // The owner's standing rule: no tax, VAT, fee or zakat field anywhere
    // in this product. A rule sentence that mentions one would be
    // describing arithmetic that does not exist.
    for (const { rel, src } of dashboardFiles()) {
      for (const m of stripComments(src).matchAll(/rule=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        const text = m[1] ?? m[2] ?? '';
        for (const forbidden of ['ضريبة القيمة', 'زكاة', 'VAT']) {
          expect(text, `${rel}: قاعدة بتذكر ${forbidden}`).not.toContain(forbidden);
        }
      }
    }
  });
});
