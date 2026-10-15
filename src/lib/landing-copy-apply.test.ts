import { describe, expect, it } from 'vitest';
import { applyCopyToSections, sameArrangement } from './landing-copy-apply';
import { newSection, type LandingSection } from './landing-sections';
import { structureToSections, type Dialect } from './landing-structure';
import { LANDING_STRUCTURES, STRUCTURE_PROBLEM_SOLUTION } from './landing-structures';

/**
 * A PROPOSAL MAY WRITE WORDS. IT MAY NOT REARRANGE A PAGE.
 *
 * The create dialog builds a page FROM a structure, and that is right: there
 * is no page yet. The same call made from inside the editor would be a
 * different act entirely — it would throw away the blocks the seller added,
 * the ones they deleted, the order they dragged them into and every look
 * they set, and hand them back a different page wearing their words.
 *
 * The owner's rule for this work, in his own words: «a look never changes
 * the ARRANGEMENT of anything a person arranged». Words are not even a look.
 *
 * So these are the claims `AiCopyPanel` rests on, checked here rather than
 * in a browser: the page that comes out is the page that went in, block for
 * block, in order, with the same ids — and the copy lands in the seller's
 * OWN blocks, matched by type and position rather than by an index into a
 * structure the page may no longer resemble.
 */

/** Slot key → one dialect, which is the shape the route answers with. */
function copyIn(keys: Record<string, string>, dialect: Dialect = 'levantine') {
  return Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, { [dialect]: v }]));
}

/** The page a seller gets from the create dialog, before they touch it. */
function pageFromStructure(): LandingSection[] {
  return structureToSections(STRUCTURE_PROBLEM_SOLUTION, {}, 'levantine', newSection);
}

