import { describe, expect, it } from 'vitest';

/**
 * Dropping a block on a position.
 *
 * This is the rule the builder's drag uses, and it is the one that is easy
 * to get wrong: a SWAP is fine for nudging a neighbour and wrong for a
 * drag. Dropping block 8 onto position 2 should slide 2–7 down; swapping
 * would trade 8 with 2 and scramble everything between them.
 */

function moveTo<T>(list: T[], from: number, to: number): T[] {
  if (from === to || to < 0 || to >= list.length) return list;
  const next = [...list];
  const [lifted] = next.splice(from, 1);
  next.splice(to, 0, lifted);
  return next;
}

const abc = ['a', 'b', 'c', 'd', 'e'];

describe('reordering by drag', () => {
  it('slides the rest down when something moves up', () => {
    // Not a swap: b, c and d keep their order under the lifted block.
    expect(moveTo(abc, 3, 1)).toEqual(['a', 'd', 'b', 'c', 'e']);
  });

  it('slides the rest up when something moves down', () => {
    expect(moveTo(abc, 1, 3)).toEqual(['a', 'c', 'd', 'b', 'e']);
  });

  it('moves one step without disturbing anything else', () => {
    expect(moveTo(abc, 0, 1)).toEqual(['b', 'a', 'c', 'd', 'e']);
  });

  it('does nothing when dropped where it already is', () => {
    expect(moveTo(abc, 2, 2)).toEqual(abc);
  });

  it('refuses to drop outside the list', () => {
    // The keyboard hits this at both ends: ArrowUp on the first row.
    expect(moveTo(abc, 0, -1)).toEqual(abc);
    expect(moveTo(abc, 4, 5)).toEqual(abc);
  });

  it('keeps every block — reordering never loses one', () => {
    const after = moveTo(abc, 4, 0);
    expect([...after].sort()).toEqual([...abc].sort());
    expect(after).toHaveLength(abc.length);
  });
});
