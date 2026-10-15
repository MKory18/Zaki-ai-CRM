import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { stripComments } from './guard-source';
import {
  BRIEF_ATTRIBUTE_KEYS,
  COUNTED_FLOOR,
  COUNTED_NOT_RECORDED,
  LANDING_FAMILIES,
  MATCHER_PICKS,
  WHY_MAX,
  countedCombinations,
  familyById,
  fiveAttributes,
  matchNoteAr,
  matcherBrief,
  readMatchProposal,
} from './landing-matcher';
import { LANDING_STRUCTURES } from './landing-structures';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE MATCHER PROPOSES, SAYS WHY, AND IS NEVER TOLD OUR NUMBERS.
 *
 * S3 / O3 · 2c: «three pre-selected choices, each with its reason, all
 * changeable… the counts are never sent to the model.» Three claims are
 * worth a test each, and each of them is a claim that stops being true
 * quietly:
 *
 *   ① A VALUE NOT ON THE LIST IS DROPPED AND NAMED. The brief's own words:
 *      «Values not in LANDING_STRUCTURES or the family list are dropped and
 *      named.» The commonest real answer from a model is a PLAUSIBLE
 *      invention — `problem-first`, `medical` — and the tempting fix is to
 *      map it to the nearest real one. That is the model choosing something
 *      nobody can audit, so it is refused, and the refusal is read out.
 *
 *   ② A PICK WITH NO REASON IS NOT A PICK. «ومعه سبب بسطر» is half the
 *      feature: three cards the owner cannot argue with are three buttons.
 *      Shipping a pick whose reason is missing would force the screen to
 *      invent a sentence to fill the chip.
 *
 *   ③ THE COUNTS NEVER REACH THE BRIEF, AND THE FLOOR REFUSES THIN ROWS.
 *      A page with 30 views and 2 orders converts at 6.7% and means
 *      nothing; printed beside a proposal it decides the owner's choice. So
 *      200 views AND 5 pages, or the screen says it has nothing to say.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const PRODUCT = {
  name: 'قناع الأرز',
  description: 'قناع شعر بخلاصة الأرز',
  category: 'العناية بالشعر',
  attributes: { الحجم: '150 مل', 'بلد الصنع': 'الأردن' },
  price: 15,
  currency: 'JOD',
};

