import { z } from 'zod';

/**
 * A NUMBER THAT ARRIVED FROM OUTSIDE — READ STRICTLY.
 *
 * `z.coerce.number()` is `Number(value)`, and `Number()` is more generous
 * than anyone writing a schema intends. Measured against the order and
 * inventory schemas as they stood:
 *
 *     null      → 0        an absent price became a free line
 *     []        → 0        so did an empty array
 *     "0x10"    → 16       a hex string became a quantity
 *     " 5 "     → 5        harmless, and the only one worth keeping
 *
 * None of these was reachable past the bounds checks with a LARGER number,
 * so nothing was being overcharged. What they did was turn malformed input
 * into a silent, plausible figure — and a zero price that should have been
 * a validation error is the kind of thing found weeks later in a margin.
 *
 * So: a number, or a string that is written the way a number is written.
 * Everything else fails the schema and the caller is told, which is what a
 * malformed request deserves.
 *
 * Query strings still work — `?limit=25` is a decimal string. Scientific
 * notation is allowed because a form may legitimately produce `5e-1`; the
 * bounds then decide whether the value is sane.
 */
const NUMERIC = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

/**
 * A string written the way a number is written becomes one; a number stays
 * one; everything else is handed on untouched so the schema refuses it and
 * the error names the field.
 */
function read(value: unknown): unknown {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    // The empty string is `Number('') === 0` — the same silent zero.
    if (trimmed !== '' && NUMERIC.test(trimmed)) return Number(trimmed);
  }
  return value;
}

/**
 * The bounds are built FIRST and wrapped afterwards: `z.preprocess` returns
 * a wrapper with no `.int()` or `.min()` on it, so a chain written the
 * other way round does not compile — which is the schema telling the truth
 * about what it is.
 */
export const numeric = () => z.preprocess(read, z.number());

/** A count of things: whole, and never negative. */
export const count = (max: number, min = 0) => z.preprocess(read, z.number().int().min(min).max(max));

/** An amount of money: never negative, bounded so a typo cannot be a fortune. */
export const money = (max: number) => z.preprocess(read, z.number().min(0).max(max));

/**
 * A PAGE OF RESULTS, READ FROM A QUERY STRING — ONE READER FOR ALL OF THEM.
 *
 * Seven list endpoints read their paging as
 *
 *     const page = parseInt(searchParams.get('page') || '1', 10);
 *     … skip: (page - 1) * limit
 *
 * and `parseInt('abc', 10)` is `NaN`, so `skip` was `NaN`. MEASURED against
 * this database rather than guessed, because the three plausible outcomes
 * are very different and only one of them is harmless:
 *
 *     db.order.findMany({ skip: NaN, take: 25 })
 *       → PrismaClientValidationError: Argument `take` is missing.
 *
 * It is not a silent full scan and it is not an empty page. Prisma refuses
 * `NaN` in the client, before any SQL — so nothing is read wrongly and
 * nothing is written — and the error is a `PrismaClientValidationError`,
 * which `api-error.ts` deliberately does not echo (it carries the server's
 * absolute source path). It therefore falls to the last branch: **HTTP 500,
 * «حدث خطأ داخلي»**. A typo in a URL, a stale bookmark, or a client that
 * interpolated an `undefined` into `?page=` takes the whole screen down and
 * tells the operator to call the administrator.
 *
 * CLAMPED, NOT REFUSED — and the difference from the money rule is the
 * point, not an exception to it. A bad price must be refused because it
 * gets WRITTEN and is then invisible: nobody can see that the 0 in the
 * column is not the 0 somebody meant. A bad page number is written nowhere.
 * It selects which rows to look at, and a person looking at the first page
 * can see that they are on the first page — the response says
 * `pagination.page`, so the clamped value is reported, not hidden. The two
 * doors in this repository that already got this right
 * (`products/route.ts`, `landing-pages/route.ts`) both clamp, so clamping
 * is also the answer that leaves one rule instead of two.
 */
/**
 * Which page was asked for: a whole number, at least 1.
 *
 * The ceiling is not cosmetic. `skip` is a Prisma `Int`, so an unbounded
 * page number puts a value past 2³¹ into `(page - 1) * limit` and the 500
 * comes back by the other road. A million pages of the largest page size
 * this repository allows is five hundred million rows — past anything the
 * system holds, and inside Int.
 */
export function readPage(params: URLSearchParams): number {
  return whole(params.get('page'), 1, 1, 1_000_000);
}

/**
 * How many rows per page: a whole number in `[1, max]`.
 *
 * `max` is the caller's, because what one screen can render is the screen's
 * business — but it is NOT optional, and that is deliberate.
 * `users/route.ts` had no ceiling at all, so `?limit=100000` asked Postgres
 * for a hundred thousand users and the browser to draw them.
 */
export function readLimit(params: URLSearchParams, fallback: number, max: number): number {
  return whole(params.get('limit'), fallback, 1, max);
}

/**
 * The query parameter as a whole number inside `[min, max]`, or the
 * fallback when it is absent or is not written the way a number is written.
 *
 * `read` is the same strict reader the schemas above use, so `'abc'`,
 * `'0x10'`, `''` and `'1e400'` all fall to the fallback rather than
 * becoming `NaN`, `16`, `0` or `Infinity`. `Math.trunc` rather than
 * `Math.round`: `?limit=25.7` asks for twenty-five rows and a half, and
 * twenty-five is the honest reading of it.
 */
function whole(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw === null) return fallback;
  const value = read(raw);
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), min), max);
}
