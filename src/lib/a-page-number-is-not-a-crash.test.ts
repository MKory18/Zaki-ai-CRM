import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readLimit, readPage } from './numeric-input';

/**
 * `?page=abc` TOOK THE SCREEN DOWN, AND NOBODY HAD RUN ONE TO SEE.
 *
 * Seven list endpoints read their paging with
 * `parseInt(searchParams.get('page') || '1', 10)`, which is `NaN` for
 * anything that is not written like a number, and then `skip: (page - 1) *
 * limit` — `NaN`. Three outcomes were plausible and only one is harmless: a
 * silent full scan, an empty page, or an error. MEASURED against this
 * database:
 *
 *     db.order.findMany({ skip: NaN, take: 25 })
 *       → PrismaClientValidationError: Argument `take` is missing.
 *
 * Client-side, before any SQL. `api-error.ts` may not echo a Prisma message
 * (it carries the server's absolute source paths), so it falls to the last
 * branch: **HTTP 500, «حدث خطأ داخلي»** — «an internal error, tell the
 * administrator» for one bad character in a URL.
 *
 * So the data is never read wrongly and nothing is ever written wrongly.
 * That is why these clamp rather than refuse, and the distinction from the
 * money rule is doing work: a bad price gets WRITTEN and is invisible
 * afterwards; a bad page number selects which rows to look at, is stored
 * nowhere, and the response reports the clamped `page` back, so the reader
 * can see where they are.
 */

const p = (qs: string) => new URLSearchParams(qs);

describe('a page number read loosely used to be NaN', () => {
  it('and this is the value that reached Prisma as `skip`', () => {
    const was = parseInt(p('page=abc').get('page') || '1', 10);
    expect(was).toBeNaN();
    expect((was - 1) * 25).toBeNaN();
    // And the four other inputs that got there the same way.
    expect(parseInt('', 10)).toBeNaN(); // ?page=
    expect(parseInt('undefined', 10)).toBeNaN(); // a client interpolating undefined
    expect(parseInt('null', 10)).toBeNaN();
    expect(parseInt('٣', 10)).toBeNaN(); // Arabic-Indic digits
  });

  it('and each of them is page one now, which is a page a person can be on', () => {
    for (const qs of ['page=abc', 'page=', 'page=undefined', 'page=null', 'page=٣', 'page=0x10']) {
      expect(readPage(p(qs)), qs).toBe(1);
    }
  });

  it('and a page that was asked for is the page that is read', () => {
    expect(readPage(p('page=7'))).toBe(7);
    expect(readPage(p('page= 7 '))).toBe(7);
    expect(readPage(p(''))).toBe(1);
  });

  it('and a page below one, or a fraction of a page, is pulled onto a real page', () => {
    expect(readPage(p('page=0'))).toBe(1);
    expect(readPage(p('page=-5'))).toBe(1);
    expect(readPage(p('page=2.9'))).toBe(2); // two and nine tenths of a page is page two
  });

  it('and a page number too large for a Prisma Int cannot produce the 500 by the other road', () => {
    // `skip` is an `Int`. An unbounded page times a 500-row page size would
    // pass 2³¹ and Prisma would refuse it — the same failure, differently
    // spelled.
    const page = readPage(p('page=99999999999999'));
    expect(page).toBe(1_000_000);
    expect((page - 1) * 500).toBeLessThan(2 ** 31 - 1);
  });
});

describe('a page size is bounded, and the bound is not optional', () => {
  it('falls back when it is absent or unreadable', () => {
    expect(readLimit(p(''), 25, 500)).toBe(25);
    for (const qs of ['limit=abc', 'limit=', 'limit=undefined', 'limit=0x10']) {
      expect(readLimit(p(qs), 25, 500), qs).toBe(25);
    }
  });

  it('and `users` had no ceiling at all, so this is the number that used to be asked for', () => {
    const was = parseInt(p('limit=100000').get('limit') || '25', 10);
    expect(was).toBe(100_000);
    expect(readLimit(p('limit=100000'), 25, 200)).toBe(200);
  });

  it('and never returns zero rows per page, which would make totalPages infinite', () => {
    expect(readLimit(p('limit=0'), 25, 500)).toBe(1);
    expect(readLimit(p('limit=-5'), 25, 500)).toBe(1);
    // The figure the lists publish beside the rows.
    expect(Math.ceil(56 / readLimit(p('limit=0'), 25, 500))).toBe(56);
    expect(Math.ceil(56 / parseInt('0', 10))).toBe(Infinity);
  });

  it('and the size that was asked for is the size that is read', () => {
    expect(readLimit(p('limit=50'), 25, 500)).toBe(50);
    expect(readLimit(p('limit=25.7'), 25, 500)).toBe(25);
  });
});

describe('and every list endpoint that paged by hand now shares the reader', () => {
  const FILES = [
    'src/app/api/orders/route.ts',
    'src/app/api/orders/follow-ups/route.ts',
    'src/app/api/orders/shipping/route.ts',
    'src/app/api/shipping-batches/route.ts',
    'src/app/api/users/route.ts',
    'src/app/api/finance/wallets/[id]/movements/route.ts',
    'src/app/api/inventory/movements/route.ts',
  ];

  const read = (rel: string) =>
    readFileSync(join(process.cwd(), rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  it('imports it, and no longer parses a page or a limit itself', () => {
    for (const f of FILES) {
      const src = read(f);
      expect(src, `${f}: لا يستورد قارئ الصفحات المشترك`).toMatch(/from '@\/lib\/numeric-input'/);
      expect(src, `${f}: ما زال يقرأ رقم الصفحة بيده`).not.toMatch(/parseInt\(\s*(?:searchParams|q|url\.searchParams)[^\n]*get\('(?:page|limit)'\)/);
      expect(src, `${f}: ما زال يقرأ الحدّ بـNumber`).not.toMatch(/Number\(\s*(?:q|searchParams|new URL\(req\.url\)\.searchParams)\.get\('limit'\)/);
    }
  });

  it('and the two that already clamped are named, so the list is not mistaken for all of them', () => {
    // These two got it right before this change and are deliberately NOT
    // converted: `products` uses `undefined` to mean «no limit at all»,
    // which is a third semantic and not this reader's.
    expect(read('src/app/api/products/route.ts')).toMatch(/Math\.min\(Math\.max\(/);
    expect(read('src/app/api/landing-pages/route.ts')).toMatch(/Number\.isNaN\(parsedLimit\)/);
  });
});
