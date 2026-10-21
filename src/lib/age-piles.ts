import type { Prisma } from '@prisma/client';

/**
 * HOW LONG A PARCEL HAS WAITED, IN FOUR PILES — READ TWICE, AND THE TWO READINGS AGREE.
 *
 * The returns desk asks «what has been sitting for over a week?», and so does the shipment follow-up. «منذ 2–3 أيام (4)»
 * beside a word is a promise that four rows will appear when it is chosen, so the number is asked of the database
 * (`ageWhereOn`) and the label on each row is read in memory (`sinceOf` → `daysWaitedOf` → `ageOf`). They are written
 * side by side so they cannot drift; `returns-filters.test.ts` runs both over every boundary and every column.
 *
 * The piles and their lines are written ONCE here. What differs between the two lists is only WHERE a parcel's moment
 * lives: the returns desk reads the first of four columns that has a date (`returnedAt`, `failedAt`, `deliveredAt`,
 * `updatedAt` — one per state a return can be in), the follow-up reads `shippedAt`. That is the `columns` argument.
 *
 * Whole days, as `transitStatus` counts them: a parcel 47 hours old is one day old, not two. An equal instant falls on
 * the OLDER side of every line, exactly as `floor` puts it.
 *
 * This module imports nothing from the server: the screens read it too.
 */

const DAY = 86_400_000;

export const AGES = ['fresh', 'few', 'week', 'old'] as const;
export type Age = (typeof AGES)[number];
/** The lines between the piles, in whole days: 0–1 · 2–3 · 4–7 · 8 and over. */
export const AGE_FROM: Record<Age, number> = { fresh: 0, few: 2, week: 4, old: 8 };
export const AGE_AR: Record<Age, string> = {
  fresh: 'اليوم أو أمس',
  few: 'منذ 2–3 أيام',
  week: 'منذ 4–7 أيام',
  old: 'أكثر من أسبوع',
};
export const isAge = (v: unknown): v is Age => typeof v === 'string' && (AGES as readonly string[]).includes(v);

type DateLike = Date | string | null | undefined;
type Where = Prisma.OrderWhereInput;

const asDate = (v: DateLike): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

/** The moment of a parcel: the first of `columns` that has a date. A parcel with none has no moment. */
export function sinceOf<K extends string>(row: Partial<Record<K, DateLike>>, columns: readonly K[]): Date | null {
  for (const col of columns) {
    const d = asDate(row[col]);
    if (d) return d;
  }
  return null;
}

/** Whole days a parcel has waited. A parcel with no moment at all has no age. */
export function daysWaitedOf(since: Date | null, now: Date): number | null {
  if (!since) return null;
  return Math.floor((now.getTime() - since.getTime()) / DAY);
}

export function ageOf(days: number | null): Age | null {
  if (days === null) return null;
  if (days >= AGE_FROM.old) return 'old';
  if (days >= AGE_FROM.week) return 'week';
  if (days >= AGE_FROM.few) return 'few';
  return 'fresh';
}

/**
 * «The moment falls in this range», as `COALESCE(...columns)` would say it: the first column that has a value is the one
 * that is compared, so each term also says that the columns before it are empty.
 */
const sinceIn = (columns: readonly string[], range: { gt?: Date; lte?: Date }): Where => ({
  OR: columns.map((col, i) => ({
    AND: [...columns.slice(0, i).map((earlier) => ({ [earlier]: null })), { [col]: range }],
  })) as Where[],
});

/**
 * THE DATABASE'S READING OF EACH PILE.
 *
 * A parcel is `d` whole days old when `d·DAY <= now − since < (d+1)·DAY`, so «two to three days» is
 * `now − 4·DAY < since <= now − 2·DAY`.
 */
export function ageWhereOn(columns: readonly string[], age: Age, now: Date): Where {
  const at = (days: number) => new Date(now.getTime() - days * DAY);
  switch (age) {
    case 'fresh':
      return sinceIn(columns, { gt: at(AGE_FROM.few) });
    case 'few':
      return sinceIn(columns, { gt: at(AGE_FROM.week), lte: at(AGE_FROM.few) });
    case 'week':
      return sinceIn(columns, { gt: at(AGE_FROM.old), lte: at(AGE_FROM.week) });
    case 'old':
      return sinceIn(columns, { lte: at(AGE_FROM.old) });
  }
}