describe('Ⅰ · the brief offers the two closed lists and nothing else', () => {
  it('names every structure and every family by its id', () => {
    const brief = matcherBrief(PRODUCT);
    for (const s of LANDING_STRUCTURES) {
      expect(brief, `البنية «${s.id}» غائبة عن البريف`).toContain(s.id);
      expect(brief, `وصفُ «${s.id}» غائب — فالموديل بيختار من اسم`).toContain(s.forWhom);
    }
    for (const f of LANDING_FAMILIES) {
      expect(brief, `العائلة «${f.id}» غائبة`).toContain(f.id);
      expect(brief).toContain(f.forWhom);
    }
  });

  it('and says the ids are the only ones allowed, twice — once per list', () => {
    const brief = matcherBrief(PRODUCT);
    expect(brief.match(/ولا شيء غيرها/g)?.length, 'قائمةٌ واحدةٌ فقط مسوَّرة').toBe(2);
  });

  it('and forbids the four things this product forbids everywhere else', () => {
    const brief = matcherBrief(PRODUCT);
    // رقم مخترع · ادّعاء صحّي · لون من الموديل · معرّف من عنده
    for (const rule of ['لا تخترع رقماً', 'طبّي', 'لا لون', 'معرّف من عندك']) {
      expect(brief, `البريف لا يَمنعُ «${rule}»`).toContain(rule);
    }
  });

  it('and carries the six inputs the brief names — and the price among them', () => {
    const brief = matcherBrief(PRODUCT);
    expect(brief).toContain('قناع الأرز');
    expect(brief).toContain('قناع شعر بخلاصة الأرز');
    expect(brief).toContain('العناية بالشعر');
    expect(brief).toContain('150 مل');
    expect(brief).toContain('15 JOD');
  });

  it('and a product with no description, no category and no offer says so rather than leaving a blank', () => {
    const brief = matcherBrief({ name: 'منتج', price: 10, currency: 'JOD' });
    expect(brief).toContain('لا وصف مكتوب له');
    expect(brief).toContain('لا فئة محدّدة له');
    expect(brief).toContain('لا عرض قائم عليه الآن');
    expect(brief).toContain('لا تخترع');
  });

  it('and a live offer reaches it as the seller wrote it, with no id of ours', () => {
    const brief = matcherBrief({
      ...PRODUCT,
      offers: [{ name: 'قطعتين بسعر واحدة', quantity: 2, price: 20 }],
    });
    expect(brief).toContain('قطعتين بسعر واحدة');
    expect(brief).toContain('2 بـ20 JOD');
  });

  /**
   * ③ — AND THIS IS THE ONE THAT MATTERS MOST.
   *
   * Not «the brief happens to contain no counts today»: the brief FUNCTION
   * has no access to one. `matcherBrief` is read with its comments stripped
   * and must not mention the two columns at all — so a future author who
   * adds «and here are your results so far» to the prompt fails here rather
   * than in a review nobody ran.
   */
  it('and the brief builder cannot even see viewsCount or ordersCount', () => {
    const src = stripComments(readFileSync('src/lib/landing-matcher.ts', 'utf8'));
    const body = src.slice(src.indexOf('export function matcherBrief'), src.indexOf('export interface MatchPick'));
    expect(body, 'بانى البريف صار يَقرأ أرقامَ المتجر').not.toMatch(/viewsCount|ordersCount|conversion/);
    /*
     * «نسبة تحويل» IS IN THE BRIEF — as a PROHIBITION («لا تخترع رقماً: لا
     * نسبة تحويل»), which is the opposite of sending one. So the words
     * looked for are the ones that would only appear if the shop's own
     * results were being handed over.
     */
    for (const word of ['مشاهدة', 'نتائجك', 'أرقامك']) {
      expect(body, `البريف صار يَذكرُ «${word}»`).not.toContain(word);
    }
  });

  it('and never asks for more than three', () => {
    expect(matcherBrief({ ...PRODUCT, picks: 9 })).toContain(`عدد الاقتراحات: ${MATCHER_PICKS}`);
    expect(matcherBrief({ ...PRODUCT, picks: 1 })).toContain('عدد الاقتراحات: 1');
  });
});

describe('Ⅱ · the four families are four, and each one is a slug a renderer can read', () => {
  it('are the owner’s four, by name', () => {
    expect(LANDING_FAMILIES.map((f) => f.name)).toEqual(['عيادة', 'عطّار', 'ترند', 'علامة']);
  });

  it('and no two share an id, and every id is a lowercase latin slug', () => {
    const ids = LANDING_FAMILIES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id, `«${id}» ليس معرّفاً يقرأه قالب`).toMatch(/^[a-z][a-z0-9-]{1,23}$/);
  });

  it('and a family is found by its id and not by its name', () => {
    expect(familyById('brand')?.name).toBe('علامة');
    expect(familyById('علامة')).toBeUndefined();
  });

  it('and the five attribute keys are the five the brief names', () => {
    expect([...BRIEF_ATTRIBUTE_KEYS]).toEqual(['need', 'skin', 'ml', 'made', 'ingredients']);
  });

  it('and nothing but those five reaches the brief, however many a category asks', () => {
    const fields = [
      { key: 'ml', label: 'الحجم' },
      { key: 'made', label: 'بلد الصنع' },
      { key: 'supplier', label: 'المورّد' },
      { key: 'cost_note', label: 'ملاحظة الكلفة' },
    ];
    const read = fiveAttributes(fields, { ml: 150, made: 'الأردن', supplier: 'أبو علي', cost_note: 'سرّي' });
    expect(read.byKey).toEqual({ ml: '150', made: 'الأردن' });
    expect(read.labelled).toEqual({ الحجم: '150', 'بلد الصنع': 'الأردن' });
    const brief = matcherBrief({ ...PRODUCT, attributes: read.labelled });
    expect(brief, 'بياناتُ مورّدٍ خرجت في بريف').not.toContain('أبو علي');
    expect(brief).not.toContain('سرّي');
  });

  it('and a multi-answer arrives as one readable line, not as [object Object]', () => {
    const read = fiveAttributes([{ key: 'need', label: 'مناسب لـ' }], { need: ['جاف', 'متقصّف'] });
    expect(read.labelled['مناسب لـ']).toBe('جاف · متقصّف');
  });
});

