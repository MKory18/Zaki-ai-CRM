import { describe, expect, it } from 'vitest';
import { repoFile, stripComments } from './guard-source';

/**
 * WHAT THE EXPORT BUTTON EXPORTS.
 *
 * `handleExportCSV` on the orders screen builds its query string from the
 * SAME filter state the list uses, and hands it to
 * `/api/reports/export`. The promise — the one the screen makes by putting
 * تصدير above a filtered list — is «everything the filters match».
 *
 * «متأخرة 10 أيام+ من الشحن» was sent and never read. The list narrowed on
 * it, the export did not, and the CSV came back holding the whole ninety-day
 * window with no sign that the two disagreed. A filter whose value never
 * reaches the query is the defect a person cannot see happening: the control
 * moves, and only the file is wrong.
 *
 * Every parameter the screen sends must be a parameter this route reads.
 */

const SCREEN = 'src/components/screens/OrdersScreen.tsx';
const ROUTE = 'src/app/api/reports/export/route.ts';

/** The parameters `handleExportCSV` puts on the query string. */
function sentByTheScreen(): string[] {
  const src = repoFile(SCREEN);
  const at = src.indexOf('const handleExportCSV');
  expect(at, 'زرُّ التصدير غير موجود').toBeGreaterThan(0);
  const body = src.slice(at, src.indexOf('};', at));
  const named = [...body.matchAll(/params\.set\('([a-zA-Z]+)'/g)].map((m) => m[1]);
  const inCtor = [...body.matchAll(/^\s*([a-zA-Z]+)(?:,|:)/gm)].map((m) => m[1]);
  return [...new Set([...named, ...inCtor])].filter(
    (k) => !['const', 'params', 'window', 'if', 'new'].includes(k)
  );
}

describe('the orders export', () => {
  it('reads every filter the screen sends it', () => {
    const route = stripComments(repoFile(ROUTE));
    const unread = sentByTheScreen().filter(
      (key) => !route.includes(`searchParams.get('${key}')`)
    );
    expect(
      unread,
      `فلترٌ يُرسَل ولا يُقرأ — الملفّ يخالف الشاشة:\n${unread.join('\n')}`
    ).toEqual([]);
  });

  /** Named on its own, because it is the one that was missing. */
  it('narrows on «late since shipping», by the same rule the list uses', () => {
    const route = stripComments(repoFile(ROUTE));
    expect(route).toContain("searchParams.get('lateDays')");
    expect(route).toContain('shippedAt: { lte: cutoff }');
    expect(route).toContain(
      "shippingStatus: { notIn: ['DELIVERED', 'PARTIALLY_DELIVERED', 'RETURNED', 'CANCELLED'] }"
    );
    expect(route).toContain("confirmationStatus: { notIn: ['CANCELLED', 'REJECTED'] }");
  });

  it('measures lateness from shipping, never from creation', () => {
    const route = stripComments(repoFile(ROUTE));
    const at = route.indexOf('if (lateDays)');
    expect(at).toBeGreaterThan(0);
    const block = route.slice(at, at + 700);
    expect(block, 'قيس التأخّر من الإنشاء').not.toContain('createdAt');
  });

  it('refuses a nonsense day count rather than scanning the table', () => {
    const route = stripComments(repoFile(ROUTE));
    expect(route).toMatch(/days < 1 \|\| days > 365/);
  });

  it('and records which filters the export ran under', () => {
    expect(stripComments(repoFile(ROUTE))).toContain('lateDays: lateDays || null');
  });

  /**
   * THE ENVELOPE. This is the single largest way customer names and phone
   * numbers leave the system, and it was the one order query in the product
   * with no role-visibility filter on it at all — the permission was checked
   * and then the whole store was read. `applyQueueFilter` is the same
   * function `GET /api/orders` ends every query with.
   */
  it('never reads outside what this account may see', () => {
    const route = stripComments(repoFile(ROUTE));
    expect(route).toContain("import { applyQueueFilter } from '@/lib/rbac'");
    expect(route).toMatch(/const where = applyQueueFilter\(\s*user,/);
  });

  it('and the hand-picked branch goes through it too', () => {
    const route = stripComments(repoFile(ROUTE));
    const at = route.indexOf('const where = applyQueueFilter(');
    const block = route.slice(at, route.indexOf('const totalRows', at));
    expect(block, 'الصفوف المؤشَّرة تفلت من الغلاف').toContain('id: { in: ids }');
  });

  it('is a whole route', () => {
    expect(repoFile(ROUTE).length).toBeGreaterThan(2000);
  });
});
