import { describe, expect, it } from 'vitest';
import { moveAfterDrag, moveOffer, type Ranked } from './offer-order';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE ORDER OF A PRODUCT'S OFFERS — ONE MOVE FOR THE GRIP AND FOR THE ARROWS.
 *
 * The owner asked (21/10) for the offers to be reordered by dragging. The order is what a customer is offered first, so a move
 * has to be exactly what it says: the offer lands where it was dropped, nothing else changes place, only the offers whose stored
 * number is wrong are written, and a list that already carried ties or gaps comes out numbered 0 … n-1.
 * ═══════════════════════════════════════════════════════════════════════
 */

const list = (...orders: number[]): Ranked[] => orders.map((sortOrder, i) => ({ id: `o${i}`, sortOrder }));
const ids = (m: { ids: string[] } | null) => m?.ids;
/** What the server holds after the writes — and the order it would read them back in (sortOrder asc, a tie by arrival). */
function applied(before: Ranked[], m: { writes: Array<{ id: string; sortOrder: number }> }): Ranked[] {
  const w = new Map(m.writes.map((x) => [x.id, x.sortOrder]));
  return before.map((o) => ({ id: o.id, sortOrder: w.get(o.id) ?? o.sortOrder }));
}
const readBack = (rows: Ranked[]) => [...rows].sort((a, b) => a.sortOrder - b.sortOrder).map((o) => o.id);

describe('moving one offer', () => {
  it('— one place down is the swap the arrows always made: two writes, the two offers that traded places', () => {
    const m = moveOffer(list(0, 1, 2), 0, 1)!;
    expect(m.ids).toEqual(['o1', 'o0', 'o2']);
    expect(m.writes).toEqual([
      { id: 'o1', sortOrder: 0 },
      { id: 'o0', sortOrder: 1 },
    ]);
  });

  it('and one place up is the same, from the other side', () => {
    const m = moveOffer(list(0, 1, 2), 2, 1)!;
    expect(m.ids).toEqual(['o0', 'o2', 'o1']);
    expect(m.writes).toEqual([
      { id: 'o2', sortOrder: 1 },
      { id: 'o1', sortOrder: 2 },
    ]);
  });

  it('and a long drag lands where it was dropped — the first offer to the end moves everyone else up by one', () => {
    const m = moveOffer(list(0, 1, 2, 3), 0, 3)!;
    expect(m.ids).toEqual(['o1', 'o2', 'o3', 'o0']);
    expect(m.writes.map((w) => [w.id, w.sortOrder])).toEqual([
      ['o1', 0],
      ['o2', 1],
      ['o3', 2],
      ['o0', 3],
    ]);
  });

  it('and the last offer to the front moves everyone else down by one', () => {
    const m = moveOffer(list(0, 1, 2, 3), 3, 0)!;
    expect(m.ids).toEqual(['o3', 'o0', 'o1', 'o2']);
    expect(m.writes.map((w) => [w.id, w.sortOrder])).toEqual([
      ['o3', 0],
      ['o0', 1],
      ['o1', 2],
      ['o2', 3],
    ]);
  });

  it('and an offer that already holds its new place is not written', () => {
    // 0 and 1 trade places; the third offer is untouched, so it is not sent.
    const m = moveOffer(list(0, 1, 2), 0, 1)!;
    expect(m.writes.map((w) => w.id)).not.toContain('o2');
  });

  it('and it never loses or doubles an offer — a walk of 300 moves over lists of every size keeps the same set', () => {
    let seed = 11;
    const next = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
    for (let size = 2; size <= 8; size++) {
      let rows = list(...Array.from({ length: size }, (_, i) => i));
      for (let step = 0; step < 300; step++) {
        const m = moveOffer(rows, next(size), next(size));
        if (!m) continue;
        rows = m.ids.map((id) => rows.find((o) => o.id === id)!);
        expect(rows).toHaveLength(size);
        expect(new Set(rows.map((o) => o.id)).size).toBe(size);
      }
    }
  });
});