describe('Ⅲ · nothing that comes back is trusted', () => {
  const good = {
    structure: LANDING_STRUCTURES[0].id,
    structureWhy: 'المنتج بيحلّ مشكلة والزائر بارد',
    family: 'clinic',
    familyWhy: 'شكل عيادة بيطمّن',
  };

  it('reads a well-behaved answer and hands back the structure itself, not its id', () => {
    const reading = readMatchProposal({ picks: [good] });
    expect(reading.picks).toHaveLength(1);
    expect(reading.picks[0].structure.id).toBe(LANDING_STRUCTURES[0].id);
    expect(reading.picks[0].structure.slots.length, 'رجّع معرّفاً لا بنية').toBeGreaterThan(0);
    expect(reading.picks[0].family.name).toBe('عيادة');
    expect(reading.dropped).toEqual([]);
  });

  it('① drops a structure that is not in the library, and names it', () => {
    const reading = readMatchProposal({ picks: [{ ...good, structure: 'problem-first' }] });
    expect(reading.picks).toHaveLength(0);
    expect(reading.dropped[0]).toContain('problem-first');
    expect(reading.dropped[0]).toContain('بنية غير معروفة');
  });

  it('① and a family that is not one of the four, and names it', () => {
    const reading = readMatchProposal({ picks: [{ ...good, family: 'medical' }] });
    expect(reading.picks).toHaveLength(0);
    expect(reading.dropped[0]).toContain('medical');
    expect(reading.dropped[0]).toContain('عائلة غير معروفة');
  });

  it('② and a pick with no reason, because a card with no reason is a button', () => {
    for (const missing of [{ structureWhy: '' }, { familyWhy: '   ' }, { structureWhy: undefined }]) {
      const reading = readMatchProposal({ picks: [{ ...good, ...missing }] });
      expect(reading.picks, JSON.stringify(missing)).toHaveLength(0);
      expect(reading.dropped[0]).toContain('بلا سبب');
    }
  });

  it('② and a reason longer than one line is cut to one line, not dropped', () => {
    const reading = readMatchProposal({
      picks: [{ ...good, structureWhy: 'ا'.repeat(WHY_MAX + 80) }],
    });
    expect(reading.picks).toHaveLength(1);
    expect([...reading.picks[0].structureWhy].length).toBe(WHY_MAX);
  });

  it('and newlines inside a reason become one line — a chip is one line', () => {
    const reading = readMatchProposal({ picks: [{ ...good, familyWhy: 'سبب\n\nعلى سطرين' }] });
    expect(reading.picks[0].familyWhy).toBe('سبب على سطرين');
  });

  it('and the same pair twice is one pick and one explanation', () => {
    const reading = readMatchProposal({ picks: [good, { ...good, structureWhy: 'نفسه بكلام تاني' }] });
    expect(reading.picks).toHaveLength(1);
    expect(reading.dropped[0]).toContain('مكرّر');
  });

  it('and never more than three, however many came', () => {
    const many = LANDING_FAMILIES.map((f) => ({ ...good, family: f.id }));
    expect(readMatchProposal({ picks: many }).picks).toHaveLength(MATCHER_PICKS);
  });

  it('and an answer with no picks at all is said out loud, not returned empty-and-silent', () => {
    for (const raw of [null, {}, { picks: [] }, 'لا أستطيع المساعدة', 7]) {
      const reading = readMatchProposal(raw);
      expect(reading.picks, JSON.stringify(raw)).toHaveLength(0);
      expect(reading.dropped.length).toBeGreaterThan(0);
    }
  });

  it('and a bare array is read too — models answer the list without the wrapper', () => {
    expect(readMatchProposal([good]).picks).toHaveLength(1);
  });

  it('and the note says how many are ready and that they all change', () => {
    const note = matchNoteAr(readMatchProposal({ picks: [good] }));
    expect(note).toContain('1 اقتراح');
    expect(note).toContain('بينغيّر');
  });
});