describe('a proposal reaching a page that already exists', () => {
  it('leaves every block where the seller put it', () => {
    const before = pageFromStructure();
    const slot = STRUCTURE_PROBLEM_SOLUTION.slots[0];

    const { sections, placed } = applyCopyToSections({
      sections: before,
      structure: STRUCTURE_PROBLEM_SOLUTION,
      copy: copyIn({ [slot.key]: 'جلدك تعب من الجفاف؟' }),
      dialect: 'levantine',
    });

    expect(placed.length, 'ما كُتبت ولا خانة').toBeGreaterThan(0);
    expect(sameArrangement(before, sections), 'الترتيب تغيّر').toBe(true);
    // Said again as the identities themselves, because `sameArrangement` is
    // the thing under test as much as the function it is checking.
    expect(sections.map((s) => s.id)).toEqual(before.map((s) => s.id));
    expect(sections.map((s) => s.type)).toEqual(before.map((s) => s.type));
  });

  it('and does not touch the page it was handed', () => {
    /*
     * The panel computes the fit on every keystroke to SHOW what would
     * change, and applies it only when the seller presses. If the fit
     * mutated the array it was given, the page would move under them before
     * the press and «إلغاء» would not take it back — and a slot addressing
     * a row (`points.0.when`) is exactly where a shallow copy leaks.
     */
    const before = pageFromStructure();
    const frozen = structuredClone(before);
    const slot = STRUCTURE_PROBLEM_SOLUTION.slots[0];

    applyCopyToSections({
      sections: before,
      structure: STRUCTURE_PROBLEM_SOLUTION,
      copy: copyIn({ [slot.key]: 'نصّ جديد' }),
      dialect: 'levantine',
    });

    expect(before, 'الاقتراح كتب على الصفحة قبل ما يوافق البائع').toEqual(frozen);
  });

  it('writes the words into the seller’s own blocks, by type and by order', () => {
    /*
     * «المشكلة ← الحل» is a hero and then FOUR `text` blocks, and those four
     * are not interchangeable: which paragraph is «المحاولات الفاشلة» is the
     * structure itself. So the second `text` slot must reach the second
     * `text` block on the page — and still reach it after the seller has put
     * something above it.
     */
    const textSlots = STRUCTURE_PROBLEM_SOLUTION.slots.filter(
      (s) => STRUCTURE_PROBLEM_SOLUTION.sequence[s.at] === 'text'
    );
    expect(textSlots.length, 'البنية ما فيها خانات نصّ للاختبار').toBeGreaterThan(1);

    const page = pageFromStructure();
    const { sections, placed } = applyCopyToSections({
      sections: page,
      structure: STRUCTURE_PROBLEM_SOLUTION,
      copy: copyIn({ [textSlots[0].key]: 'الأولى', [textSlots[1].key]: 'التانية' }),
      dialect: 'levantine',
    });

    const texts = sections.filter((s) => s.type === 'text');
    const first = placed.find((p) => p.slotKey === textSlots[0].key);
    const second = placed.find((p) => p.slotKey === textSlots[1].key);
    expect(first?.sectionId).toBe(texts[0].id);
    expect(second?.sectionId).toBe(texts[1].id);
    expect(first!.sectionId).not.toBe(second!.sectionId);
  });

  it('and keeps finding them after the seller has added a block on top', () => {
    /*
     * THE BUG THIS RULES OUT. Matching by `slot.at` — the index in the
     * structure's sequence — looks right and is wrong the moment a seller
     * adds an announcement bar at the top: every index shifts by one, the
     * hero's headline is written into the announcement, and the page reads
     * as nonsense. Matching by nth-of-type survives it.
     */
    const page = pageFromStructure();
    const withBanner = [newSection('announcement'), ...page];
    const slot = STRUCTURE_PROBLEM_SOLUTION.slots[0];
    const heroType = STRUCTURE_PROBLEM_SOLUTION.sequence[slot.at];

    const { sections, placed } = applyCopyToSections({
      sections: withBanner,
      structure: STRUCTURE_PROBLEM_SOLUTION,
      copy: copyIn({ [slot.key]: 'العنوان' }),
      dialect: 'levantine',
    });

    const target = placed.find((p) => p.slotKey === slot.key);
    expect(target?.sectionType, 'النصّ نزل بقسم من نوع تاني').toBe(heroType);
    expect(sections[0].type, 'الشريط اللي ضافه البائع تغيّر').toBe('announcement');
    expect(sameArrangement(withBanner, sections)).toBe(true);
  });

  it('says what it could not place instead of dropping it quietly', () => {
    /*
     * A structure built around a comparison table has a slot for the
     * table's first row; a page with no comparison block has nowhere to put
     * it. Silently dropping the line is how a seller comes to believe the
     * model answered badly — so it comes back named, and the panel prints
     * it with «أضف القسم ثم اطلب مرّة ثانية».
     */
    const slot = STRUCTURE_PROBLEM_SOLUTION.slots[0];
    const wanted = STRUCTURE_PROBLEM_SOLUTION.sequence[slot.at];
    // A page with every block EXCEPT the one that slot needs.
    const page = pageFromStructure().filter((s) => s.type !== wanted);

    const { placed, unplaced, empty } = applyCopyToSections({
      sections: page,
      structure: STRUCTURE_PROBLEM_SOLUTION,
      copy: copyIn({ [slot.key]: 'عنوان بلا بيت' }),
      dialect: 'levantine',
    });

    expect(placed).toEqual([]);
    expect(empty).toBe(true);
    expect(unplaced.map((u) => u.slotKey)).toContain(slot.key);
    expect(unplaced[0].reason).toBe('no-such-block');
    expect(unplaced[0].slotLabel, 'الخانة رجعت بلا اسم يقرأه البائع').toBe(slot.label);
  });

  it('writes only the slots the seller ticked', () => {
    const [a, b] = STRUCTURE_PROBLEM_SOLUTION.slots;
    const { placed } = applyCopyToSections({
      sections: pageFromStructure(),
      structure: STRUCTURE_PROBLEM_SOLUTION,
      copy: copyIn({ [a.key]: 'واحد', [b.key]: 'تنين' }),
      dialect: 'levantine',
      only: [a.key],
    });
    expect(placed.map((p) => p.slotKey)).toEqual([a.key]);
  });

  it('cuts to the limit the slot was written under, and never drops the line', () => {
    const slot = STRUCTURE_PROBLEM_SOLUTION.slots[0];
    const long = 'ا'.repeat(slot.max + 40);
    const { placed } = applyCopyToSections({
      sections: pageFromStructure(),
      structure: STRUCTURE_PROBLEM_SOLUTION,
      copy: copyIn({ [slot.key]: long }),
      dialect: 'levantine',
    });
    expect([...placed[0].text].length, 'النصّ طلع أطول من حدّ الخانة').toBe(slot.max);
  });

  it('falls back to simplified standard Arabic, like every other reader of a slot', () => {
    // A market with no copy written yet gets the `msa` line rather than an
    // empty block — the same rule `copyIn` gives the public renderer, so
    // the editor and the page cannot disagree about what is written.
    const slot = STRUCTURE_PROBLEM_SOLUTION.slots[0];
    const { placed } = applyCopyToSections({
      sections: pageFromStructure(),
      structure: STRUCTURE_PROBLEM_SOLUTION,
      copy: { [slot.key]: { msa: 'نصٌّ بالفصحى' } },
      dialect: 'egyptian',
    });
    expect(placed[0]?.text).toBe('نصٌّ بالفصحى');
  });

  it('and an empty proposal changes nothing at all', () => {
    const before = pageFromStructure();
    const { sections, placed, empty } = applyCopyToSections({
      sections: before,
      structure: STRUCTURE_PROBLEM_SOLUTION,
      copy: {},
      dialect: 'levantine',
    });
    expect(placed).toEqual([]);
    expect(empty, 'اقتراحٌ فاضي ما قال إنه فاضي').toBe(true);
    expect(sections).toEqual(before);
  });
});

