import { describe, expect, it } from 'vitest';
import { repoFile, stripComments } from './guard-source';
import { ORDER_FILTER_PARAMS, ordersWhere } from './order-filters';

/**
 * ONE QUESTION, ONE ANSWER, THREE SCREENS.
 *
 * The orders list, the CSV of «what I am looking at», and the ‹previous› /
 * ‹next› arrows all ask the same table the same thing. They used to ask it
 * in three different sets of words, and the differences were invisible
 * until somebody acted on the wrong one:
 *
 *   · «متأخرة ١٠ أيام+» was sent to the export and never read, so the CSV
 *     came back holding the whole ninety-day window;
 *   · scanning a courier barcode found the parcel in the list and nothing
 *     in the CSV of that very search;
 *   · the arrows filtered on the legacy `status` column the list had
 *     deliberately stopped using, and knew nothing of the governorate, the
 *     courier, the source, the dates or «late».
 *
 * A filter whose value never reaches the query is the defect a person
 * cannot see happening: the control moves, and only the answer is wrong.
 * So the rules live in `src/lib/order-filters.ts`, and these tests hold
 * both halves — that the rules are right, and that all three use them.
 */

const SCREEN = 'src/components/screens/OrdersScreen.tsx';
const EXPORT = 'src/app/api/reports/export/route.ts';
const LIST = 'src/app/api/orders/route.ts';
const DETAIL = 'src/app/api/orders/[id]/route.ts';
const BUILDER = 'src/lib/order-filters.ts';

