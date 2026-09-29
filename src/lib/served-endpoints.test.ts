import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { stripComments } from './guard-source';

/**
 * EVERY `/api/…` A SCREEN CALLS IS SERVED BY A ROUTE.
 *
 * «DEAD means: the control exists and does nothing, or navigates nowhere, or
 * calls an endpoint that returns nothing useful. Dead controls are the most
 * common defect in a system built in stages.» That is the QA brief's own
 * sentence, and the third case is the one no reviewer catches by reading:
 * the button looks right, the handler looks right, and the path it posts to
 * was renamed in a refactor six weeks ago. Nothing fails at build time —
 * Next.js answers 404 and the screen says «تعذّر الحفظ».
 *
 * So it is checked mechanically, over the WHOLE product. Measured on the
 * first run: 225 routes served, and every one of the paths called from
 * outside the API resolved to one of them.
 *
 * THE SELLER'S SURFACES ARE INCLUDED, unlike in `dashboardFiles`. That
 * helper leaves them out because its rules are about the dashboard's look,
 * which is not a seller's to inherit. This rule is about whether a request
 * arrives, and a storefront posting an order to a path nobody serves is the
 * most expensive version of this defect: the shopper finds it first.
 */

/** Repo-relative, posix — `src/app/api/orders/route.ts`. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(p)) out.push(relative(process.cwd(), p).split('\\').join('/'));
    }
  };
  walk(join(process.cwd(), 'src'));
  return out;
}

const segments = (p: string) => p.replace(/^\/+/, '').replace(/\/+$/, '').split('/').filter(Boolean);

/**
 * DOES THIS ROUTE SERVE THIS WHOLE PATH?
 *
 * Pure, exported and tested directly, because the sweep is only as honest
 * as this function: one that said `true` too easily would report a clean
 * product while every path in it was broken.
 *
 * A call segment of `*` is an interpolation — `${orderId}` — and stands for
 * exactly one segment, or for several against a catch-all, since that is
 * what a media key expands to at runtime.
 */
export function servedBy(call: readonly string[], route: readonly string[]): boolean {
  if (route.length === 0) return call.length === 0;
  const [r, ...restRoute] = route;
  if (r.startsWith('[...') || r.startsWith('[[...')) {
    if (restRoute.length > 0) throw new Error('a catch-all is only ever last: ' + route.join('/'));
    return call.length >= 1;
  }
  if (call.length === 0) return false;
  const [c, ...restCall] = call;
  const fits = r.startsWith('[') || c.includes('*') || c === r;
  return fits && servedBy(restCall, restRoute);
}

/**
 * DOES THIS ROUTE SERVE SOMETHING THAT STARTS THIS WAY?
 *
 * Some paths in the code are openly incomplete, and both kinds are honest:
 * a prefix constant (`STORE_LOGO_PREFIX = '/api/public/store-logo/'`, used
 * to recognise a url as much as to build one) and a path the code finishes
 * at runtime (`/api/customers/${id}/history${query}`). Demanding an exact
 * route for those would report five working paths as dead, which is how a
 * guard gets deleted instead of obeyed.
 *
 * `partialLast` says the last segment was cut mid-word, so it is a prefix
 * of the real segment rather than the whole of it.
 */
export function startsAServedRoute(
  call: readonly string[],
  partialLast: boolean,
  route: readonly string[]
): boolean {
  if (call.length === 0) return true;
  if (route.length === 0) return false;
  const [c, ...restCall] = call;
  const [r, ...restRoute] = route;
  if (r.startsWith('[...') || r.startsWith('[[...')) return true;
  const last = restCall.length === 0;
  const fits = r.startsWith('[') || c.includes('*') || (last && partialLast ? r.startsWith(c) : c === r);
  return fits && startsAServedRoute(restCall, partialLast, restRoute);
}

/**
 * The path a literal asks for, and whether it is finished.
 *
 * A trailing query string is dropped: a route serves a path. A trailing
 * slash means the code appends the rest, so it is a prefix.
 */
