import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { readOrderPage } from './paged-read';

/**
 * ONE PAGE OF ORDERS, AND THE COUNT THE PAGER NEEDS.
 *
 * The returns and tracking lists read their pages through this; the claims are the ones a pager lives or dies by —
 * that the count and the rows are asked of the SAME question, that an empty list is one empty page, and that a page
 * is a place: the right rows, in the order the caller gave, with the last page answered when the asked one is gone.
 */

type Keep = (n: number) => boolean;

/** A database of `size` rows numbered 0..size−1 that answers `count` and `findMany` for whatever `where` it is handed. */
function dbOf(size: number) {
  const rows = Array.from({ length: size }, (_, i) => ({ id: `o${String(i).padStart(3, '0')}` }));
  const count = vi.fn(async ({ where }: { where: { keep?: Keep } }) => rows.filter((_, i) => (where.keep ?? (() => true))(i)).length);
  const findMany = vi.fn(async ({ where, skip, take }: { where: { keep?: Keep }; skip: number; take: number; orderBy?: unknown; select?: unknown }) =>
    rows.filter((_, i) => (where.keep ?? (() => true))(i)).slice(skip, skip + take)
  );
  return { db: { order: { count, findMany } } as unknown as Parameters<typeof readOrderPage>[0], count, findMany };
}

const select = { id: true } as Prisma.OrderSelect;
const orderBy: Prisma.OrderOrderByWithRelationInput[] = [{ createdAt: 'asc' }, { id: 'asc' }];
const read = (db: Parameters<typeof readOrderPage>[0], page: number, limit = 25, where: Prisma.OrderWhereInput = {}) =>
  readOrderPage<{ id: string }>(db, { where, orderBy, page, limit, select });

describe('the question', () => {
  it('— the count and the rows are asked of the SAME where, handed over untouched', async () => {
    const { db, count, findMany } = dbOf(60);
    const where = { companyId: 'c1', keep: () => true } as unknown as Prisma.OrderWhereInput;
    await read(db, 1, 25, where);
    expect(count.mock.calls[0][0].where).toBe(where);
    expect(findMany.mock.calls[0][0].where).toBe(where);
  });

  it('and the order and the selection are the caller’s, unchanged', async () => {
    const { db, findMany } = dbOf(10);
    await read(db, 1);
    expect(findMany.mock.calls[0][0].orderBy).toBe(orderBy);
    expect(findMany.mock.calls[0][0].select).toBe(select);
  });
});

describe('a page is a place', () => {
  it('— 25 from the start of the page asked for: page three of ten at 10 skips twenty and takes ten', async () => {
    const { db, findMany } = dbOf(100);
    const p = await read(db, 3, 10);
    expect(findMany.mock.calls[0][0]).toMatchObject({ skip: 20, take: 10 });
    expect(p.rows.map((r) => r.id)).toEqual(Array.from({ length: 10 }, (_, i) => `o${String(20 + i).padStart(3, '0')}`));
    expect(p).toMatchObject({ total: 100, page: 3, limit: 10, totalPages: 10 });
  });

  it('and consecutive pages never repeat a row or skip one', async () => {
    const { db } = dbOf(57);
    const seen: string[] = [];
    for (let page = 1; page <= 3; page++) seen.push(...(await read(db, page, 20)).rows.map((r) => r.id));
    expect(seen).toHaveLength(57);
    expect(new Set(seen).size).toBe(57);
  });

  it('and the last page may be short: 60 rows at 25 is three pages, the third holding ten', async () => {
    const { db } = dbOf(60);
    const p = await read(db, 3);
    expect(p).toMatchObject({ total: 60, page: 3, totalPages: 3 });
    expect(p.rows).toHaveLength(10);
  });

  it('and exactly a full page is one page, not two', async () => {
    const { db } = dbOf(25);
    expect(await read(db, 1)).toMatchObject({ totalPages: 1, page: 1 });
    expect((await read(db, 1)).rows).toHaveLength(25);
  });
});

describe('a page that is not there', () => {
  it('— past the end is answered with the LAST page, and says so — a bookmark of a queue that was worked down is not an empty screen', async () => {
    const { db, findMany } = dbOf(60);
    const p = await read(db, 99_999);
    expect(p.page).toBe(3);
    expect(findMany.mock.calls[0][0]).toMatchObject({ skip: 50, take: 25 });
    expect(p.rows).toHaveLength(10);
  });

  it('and before the start is the first', async () => {
    const { db, findMany } = dbOf(60);
    for (const page of [0, -4]) {
      const p = await read(db, page);
      expect(p.page, String(page)).toBe(1);
      expect(findMany.mock.calls.at(-1)![0]).toMatchObject({ skip: 0 });
    }
  });

  it('and an empty list is one empty page, never «صفحة 1 من 0»', async () => {
    const { db } = dbOf(0);
    expect(await read(db, 1)).toEqual({ total: 0, page: 1, limit: 25, totalPages: 1, rows: [] });
    expect(await read(db, 7)).toMatchObject({ page: 1, totalPages: 1 });
  });

  it('and what was chosen can empty the list while the scope still holds rows', async () => {
    const { db } = dbOf(40);
    const none = { keep: () => false } as unknown as Prisma.OrderWhereInput;
    expect(await read(db, 1, 25, none)).toMatchObject({ total: 0, totalPages: 1, rows: [] });
  });
});
