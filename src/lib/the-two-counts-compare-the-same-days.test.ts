import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * «خلي العدّ بالطريقتين أسبوع قبل ما نبدّل» — the server's count beside the browser's, over the SAME days.
 *
 * The server's rows reach back months; the browser's start the day it shipped. Comparing the whole window would show a
 * «difference» that is only the calendar, so the comparison starts at the browser's first day.
 */

const { db } = vi.hoisted(() => ({
  db: {
    landingPageView: { groupBy: vi.fn() },
    landingPageBrowserView: { findFirst: vi.fn(), groupBy: vi.fn() },
    landingPage: { findMany: vi.fn(async () => [{ id: 'a', name: 'الكمأة' }, { id: 'b', name: 'الأظافر' }]) },
  },
}));
vi.mock('@/lib/db', () => ({ db }));

import { countCheckFor } from './landing-analytics';

const scope = { companyId: 'c1', storeId: 's1', start: new Date(2026, 9, 1), end: new Date(2026, 9, 31, 23) };

beforeEach(() => vi.clearAllMocks());

describe('the two counts', () => {
  it('compare from the browser’s first day, page by page, busiest first', async () => {
    db.landingPageBrowserView.findFirst.mockResolvedValue({ day: new Date('2026-10-26T00:00:00Z') });
    db.landingPageView.groupBy.mockResolvedValue([{ landingPageId: 'a', _sum: { count: 100 } }, { landingPageId: 'b', _sum: { count: 10 } }]);
    db.landingPageBrowserView.groupBy.mockResolvedValue([{ landingPageId: 'a', _sum: { count: 90 } }]);
    const check = await countCheckFor(scope);
    expect(check).toEqual({
      since: '2026-10-26',
      server: 110,
      browser: 90,
      byPage: [
        { key: 'a', label: 'الكمأة', server: 100, browser: 90 },
        { key: 'b', label: 'الأظافر', server: 10, browser: 0 },
      ],
    });
    // Both tables were read over the SAME days — from the 26th, not from the window's 1st.
    const days = (m: typeof db.landingPageView.groupBy) => m.mock.calls[0][0].where.day.gte.toISOString().slice(0, 10);
    expect(days(db.landingPageView.groupBy)).toBe('2026-10-26');
    expect(days(db.landingPageBrowserView.groupBy)).toBe('2026-10-26');
  });

  it('NEGATIVE: before the browser has counted anything there is no comparison to show', async () => {
    db.landingPageBrowserView.findFirst.mockResolvedValue(null);
    expect(await countCheckFor(scope)).toBeNull();
    expect(db.landingPageView.groupBy).not.toHaveBeenCalled();
  });

  it('NEGATIVE: a window that ends before the browser started shows none', async () => {
    db.landingPageBrowserView.findFirst.mockResolvedValue({ day: new Date('2026-11-05T00:00:00Z') });
    expect(await countCheckFor(scope)).toBeNull();
  });
});