/** The parameters `handleExportCSV` puts on the query string. */
function sentByTheScreen(): string[] {
  const src = repoFile(SCREEN);
  const at = src.indexOf('const handleExportCSV');
  expect(at, 'زرُّ التصدير غير موجود').toBeGreaterThan(0);
  const body = src.slice(at, src.indexOf('};', at));
  const named = [...body.matchAll(/params\.set\('([a-zA-Z]+)'/g)].map((m) => m[1]);
  /*
   * The constructor's object, read as an object rather than line by line.
   * A line-based match missed every key on a one-line literal — which is
   * how this very query string is written — so a filter added there was
   * invisible to the guard that exists to notice it.
   */
  const ctor = body.match(/new URLSearchParams\(\{([\s\S]*?)\}\)/)?.[1] ?? '';
  const inCtor = ctor
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    // `q: search` names the parameter `q`; `status` names itself. The value
    // side is a variable in this file and not a parameter at all.
    .map((entry) => (entry.includes(':') ? entry.slice(0, entry.indexOf(':')) : entry).trim())
    .filter((key) => /^[a-zA-Z]+$/.test(key));
  return [...new Set([...named, ...inCtor])].filter(
    (k) => !['const', 'params', 'window', 'if', 'new'].includes(k)
  );
}

describe('every filter the screen sends is a filter something reads', () => {
  it('and none of them falls between the screen and the query', () => {
    const route = stripComments(repoFile(EXPORT));
    const shared = new Set<string>(ORDER_FILTER_PARAMS);
    const unread = sentByTheScreen().filter(
      (key) => !shared.has(key) && !route.includes(`searchParams.get('${key}')`)
    );
    expect(
      unread,
      `فلترٌ يُرسَل ولا يُقرأ — الملفّ يخالف الشاشة:\n${unread.join('\n')}`
    ).toEqual([]);
  });

  it('and the screen sends nothing dead', () => {
    // A parameter the screen sends that is always the same value is a
    // control somebody removed and a wire nobody pulled. `moderatorId` and
    // `queue` were exactly that: state that never changed, a metadata
    // request on every page load, and a dropdown that had been deleted.
    const src = repoFile(SCREEN);
    for (const key of sentByTheScreen()) {
      if (key === 'ids') continue;
      const setter = `set${key[0].toUpperCase()}${key.slice(1)}(`;
      const declared = src.includes(`const [${key},`);
      if (!declared) continue;
      expect(src.includes(setter), `${key}: حالةٌ تُرسَل ولا يغيّرها شيء`).toBe(true);
    }
  });
});

describe('the rules themselves', () => {
  const builder = stripComments(repoFile(BUILDER));

  /** Named on its own, because it is the one that went missing. */
  it('narrow on «late since shipping», and measure it from shipping', () => {
    expect(builder).toContain("params.get('lateDays')");
    expect(builder).toContain('shippedAt: { lte: cutoff }');
    expect(builder).toContain('shippingStatus: { notIn: CLOSED_SHIPPING }');
    expect(builder).toContain('confirmationStatus: { notIn: CLOSED_CONFIRMATION }');

    const at = builder.indexOf('if (lateDays)');
    expect(builder.slice(at, at + 700), 'قيس التأخّر من الإنشاء').not.toContain('createdAt');
  });

  it('refuse a nonsense day count rather than scanning the table', () => {
    const out = ordersWhere(new URLSearchParams({ lateDays: '9999' }));
    expect(out.ok).toBe(false);
    expect(ordersWhere(new URLSearchParams({ lateDays: 'ten' })).ok).toBe(false);
  });

  it('read the state the row is labelled with, never the legacy column', () => {
    const out = ordersWhere(new URLSearchParams({ status: 'CONFIRMED' }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // The legacy `status` column drifts from confirmation/shipping status —
    // the schema calls it «legacy combined status» — so filtering on it
    // returns rows the screen is calling something else.
    expect(out.where.status, 'فلتَر على العمود القديم').toBeUndefined();
    expect(JSON.stringify(out.where)).toContain('confirmationStatus');
  });

  it('refuse a state that is not one of ours', () => {
    expect(ordersWhere(new URLSearchParams({ status: 'ANYTHING' })).ok).toBe(false);
  });

  it('find a parcel by either reference printed on its label', () => {
    const out = ordersWhere(new URLSearchParams({ q: 'KSA100422577363' }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const fields = JSON.stringify(out.where.OR);
    // The QR holds our merchant reference and the courier's barcode is
    // printed beside it. A scan that finds neither is the one search in
    // the system that cannot answer the question somebody holding a
    // parcel actually has.
    expect(fields).toContain('trackingNumber');
    expect(fields).toContain('merchantRef');
    expect(fields).toContain('rawPhone');
  });

  it('and ask for nothing at all when nothing is filtered', () => {
    const out = ordersWhere(new URLSearchParams());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.where).toEqual({});
  });
});

/**
 * THE HALF THAT STOPS IT HAPPENING AGAIN.
 *
 * Getting the rules right once is the easy part. What went wrong before
 * was a second and a third copy, each correct on the day it was written.
 */
describe('all three callers use the one builder', () => {
  for (const [what, file] of [
    ['the list', LIST],
    ['the export', EXPORT],
    ['the previous/next arrows', DETAIL],
  ] as const) {
    it(`${what} calls it`, () => {
      const src = stripComments(repoFile(file));
      expect(src).toContain("from '@/lib/order-filters'");
      expect(src).toMatch(/ordersWhere\(searchParams/);
    });
  }

  it('and none of them rebuilds a filter of its own', () => {
    for (const file of [LIST, EXPORT, DETAIL]) {
      const src = stripComments(repoFile(file));
      // `createdAt` is deliberately each caller's own — the list takes the
      // dates as given and the export forces a ninety-day window — so it
      // is not in this list.
      for (const own of ["searchParams.get('lateDays')", "searchParams.get('regionId')", "searchParams.get('courierId')"]) {
        expect(src.includes(own), `${file}: نسخةٌ ثانيةٌ من الفلاتر — ${own}`).toBe(false);
      }
      expect(src, `${file}: فلترةٌ على العمود القديم`).not.toMatch(/where\.status\s*=/);
    }
  });
});

/**
 * THE ENVELOPE. This is the single largest way customer names and phone
 * numbers leave the system, and it was once the one order query in the
 * product with no role-visibility filter on it at all.
 */
describe('the export reads nothing outside what the account may see', () => {
  it('goes through the same envelope the list ends every query with', () => {
    const route = stripComments(repoFile(EXPORT));
    expect(route).toContain("import { applyQueueFilter } from '@/lib/rbac'");
    expect(route).toMatch(/const where = applyQueueFilter\(\s*user,/);
  });

  it('and the hand-picked branch goes through it too', () => {
    const route = stripComments(repoFile(EXPORT));
    const at = route.indexOf('const where = applyQueueFilter(');
    const block = route.slice(at, route.indexOf('const totalRows', at));
    expect(block, 'الصفوف المؤشَّرة تفلت من الغلاف').toContain('id: { in: ids }');
  });

  it('and records which filters it ran under', () => {
    expect(stripComments(repoFile(EXPORT))).toContain('ORDER_FILTER_PARAMS.map');
  });
});