describe('every shipped structure', () => {
  /**
   * The ten are data, and data is where this breaks: a slot whose `field`
   * names something its block does not have would be reported as unplaceable
   * on a page built from that very structure — which is the one page it is
   * guaranteed to fit. So the whole catalogue is swept rather than the one
   * structure the tests above read.
   */
  it('fits the page it builds, with nothing left over', () => {
    for (const structure of LANDING_STRUCTURES) {
      const page = structureToSections(structure, {}, 'levantine', newSection);
      const copy = copyIn(Object.fromEntries(structure.slots.map((s) => [s.key, 'نص'])));
      const { placed, unplaced, sections } = applyCopyToSections({
        sections: page,
        structure,
        copy,
        dialect: 'levantine',
      });
      expect(unplaced, `${structure.id}: خانات ما لقت قسمها بصفحتها نفسها`).toEqual([]);
      expect(placed.length, `${structure.id}: ما كُتبت كل الخانات`).toBe(structure.slots.length);
      expect(sameArrangement(page, sections), `${structure.id}: الترتيب تغيّر`).toBe(true);
    }
  });

  it('and writes the same words the create dialog would', () => {
    /**
     * ONE ANSWER, TWO DOORS. A seller who asks for copy in the create dialog
     * and a seller who asks for it in the editor must get the same sentence
     * in the same place — otherwise «اقتراح» means two different things
     * depending on which screen somebody happened to be on.
     *
     * `structureToSections` is the dialog's path and this is the editor's,
     * so the two are run over the same proposal and compared field by field.
     */
    for (const structure of LANDING_STRUCTURES) {
      const words = Object.fromEntries(
        structure.slots.map((s, i) => [s.key, `خانة رقم ${i + 1}`])
      );
      const fromDialog = structureToSections(structure, copyIn(words), 'levantine', newSection);
      const { sections: fromEditor } = applyCopyToSections({
        sections: structureToSections(structure, {}, 'levantine', newSection),
        structure,
        copy: copyIn(words),
        dialect: 'levantine',
      });

      // Ids and look are per-section and generated, so what is compared is
      // the CONTENT: every field except the identity the two cannot share.
      const strip = (list: LandingSection[]) =>
        list.map((s) => {
          const { id: _id, ...rest } = s as Record<string, unknown> & { id: string };
          return rest;
        });
      expect(strip(fromEditor), `${structure.id}: البابان كتبوا نصّين مختلفين`).toEqual(
        strip(fromDialog)
      );
    }
  });
});

describe('the arrangement check itself', () => {
  it('sees a block that went, one that arrived, and one that moved', () => {
    const page = pageFromStructure();
    expect(sameArrangement(page, page)).toBe(true);
    expect(sameArrangement(page, page.slice(1)), 'قسمٌ ناقص ما انكشف').toBe(false);
    expect(
      sameArrangement(page, [...page, newSection('text')]),
      'قسمٌ زايد ما انكشف'
    ).toBe(false);
    const swapped = [...page];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    expect(sameArrangement(page, swapped), 'قسمان تبادلا مكانهما ما انكشف').toBe(false);
  });

  it('and a block that was switched off', () => {
    // Hiding a block is an arrangement change a shopper feels: the section
    // stops being drawn. A proposal has no business doing it.
    const page = pageFromStructure();
    const hidden = structuredClone(page);
    hidden[1] = { ...hidden[1], enabled: !hidden[1].enabled } as LandingSection;
    expect(sameArrangement(page, hidden), 'قسمٌ انطفأ ما انكشف').toBe(false);
  });
});