describe('Ⅳ · the counted half — the floor, and the sentence when it is not cleared', () => {
  const page = (structure: string, family: string, views: number, orders: number) => ({
    structure,
    family,
    views,
    orders,
  });
  const five = (views: number, orders: number) =>
    Array.from({ length: 5 }, () => page('problem-solution', 'clinic', views, orders));

  it('groups a combination across its pages and sums both numbers', () => {
    const reading = countedCombinations(five(100, 5));
    expect(reading.ready[0].pages).toBe(5);
    expect(reading.ready[0].views).toBe(500);
    expect(reading.ready[0].orders).toBe(25);
    expect(reading.ready[0].conversion).toBe(5);
  });

  it('and names both halves of the pair in the words a person reads', () => {
    const reading = countedCombinations(five(100, 5));
    expect(reading.ready[0].familyName).toBe('عيادة');
    expect(reading.ready[0].structureName).toBe(
      LANDING_STRUCTURES.find((s) => s.id === 'problem-solution')!.name
    );
  });

  it('refuses a combination with enough pages and not enough views', () => {
    const reading = countedCombinations(Array.from({ length: 5 }, () => page('problem-solution', 'clinic', 39, 2)));
    expect(reading.ready, 'مرّت تركيبة بأقلّ من الحدّ').toEqual([]);
    expect(reading.thin).toBe(1);
    expect(reading.note).toBe('لسا ما في أرقام كافية.');
  });

  it('and one with enough views on too few pages — one lucky page is not a measurement', () => {
    const reading = countedCombinations([page('problem-solution', 'clinic', 5000, 400)]);
    expect(reading.ready).toEqual([]);
    expect(reading.note).toBe('لسا ما في أرقام كافية.');
  });

  it('and the floor is exactly the brief’s two numbers', () => {
    expect(COUNTED_FLOOR.views).toBe(200);
    expect(COUNTED_FLOOR.pages).toBe(5);
    // On the line: five pages × forty views is 200 views exactly.
    expect(countedCombinations(five(40, 1)).ready).toHaveLength(1);
    // And one view short of it is refused.
    expect(countedCombinations([...five(40, 1).slice(1), page('problem-solution', 'clinic', 39, 1)]).ready).toEqual(
      []
    );
  });

  it('and the ones that cleared it come best-first', () => {
    const rows = [
      ...five(100, 2),
      ...Array.from({ length: 6 }, () => page('offer-first', 'trend', 100, 9)),
    ];
    const reading = countedCombinations(rows);
    expect(reading.ready.map((c) => c.family)).toEqual(['trend', 'clinic']);
  });

  it('and a combination of ids nothing knows still counts, under its own id', () => {
    const rows = Array.from({ length: 5 }, () => page('retired-structure', 'retired-family', 100, 3));
    const reading = countedCombinations(rows);
    expect(reading.ready[0].structureName).toBe('retired-structure');
    expect(reading.ready[0].familyName).toBe('retired-family');
  });

  it('and with no rows at all it says so — and the reason is written down', () => {
    const reading = countedCombinations([]);
    expect(reading.ready).toEqual([]);
    expect(reading.note).toBe('لسا ما في أرقام كافية.');
    /*
     * THE HONEST PART OF THIS FEATURE. The schema records a page's views
     * and orders and NOT the structure or family it wore, so «per structure
     * × family» cannot be grouped without two new columns — and a migration
     * is this task's declared stop. The sentence the screen shows says
     * that, rather than printing 0% beside every combination.
     */
    expect(COUNTED_NOT_RECORDED).toContain('هجرة');
    expect(COUNTED_NOT_RECORDED).toContain('البنية');
  });
});
