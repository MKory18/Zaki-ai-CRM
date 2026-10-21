import { describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { AGES, AGE_AR, AGE_FROM, ageOf, ageWhereOn, daysWaitedOf, isAge, sinceOf, type Age } from './age-piles';
import { repoFile, stripComments } from './guard-source';

/**
 * THE FOUR PILES, FOR ANY LIST THAT ASKS «HOW LONG HAS IT WAITED».
 *
 * `returns-filters.test.ts` holds them over the four columns of a return. What is held here is that the piles are not
 * a returns thing: a list that reads ONE column — the shipment follow-up reads `shippedAt` — gets the same lines, the
 * same words, and a database reading that agrees with the row's at every boundary.
 */

const NOW = new Date('2026-10-21T12:00:00.000Z');
const DAY = 86_400_000;
const at = (ms: number) => new Date(NOW.getTime() + ms);

type Row = Record<string, unknown>;

function matches(where: Prisma.OrderWhereInput, row: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'AND') return (cond as Prisma.OrderWhereInput[]).every((w) => matches(w, row));
    if (key === 'OR') return (cond as Prisma.OrderWhereInput[]).some((w) => matches(w, row));
    const value = row[key];
    if (cond === null) return value === null;
    return Object.entries(cond as Record<string, unknown>).every(([op, arg]) => {
      if (!(value instanceof Date)) return false;
      if (op === 'lte') return value.getTime() <= (arg as Date).getTime();
      if (op === 'gt') return value.getTime() > (arg as Date).getTime();
      throw new Error(`the evaluator does not know «${op}»`);
    });
  });
}

const OFFSETS = [0, 1, DAY - 1, DAY, 2 * DAY - 1, 2 * DAY, 4 * DAY - 1, 4 * DAY, 8 * DAY - 1, 8 * DAY, 8 * DAY + 1, 40 * DAY].map((ms) => -ms);
const pilesOf = (columns: string[], row: Row): Age[] => AGES.filter((a) => matches(ageWhereOn(columns, a, NOW), row));

describe('a list that reads ONE column', () => {
  it.each(OFFSETS)('— a parcel shipped %i ms ago is in exactly the pile its days say', (offset) => {
    const row = { shippedAt: at(offset) };
    expect(pilesOf(['shippedAt'], row)).toEqual([ageOf(daysWaitedOf(sinceOf(row, ['shippedAt']), NOW))]);
  });

  it('and a parcel with no shipping date is in no pile, and has no age — it is not «fresh» and it is not «old»', () => {
    const row = { shippedAt: null };
    expect(pilesOf(['shippedAt'], row)).toEqual([]);
    expect(sinceOf(row, ['shippedAt'])).toBeNull();
    expect(ageOf(daysWaitedOf(null, NOW))).toBeNull();
  });

  it('and the lines are where the returns desk has them: an equal instant is on the OLDER side', () => {
    expect(pilesOf(['shippedAt'], { shippedAt: at(-2 * DAY) })).toEqual(['few']);
    expect(pilesOf(['shippedAt'], { shippedAt: at(-2 * DAY + 1) })).toEqual(['fresh']);
    expect(pilesOf(['shippedAt'], { shippedAt: at(-4 * DAY) })).toEqual(['week']);
    expect(pilesOf(['shippedAt'], { shippedAt: at(-8 * DAY) })).toEqual(['old']);
  });
});

describe('a list that reads several', () => {
  const cols = ['a', 'b', 'c'];

  it('— reads the FIRST that has a date, in the order given, in the row and in the database alike', () => {
    const early = at(-9 * DAY);
    const late = at(-DAY);
    expect(sinceOf({ a: late, b: early, c: early }, cols)).toEqual(late);
    expect(sinceOf({ a: null, b: late, c: early }, cols)).toEqual(late);
    expect(sinceOf({ b: late }, cols)).toEqual(late);
    expect(pilesOf(cols, { a: late, b: early, c: early })).toEqual(['fresh']);
    expect(pilesOf(cols, { a: null, b: early, c: late })).toEqual(['old']);
    expect(pilesOf(cols, { a: null, b: null, c: late })).toEqual(['fresh']);
  });

  it('and a string date reads like a Date, a bad one reads like none', () => {
    expect(sinceOf({ a: at(-3 * DAY).toISOString() }, cols)?.getTime()).toBe(at(-3 * DAY).getTime());
    expect(sinceOf({ a: 'not a date', b: at(-3 * DAY) }, cols)?.getTime()).toBe(at(-3 * DAY).getTime());
    expect(sinceOf({ a: 'not a date' }, cols)).toBeNull();
  });
});

describe('the piles themselves', () => {
  it('— four, growing, each with its own words, and «a pile» is only what the list says it is', () => {
    expect([...AGES]).toEqual(['fresh', 'few', 'week', 'old']);
    const lines = AGES.map((a) => AGE_FROM[a]);
    expect(lines).toEqual([0, 2, 4, 8]);
    expect(new Set(AGES.map((a) => AGE_AR[a])).size).toBe(4);
    expect(isAge('old')).toBe(true);
    for (const bad of ['', 'ancient', undefined, 8, null]) expect(isAge(bad), String(bad)).toBe(false);
  });

  it('and the module is safe for a screen to import: it reaches no server module', () => {
    const src = stripComments(repoFile('src/lib/age-piles.ts'));
    for (const forbidden of ["'./db'", "'@/lib/db'", 'next/server', 'next/headers']) expect(src, forbidden).not.toContain(forbidden);
  });
});
