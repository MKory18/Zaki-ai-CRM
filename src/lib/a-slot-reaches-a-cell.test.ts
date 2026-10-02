import { describe, expect, it } from 'vitest';
import { LANDING_STRUCTURES } from './landing-structures';
import { structureToSections, textSlotSchema } from './landing-structure';
import { newSection, type SectionType } from './landing-sections';

/**
 * «بدي الأكثر فاعلية والأنسب — حلّ التناقض.»
 *
 * THE GAP: a slot addressed one named field of one block — `sections[2].body`
 * — and the block that MAKES five of the ten structures what they are holds a
 * LIST: the comparison's rows, the timeline's points, the quiz's questions,
 * the objections and their answers, the mechanism's steps. Nothing could fill
 * them, an empty block draws nothing, and «رحلة التحوّل» came out as a page
 * with no timeline in it.
 *
 * THE RESOLUTION, and why it is the smallest one available: the ADDRESS grew
 * a row and a column — `points.0.when` — and nothing else changed. No new
 * kind of slot, no new block, no new editor, no shipped copy. A slot is still
 * one piece of text with its own purpose, its own «ممنوع» and its own
 * example, which is exactly what a cell of those tables is: «الأسبوع الأول»
 * wants a different example from «الأسبوع الثامن».
 *
 * That keeps the brief's own rule — «أقسام المكتبة بتنستخدم كما هي؛ ما في
 * قسم بينبنى من جديد لبنية» — and keeps its creation flow, which promises a
 * page that comes out complete.
 */

/** The five, and the list each is built around. */
const LIST_BLOCKS: Record<string, { type: SectionType; field: string }> = {
  'us-vs-them': { type: 'comparison', field: 'rows' },
  transformation: { type: 'timeline', field: 'points' },
  quiz: { type: 'quiz', field: 'questions' },
  objections: { type: 'objections', field: 'items' },
  mechanism: { type: 'mechanism', field: 'steps' },
};

/** Fill every slot with its own example — what a diligent seller produces. */
function pageFrom(id: string) {
  const s = LANDING_STRUCTURES.find((x) => x.id === id)!;
  const copy = Object.fromEntries(s.slots.map((slot) => [slot.key, { levantine: slot.example }]));
  return {
    structure: s,
    page: structureToSections(s, copy, 'levantine', newSection) as unknown as Record<string, unknown>[],
  };
}

describe('the address reaches a cell', () => {
  it('accepts a plain field and a row-and-column, and nothing stranger', () => {
    /*
     * `key` IS TWO CHARACTERS BECAUSE THE SCHEMA SAYS SO.
     *
     * The first version wrote `key: 'k'`, which fails a 2–30 regex — so every
     * case below came back false for a reason that had nothing to do with the
     * field being tested, including the ones that were supposed to pass. This
     * repository has now recorded that trap twice: a fixture invalid for an
     * UNRELATED reason turns a test into a coin that always lands tails.
     */
    const ok = (field: string) =>
      textSlotSchema.safeParse({
        key: 'cell', label: 'لافتة', purpose: 'غرضٌ مكتوبٌ بما يكفي', avoid: 'ممنوعٌ مكتوبٌ بما يكفي',
        example: 'مثال', max: 40, at: 0, field,
      }).success;

    // And the fixture itself is valid, so a `false` below means the FIELD.
    expect(ok('headline')).toBe(true);

    expect(ok('headline')).toBe(true);
    expect(ok('points.0.when')).toBe(true);
    expect(ok('rows.2.theirs')).toBe(true);
    // Not a free-form path: no deeper nesting, no array of arrays, no
    // traversal out of the block.
    expect(ok('points.0.when.extra')).toBe(false);
    expect(ok('points..when')).toBe(false);
    expect(ok('points.0')).toBe(false);
    expect(ok('../theme')).toBe(false);
  });
});

