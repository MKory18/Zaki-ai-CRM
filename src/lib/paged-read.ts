import type { Prisma } from '@prisma/client';
import type { db as Db } from './db';

/**
 * ONE PAGE OF ORDERS, AND THE COUNT THE PAGER NEEDS — ASKED OF THE SAME QUESTION.
 *
 * «صفحات + فلاتر + بحث» for four lists wrote this read four times: count the question, work out how many pages that
 * is, clamp the one that was asked for, take the rows. The postponed and winback lists each carry their own copy
 * (`postponed-list.ts`, `winback-list.ts`); the returns and tracking doors read through this one, and the other two
 * can move onto it without a change of behaviour.
 *
 * What it guarantees, and `paged-read.test.ts` holds:
 *
 *   • the count and the rows are asked with the SAME `where` — a pager that says «من 87» over a different list is two
 *     facts about two lists;
 *   • an empty list is one empty page, never «صفحة 1 من 0»;
 *   • a page past the end is answered with the LAST page, and `page` says so — the bookmark of a queue that has been
 *     worked down is not an empty screen;
 *   • a page before the start is the first; the rows start at `(page − 1) × limit` and there are at most `limit`;
 *   • the order is the caller's and must end in a unique column (the id) — two rows with the same date must not swap
 *     between page two and page three.
 */

type Client = Pick<typeof Db, 'order'>;

export interface OrderPage<Row> {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  rows: Row[];
}

export async function readOrderPage<Row>(
  db: Client,
  input: {
    where: Prisma.OrderWhereInput;
    orderBy: Prisma.OrderOrderByWithRelationInput[];
    page: number;
    limit: number;
    select: Prisma.OrderSelect;
  }
): Promise<OrderPage<Row>> {
  const total = await db.order.count({ where: input.where });
  const totalPages = Math.max(1, Math.ceil(total / input.limit));
  const page = Math.min(Math.max(input.page, 1), totalPages);
  const rows = (await db.order.findMany({
    where: input.where,
    orderBy: input.orderBy,
    skip: (page - 1) * input.limit,
    take: input.limit,
    select: input.select,
  })) as unknown as Row[];
  return { total, page, limit: input.limit, totalPages, rows };
}