describe('what is written', () => {
  it('— after the writes the server reads the list back in exactly the order the move showed, from a list that was numbered 0 … n-1', () => {
    for (let from = 0; from < 5; from++) {
      for (let to = 0; to < 5; to++) {
        const before = list(0, 1, 2, 3, 4);
        const m = moveOffer(before, from, to);
        if (!m) continue;
        expect(readBack(applied(before, m)), `${from}→${to}`).toEqual(m.ids);
      }
    }
  });

  it('and so does a list whose stored numbers have gaps — a move numbers it 0 … n-1', () => {
    const before = list(0, 5, 9, 40);
    const m = moveOffer(before, 3, 1)!;
    const after = applied(before, m);
    expect(readBack(after)).toEqual(m.ids);
    expect(after.map((o) => o.sortOrder).sort((a, b) => a - b), 'تبقّت فجوة').toEqual([0, 1, 2, 3]);
  });

  it('and so does a list of TIES — offers made by a door that never numbered them are all stored 0', () => {
    const before = list(0, 0, 0, 0);
    const m = moveOffer(before, 0, 3)!;
    const after = applied(before, m);
    // The tie is gone: four different numbers, and the order is the one that was shown.
    expect(new Set(after.map((o) => o.sortOrder)).size).toBe(4);
    expect(readBack(after)).toEqual(m.ids);
  });

  it('and a number that already equals the offer’s new place is left alone, tie or no tie', () => {
    // o0 is stored 0 and lands at 0 again after the move below, so only the two that travelled are written.
    const m = moveOffer(list(0, 0, 0), 2, 1)!;
    expect(m.ids).toEqual(['o0', 'o2', 'o1']);
    expect(m.writes.map((w) => w.id)).toEqual(['o2', 'o1']);
  });

  it('and every number written is a whole number from 0 up to the list’s length less one — what the door accepts', () => {
    for (const n of [2, 3, 6, 12]) {
      const m = moveOffer(list(...Array.from({ length: n }, () => 0)), 0, n - 1)!;
      for (const w of m.writes) {
        expect(Number.isInteger(w.sortOrder)).toBe(true);
        expect(w.sortOrder).toBeGreaterThanOrEqual(0);
        expect(w.sortOrder).toBeLessThanOrEqual(n - 1);
      }
    }
  });
});

describe('and a move that goes nowhere is not a move', () => {
  it.each([
    ['the same place', 1, 1],
    ['before the start', 1, -1],
    ['past the end', 1, 99],
    ['one place past the end', 1, 3],
    ['from before the start', -1, 1],
    ['from past the end', 99, 1],
    ['from one place past the end', 3, 1],
    ['from a fraction', 0.5, 1],
    ['to a fraction', 0, 1.5],
    ['from nothing', Number.NaN, 1],
    ['to nothing', 1, Number.NaN],
  ])('— %s', (_name, from, to) => {
    expect(moveOffer(list(0, 1, 2), from, to)).toBeNull();
  });

  it('and a list of none, or of one, has nowhere to move', () => {
    expect(moveOffer([], 0, 0)).toBeNull();
    expect(moveOffer(list(0), 0, 0)).toBeNull();
  });

  it('and the list it was given is never changed', () => {
    const rows = list(0, 1, 2);
    const copy = JSON.parse(JSON.stringify(rows));
    moveOffer(rows, 0, 2);
    expect(rows).toEqual(copy);
  });
});

describe('what a finished drag asks for', () => {
  const rows = list(0, 1, 2, 3);

  it('— the offer that was carried lands on the place of the one it was dropped on', () => {
    expect(moveAfterDrag(rows, { active: { id: 'o0' }, over: { id: 'o2' } })).toEqual(moveOffer(rows, 0, 2));
    expect(ids(moveAfterDrag(rows, { active: { id: 'o3' }, over: { id: 'o1' } }))).toEqual(['o0', 'o3', 'o1', 'o2']);
  });

  it('and is the same move the arrows make — a drop on the neighbour is one arrow press', () => {
    expect(moveAfterDrag(rows, { active: { id: 'o1' }, over: { id: 'o2' } })).toEqual(moveOffer(rows, 1, 2));
    expect(moveAfterDrag(rows, { active: { id: 'o2' }, over: { id: 'o1' } })).toEqual(moveOffer(rows, 2, 1));
  });

  it.each([
    // Carried from the THIRD place: a drop on nothing must not read as «to the first» (from the first it would be the same place either way).
    ['a drop on nothing', { active: { id: 'o2' }, over: null }],
    ['a drop on itself', { active: { id: 'o1' }, over: { id: 'o1' } }],
    ['a drop on something that is not in this list', { active: { id: 'o0' }, over: { id: 'stranger' } }],
    ['an offer from elsewhere dropped here', { active: { id: 'stranger' }, over: { id: 'o1' } }],
  ])('and %s moves nothing', (_name, end) => {
    expect(moveAfterDrag(rows, end)).toBeNull();
  });

  it('and a numeric id from the library is read as the string it stands for', () => {
    const numbered: Ranked[] = [
      { id: '1', sortOrder: 0 },
      { id: '2', sortOrder: 1 },
    ];
    expect(ids(moveAfterDrag(numbered, { active: { id: 1 }, over: { id: 2 } }))).toEqual(['2', '1']);
  });
});