export function readCallPath(raw: string): { path: string; open: boolean; partialLast: boolean } {
  const interpolated = raw.includes('${');
  let withStars = raw.replace(/\$\{[^}]*\}/g, '*');
  /**
   * AN INTERPOLATION WHOSE TEXT WAS CLIPPED.
   *
   * The literal is read up to the first quote, and a ternary inside an
   * interpolation contains quotes of its own — `` `/api/x${tab ? '?a' : ''}` ``
   * hands us `/api/x${tab`. Treating that as a literal segment reported two
   * working screens as dead. Whatever the expression evaluates to, it stands
   * where a wildcard stands.
   */
  const clipped = withStars.indexOf('${');
  if (clipped !== -1) withStars = withStars.slice(0, clipped) + '*';
  const beforeQuery = withStars.split('?')[0];
  const open = interpolated || beforeQuery.endsWith('/');
  const segs = segments(beforeQuery);
  /**
   * `/api/x/${id}` keeps the interpolation as a segment of its own; only
   * `…/history${q}` leaves a segment cut mid-word — and it is the LAST
   * segment that decides that, not the first interpolation in the path.
   * Reading the first one is how `/api/customers/${id}/history${q}` came out
   * as a literal segment «history*» and was reported dead.
   */
  const last = segs[segs.length - 1];
  const partialLast = !!last && last !== '*' && last.endsWith('*');
  if (partialLast) segs[segs.length - 1] = last.replace(/\*+$/, '');
  return { path: '/' + segs.join('/'), open, partialLast };
}

/**
 * IS THIS LITERAL SERVED?
 *
 * The sweep's whole decision, in one pure function, so that the difference
 * between the two matchers is itself under test. Routing every path through
 * the prefix matcher would make the sweep pass over a product where nothing
 * worked, and a mutation that did exactly that would otherwise be invisible.
 */
export function resolves(raw: string, routes: readonly (readonly string[])[]): boolean {
  const { path, open, partialLast } = readCallPath(raw);
  const segs = segments(path);
  return open
    ? routes.some((r) => startsAServedRoute(segs, partialLast, r))
    : routes.some((r) => servedBy(segs, r));
}

interface CallSite {
  raw: string;
  file: string;
  line: number;
}

/**
 * A literal `/api/…` in code that is not itself an API route.
 *
 * Comments are blanked first: four guards in this repo have failed on their
 * own prose, and a comment naming a retired endpoint is documentation, not
 * a call.
 */
function callSites(files: string[]): CallSite[] {
  const out: CallSite[] = [];
  const CALL = /['"`](\/api\/[^'"`\s]*)/g;
  for (const file of files) {
    if (file.startsWith('src/app/api/')) continue;
    if (file.includes('.test.')) continue;
    const lines = stripComments(readFileSync(join(process.cwd(), file), 'utf8')).split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const m of lines[i].matchAll(CALL)) {
        if (m[1] === '/api' || m[1] === '/api/') continue;
        out.push({ raw: m[1], file, line: i + 1 });
      }
    }
  }
  return out;
}