describe('the five structures come out whole', () => {
  it.each(Object.keys(LIST_BLOCKS))('%s draws the block that defines it', (id) => {
    const { page } = pageFrom(id);
    const block = page.find((b) => b.type === LIST_BLOCKS[id].type) as Record<string, unknown>;
    expect(block, `${id}: الكتلة غائبة عن التسلسل`).toBeTruthy();

    const rows = block[LIST_BLOCKS[id].field] as Record<string, string>[];
    expect(Array.isArray(rows), `${id}: ${LIST_BLOCKS[id].field} ليست قائمة`).toBe(true);
    expect(rows.length, `${id}: القائمة فارغة — الصفحة بلا الكتلة التي تميّزها`).toBeGreaterThanOrEqual(2);

    /*
     * EVERY CELL THE STRUCTURE DECLARED IS THERE, AND CARRIES WORDS.
     *
     * The first version walked `Object.entries(row)` and asserted each value
     * was non-empty — which passes for a row that is MISSING a column, and
     * passes trivially for a row that is `{}`. Two mutations proved it: one
     * made each cell overwrite the row instead of merging into it, the other
     * threw the list away on every write. Both left rows with one column or
     * none, and both went unnoticed.
     *
     * So the expectation comes from the structure: these are the cells it
     * says it writes, and every one of them must be in the page.
     */
    const { structure } = pageFrom(id);
    const want = new Map<number, string[]>();
    for (const slot of structure.slots) {
      const [key, index, column] = slot.field.split('.');
      if (index === undefined || key !== LIST_BLOCKS[id].field) continue;
      want.set(Number(index), [...(want.get(Number(index)) ?? []), column]);
    }
    expect(want.size, `${id}: البنية لا تصرّح بأيّ خليّة`).toBeGreaterThanOrEqual(2);

    for (const [index, columns] of want) {
      const row = rows[index];
      expect(row, `${id}: الصفّ ${index} غير موجود`).toBeTruthy();
      // CONTAINS, not equals: a row keeps the other columns the library's own
      // seed gave it — a quiz question arrives with its `options` array, and
      // the structure writes only the `ask`. What must not happen is a
      // declared column going missing, which is what the two mutations did.
      expect(Object.keys(row), `${id}: أعمدة الصفّ ${index}`).toEqual(expect.arrayContaining([...columns]));
      for (const col of columns) {
        expect(String(row[col] ?? '').trim().length, `${id}: ${index}.${col} فارغ`).toBeGreaterThan(0);
      }
    }
  });

  it('and a seller who fills half of a list gets half a list, not a blank row', () => {
    // The row is created when it is written to. A table that drew a third
    // empty line because the structure declared three is worse than a table
    // with two lines in it.
    const s = LANDING_STRUCTURES.find((x) => x.id === 'transformation')!;
    const half = Object.fromEntries(
      ['stage1When', 'stage1What', 'stage2When', 'stage2What'].map((k) => [
        k,
        { levantine: s.slots.find((x) => x.key === k)!.example },
      ])
    );
    const page = structureToSections(s, half, 'levantine', newSection) as unknown as Record<string, unknown>[];
    const timeline = page.find((b) => b.type === 'timeline') as { points: unknown[] };
    expect(timeline.points).toHaveLength(2);
  });

  it('and a plain field still lands where it always did', () => {
    const { page } = pageFrom('transformation');
    const hero = page[0] as Record<string, string>;
    expect(hero.type).toBe('hero');
    expect(hero.headline.length).toBeGreaterThan(0);
  });
});

describe('every cell is guided on its own', () => {
  it.each(Object.keys(LIST_BLOCKS))('%s: no two cells share an example or a warning', (id) => {
    // The whole reason for one-slot-per-cell rather than one «املأ الجدول»:
    // the first stage must promise little and the last must not promise a
    // cure. Repeating a warning turns a guide back into a house rule.
    const { structure } = pageFrom(id);
    const cells = structure.slots.filter((s) => s.field.includes('.'));
    expect(cells.length, `${id}: لا خانات خلايا`).toBeGreaterThanOrEqual(3);
    expect(new Set(cells.map((c) => c.avoid)).size).toBe(cells.length);
    expect(new Set(cells.map((c) => c.example)).size).toBe(cells.length);
    expect(new Set(cells.map((c) => c.label)).size).toBe(cells.length);
  });

  it('and no two slots in one structure write the same cell', () => {
    // The contract's duplicate-seat check does this for `at.field`, and a
    // cell address is a field — so it covers the new shape with no change.
    for (const s of LANDING_STRUCTURES) {
      const seats = s.slots.map((x) => `${x.at}.${x.field}`);
      expect(new Set(seats).size, s.id).toBe(seats.length);
    }
  });
});
