import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
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

/**
 * THE GUARD NAMED SEVEN FILES, AND A LIST IS HOW THIS ROTS.
 *
 * `0aea050` converted seven doors and listed those seven here. Three doors
 * with the identical fault were never in the list and were therefore never
 * checked — `finance/profitability`, `apps/deliveries`, `telegram/messages` —
 * and a fourth, `landing-pages`, was named in this very file as one that
 * «already got it right» when it had no lower bound on the page size at all.
 * The list did not go stale: it was incomplete on the day it was written.
 *
 * So this no longer names files. It WALKS `src/app/api/**` and asks each
 * route handler one question: does it turn the text of a query parameter
 * into a number with its own hands? Every door that does must either be the
 * shared reader's, or be named below WITH A REASON — and a named door that
 * stops tripping the detector fails this suite, so the exceptions cannot
 * outlive the thing they excuse.
 */
describe('and every limited door in the API is found by walking, not by a list', () => {
  const API = join(process.cwd(), 'src/app/api');

  /** Source with comments blanked, so prose about `parseInt` is not a hit. */
  const strip = (src: string) =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  const read = (rel: string) => strip(readFileSync(join(process.cwd(), rel), 'utf8'));

  /** Every `route.ts` under `src/app/api`, found rather than listed. */
  const ROUTES = readdirSync(API, { recursive: true, encoding: 'utf8' })
    .filter((p) => /(^|[\\/])route\.ts$/.test(p))
    .map((p) => join('src/app/api', p).replace(/\\/g, '/'))
    .sort();

  /**
   * WHAT THE QUERY STRING IS CALLED IN THIS FILE.
   *
   * `searchParams` is the usual name, and it is not the only one:
   * `control/discount-alerts/route.ts` reads
   * `const q = new URL(req.url).searchParams;` and then `q.get('days')`. A
   * detector that only knew the word `searchParams` found nothing in that
   * file — and that file was reaching Prisma with an Invalid Date. The
   * blind spot was in the detector, so it is closed here rather than
   * papered over with another name in a list.
   */
  const bags = (src: string) => {
    const names = new Set<string>(['searchParams']);
    for (const m of src.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*[^;\n]*\.searchParams\b/g)) {
      names.add(m[1]);
    }
    return [...names];
  };

  /** `searchParams.get(` / `q.get(` / … as this file spells it. */
  const getCall = (src: string) => new RegExp(`\\b(?:${bags(src).join('|')})\\.get\\(`);

  /**
   * Names in this file that hold the RAW TEXT of a query parameter, so the
   * two-step form (`const raw = …get('limit'); parseInt(raw, 10)`) is caught
   * as well as the one-liner. `products/route.ts` is written that way.
   */
  const rawParamNames = (src: string) => {
    const names = new Set<string>();
    const re = new RegExp(`(?:const|let|var)\\s+(\\w+)\\s*=\\s*[^;\\n]*?(?:${bags(src).join('|')})\\.get\\(`, 'g');
    for (const m of src.matchAll(re)) names.add(m[1]);
    return names;
  };

  /**
   * The text inside a call's parentheses, scanned with a depth counter
   * rather than `[^)]*`. The lazy version missed
   * `Number(new URL(req.url).searchParams.get('w'))` — it stopped at the
   * first `)` — which is a blind spot in the detector itself, not a quirk
   * of one file.
   */
  const callArgs = (src: string, openParen: number): string => {
    let depth = 0;
    for (let i = openParen; i < src.length; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') {
        depth--;
        if (depth === 0) return src.slice(openParen + 1, i);
      }
    }
    return src.slice(openParen + 1);
  };

  /** Every place this file converts a query parameter into a number itself. */
  const handRolled = (src: string): string[] => {
    const names = rawParamNames(src);
    const reads = getCall(src);
    const hits: string[] = [];
    const re = /\b(?:Number\.parseInt|Number\.parseFloat|parseInt|parseFloat|Number)\s*\(/g;
    for (const m of src.matchAll(re)) {
      const arg = callArgs(src, m.index + m[0].length - 1);
      const named = [...names].some((n) => new RegExp(`\\b${n}\\b`).test(arg));
      if (reads.test(arg) || named) {
        hits.push(`${m[0]}${arg.replace(/\s+/g, ' ').trim()})`);
      }
    }
    // `+searchParams.get('limit')` is the same thing in two characters.
    for (const b of bags(src)) {
      for (const m of src.matchAll(new RegExp(`\\+\\s*${b}\\.get\\(`, 'g'))) hits.push(m[0].trim());
    }
    return hits;
  };

  /**
   * The doors that read a query parameter numerically BY HAND on purpose.
   * The reason is asserted to be true of the file, not just written here.
   */
  const ALLOWED: Record<string, { why: string; still: RegExp }> = {
    // `undefined` means «no limit at all» — a third semantic this reader does
    // not express, and `0aea050` deliberately left it. It clamps both ends.
    'src/app/api/products/route.ts': {
      why: 'الغياب يعني «بلا حدٍّ أصلاً» — معنًى ثالثٌ لا يُعبِّر عنه القارئ المشترك',
      still: /Math\.min\(Math\.max\(/,
    },
    // The number is checked for MEMBERSHIP in a fixed list of widths. There
    // is nothing to clamp: a width that is not on the list falls through to
    // the original file, which is the whole point of the branch.
    'src/app/api/public/media/[...parts]/route.ts': {
      why: 'العدد يُطابَق على قائمةِ عروضٍ ثابتة؛ ما ليس فيها يسقط إلى الأصل',
      still: /IMAGE_WIDTHS as readonly number\[\]\)\.includes\(/,
    },
  };

  it('finds the route files at all — a sweep that finds nothing proves nothing', () => {
    expect(ROUTES.length).toBeGreaterThan(150);
    expect(ROUTES).toContain('src/app/api/finance/profitability/route.ts');
    expect(ROUTES).toContain('src/app/api/finance/wallets/[id]/movements/route.ts');
  });

  it('and no door reads a query parameter as a number by hand, except the named ones', () => {
    const offenders: string[] = [];
    for (const rel of ROUTES) {
      if (rel in ALLOWED) continue;
      const hits = handRolled(read(rel));
      if (hits.length) offenders.push(`${rel} → ${hits.join(' · ')}`);
    }
    expect(offenders, `أبوابٌ تقرأ رقماً من عنوان الطلب بيدها:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('and every named exception is still an exception — a fixed one must leave the list', () => {
    for (const [rel, { why, still }] of Object.entries(ALLOWED)) {
      const src = read(rel);
      expect(handRolled(src).length, `${rel}: لم يعد يقرأ بيده — احذفه من قائمة الاستثناءات (${why})`).toBeGreaterThan(0);
      expect(src, `${rel}: السببُ المكتوبُ لم يَعُد وصفاً للملف — ${why}`).toMatch(still);
    }
  });

  it('and every door that reads a page or a limit imports the shared reader', () => {
    const missing: string[] = [];
    for (const rel of ROUTES) {
      if (rel in ALLOWED) continue;
      const src = read(rel);
      const asksForOne = new RegExp(`\\b(?:${bags(src).join('|')})\\.get\\('(?:page|limit|offset|perPage|pageSize)'\\)`);
      if (!asksForOne.test(src)) continue;
      if (!/from '@\/lib\/numeric-input'/.test(src)) missing.push(rel);
    }
    expect(missing, `أبوابُ ترقيمٍ لا تستورد القارئ المشترك:\n${missing.join('\n')}`).toEqual([]);
  });

  it('and the doors the first sweep converted are among the ones found', () => {
    // Not a list to be maintained — a floor under the walk, so a detector
    // that silently stopped matching anything cannot pass this suite.
    const paged = ROUTES.filter((rel) => /from '@\/lib\/numeric-input'/.test(read(rel)));
    expect(paged).toContain('src/app/api/orders/route.ts');
    expect(paged).toContain('src/app/api/users/route.ts');
    expect(paged).toContain('src/app/api/finance/profitability/route.ts');
    expect(paged).toContain('src/app/api/landing-pages/route.ts');
    expect(paged.length).toBeGreaterThanOrEqual(11);
  });
});