function servedRoutes(files: string[]): string[] {
  return files
    .map((f) => f.match(/^src\/app\/(api\/.+)\/route\.ts$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => '/' + m[1]);
}

describe('servedBy — a whole path against a route', () => {
  it('matches a plain path only to itself', () => {
    expect(servedBy(segments('/api/orders'), segments('/api/orders'))).toBe(true);
    expect(servedBy(segments('/api/orders'), segments('/api/products'))).toBe(false);
  });

  it('refuses a path that runs past the route, or stops short of it', () => {
    // The two easy ways to write a matcher that passes everything.
    expect(servedBy(segments('/api/orders/x/notes'), segments('/api/orders/[id]'))).toBe(false);
    expect(servedBy(segments('/api/orders'), segments('/api/orders/[id]'))).toBe(false);
  });

  it('lets a route parameter take any one segment', () => {
    expect(servedBy(segments('/api/orders/abc/notes'), segments('/api/orders/[id]/notes'))).toBe(true);
    expect(servedBy(segments('/api/orders/*/notes'), segments('/api/orders/[id]/notes'))).toBe(true);
  });

  it('does not let one interpolation cover two segments of a fixed route', () => {
    expect(servedBy(segments('/api/settings/*/webhook'), segments('/api/settings/couriers/[id]/webhook'))).toBe(false);
    expect(servedBy(segments('/api/settings/couriers/*/webhook'), segments('/api/settings/couriers/[id]/webhook'))).toBe(true);
  });

  /**
   * A CATCH-ALL EATS THE REST, AND AT LEAST ONE.
   *
   * `/api/media/${key}` is one interpolation that becomes four segments at
   * runtime, which is why the media routes are catch-alls — and why a
   * matcher that made a catch-all match only a single segment would report
   * every media path in the product as dead.
   */
  it('lets a catch-all take one segment or many, but not none', () => {
    expect(servedBy(segments('/api/media/*'), segments('/api/media/[...key]'))).toBe(true);
    expect(servedBy(segments('/api/media/a/b/c'), segments('/api/media/[...key]'))).toBe(true);
    expect(servedBy(segments('/api/media'), segments('/api/media/[...key]'))).toBe(false);
  });
});

describe('startsAServedRoute — an openly unfinished path', () => {
  it('accepts a prefix of a longer route', () => {
    expect(startsAServedRoute(segments('/api/media'), false, segments('/api/media/[...key]'))).toBe(true);
    expect(startsAServedRoute(segments('/api/public/store-logo'), false, segments('/api/public/store-logo/[storeId]/[file]'))).toBe(true);
  });

  it('still refuses a prefix of nothing', () => {
    expect(startsAServedRoute(segments('/api/medai'), false, segments('/api/media/[...key]'))).toBe(false);
    expect(startsAServedRoute(segments('/api/media/x/y'), false, segments('/api/media'))).toBe(false);
  });

  it('treats a segment cut mid-word as a prefix of that segment, and only then', () => {
    // `/api/ops/returns${query}` — the segment is «returns» plus whatever.
    expect(startsAServedRoute(['api', 'ops', 'returns'], true, segments('/api/ops/returns'))).toBe(true);
    expect(startsAServedRoute(['api', 'ops', 'ret'], true, segments('/api/ops/returns'))).toBe(true);
    // Without the flag it is a whole segment, and «ret» is not «returns».
    expect(startsAServedRoute(['api', 'ops', 'ret'], false, segments('/api/ops/returns'))).toBe(false);
    // And a partial last segment never reaches backwards into earlier ones.
    expect(startsAServedRoute(['api', 'op', 'returns'], true, segments('/api/ops/returns'))).toBe(false);
  });
});

describe('readCallPath — what a literal is asking for', () => {
  it('reads a finished path as finished', () => {
    expect(readCallPath('/api/orders')).toEqual({ path: '/api/orders', open: false, partialLast: false });
  });

  it('drops a query string — a route serves a path', () => {
    expect(readCallPath('/api/orders?page=2').path).toBe('/api/orders');
  });

  it('reads a trailing slash as a prefix the code finishes', () => {
    expect(readCallPath('/api/media/')).toEqual({ path: '/api/media', open: true, partialLast: false });
  });

  it('turns an interpolated segment into one wildcard segment', () => {
    expect(readCallPath('/api/orders/${id}/notes')).toEqual({
      path: '/api/orders/*/notes',
      open: true,
      partialLast: false,
    });
  });

  it('marks a segment cut mid-word — the LAST one, not the first', () => {
    expect(readCallPath('/api/customers/${id}/history${q}')).toEqual({
      path: '/api/customers/*/history',
      open: true,
      partialLast: true,
    });
  });

  it('reads a clipped interpolation as a wildcard rather than as text', () => {
    // The literal stops at the first quote, and a ternary inside an
    // interpolation carries quotes of its own.
    expect(readCallPath("/api/team/penalties${tab === 'a' ")).toEqual({
      path: '/api/team/penalties',
      open: true,
      partialLast: true,
    });
  });
});

describe('resolves — a finished path is held to the whole route', () => {
  const SERVED = [segments('/api/media/[...key]'), segments('/api/orders'), segments('/api/orders/[id]/notes')];

  /**
   * THE MUTATION THIS EXISTS FOR: sending every path through the prefix
   * matcher. It would pass on this product and on a broken one alike.
   */
  it('refuses a finished path that is only the start of a route', () => {
    expect(resolves('/api/media', SERVED)).toBe(false);
    expect(resolves('/api/orders/abc', SERVED)).toBe(false);
  });

  it('accepts the same path once the code says it appends the rest', () => {
    expect(resolves('/api/media/', SERVED)).toBe(true);
    expect(resolves('/api/orders/${id}/notes', SERVED)).toBe(true);
  });

  it('refuses a path no route begins with, open or finished', () => {
    expect(resolves('/api/medai/', SERVED)).toBe(false);
    expect(resolves('/api/orders/${id}/notez', SERVED)).toBe(false);
  });
});

describe('no screen calls an endpoint nobody serves', () => {
  const files = sourceFiles();
  const routes = servedRoutes(files);
  const calls = callSites(files);

  it('found both sides to compare — a sweep over nothing proves nothing', () => {
    // The vacuous pass this repo has been bitten by: an empty slice, an
    // empty file list, a regex that matched no lines, and a green test.
    expect(routes.length).toBeGreaterThan(150);
    expect(calls.length).toBeGreaterThan(150);
  });

  it('resolves every one of them', () => {
    const routeSegments = routes.map(segments);
    const dead: string[] = [];
    for (const call of calls) {
      if (!resolves(call.raw, routeSegments)) dead.push(`${call.raw}  ←  ${call.file}:${call.line}`);
    }
    expect(dead, `مسارات تُطلب ولا تُخدَم:\n${dead.join('\n')}`).toEqual([]);
  });
});
