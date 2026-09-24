import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * LANDING PAGE ANALYTICS FOR A WINDOW.
 *
 * Views per day per device per campaign, and the orders that came through
 * a page — for the window the performance screen shows, not for all time.
 */

const { db } = vi.hoisted(() => ({
  db: {
    $executeRaw: vi.fn(),
    landingPageView: { groupBy: vi.fn(), findFirst: vi.fn() },
    order: { groupBy: vi.fn() },
    landingPage: { findMany: vi.fn() },
    campaign: { findMany: vi.fn() },
  },
}));
vi.mock('./db', () => ({ db }));

import { deviceClassOf, recordLandingView, localDay } from './landing-views';
import { landingAnalytics, conversionOf } from './landing-analytics';

describe('what counts as a visit', () => {
  it('classes a device without keeping the user agent', () => {
    expect(deviceClassOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148 Safari')).toBe('mobile');
    expect(deviceClassOf('Mozilla/5.0 (Linux; Android 14; SM-S918B) Chrome/120 Mobile Safari/537.36')).toBe('mobile');
    expect(deviceClassOf('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('tablet');
    expect(deviceClassOf('Mozilla/5.0 (Linux; Android 13; SM-X700) Chrome/120 Safari/537.36')).toBe('tablet');
    expect(deviceClassOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36')).toBe('desktop');
  });

  it('does not count the crawler that draws a link preview in a chat', () => {
    for (const bot of ['facebookexternalhit/1.1', 'WhatsApp/2.23.20.0', 'TelegramBot (like TwitterBot)', 'Googlebot/2.1', '', null]) {
      expect(deviceClassOf(bot)).toBeNull();
    }
  });

  it('adds one to the day\'s row atomically — two visitors at once both count', async () => {
    db.$executeRaw.mockResolvedValue(1);
    await recordLandingView({ companyId: 'c1', storeId: 's1', landingPageId: 'lp1', campaignId: null, device: 'mobile', at: new Date(2026, 8, 25, 23, 30) });
    const [sql, ...values] = db.$executeRaw.mock.calls[0];
    expect(sql.join('?')).toMatch(/ON CONFLICT \("landingPageId", "day", "device", "campaignId"\)\s+DO UPDATE SET "count" = "landing_page_views"\."count" \+ 1/);
    expect(values).toContain('2026-09-25'); // the local day, not the UTC one
    expect(values).toContain(''); // no campaign is one row, not a NULL per visit
  });

  it('never throws — a view that fails to count must not fail the page', async () => {
    db.$executeRaw.mockRejectedValue(new Error('db down'));
    await expect(recordLandingView({ companyId: 'c1', storeId: null, landingPageId: 'lp1', campaignId: null, device: 'desktop' })).resolves.toBeUndefined();
  });

  it('the day is the server\'s own, like the date filters', () => {
    expect(localDay(new Date(2026, 0, 5, 1, 0))).toBe('2026-01-05');
  });
});

describe('the numbers for a window', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.landingPageView.groupBy.mockImplementation(async ({ by }: { by: string[] }) => {
      if (by[0] === 'landingPageId') return [{ landingPageId: 'lp1', _sum: { count: 200 } }, { landingPageId: 'lp2', _sum: { count: 50 } }];
      if (by[0] === 'device') return [{ device: 'mobile', _sum: { count: 220 } }, { device: 'desktop', _sum: { count: 30 } }];
      return [{ campaignId: 'cmp1', _sum: { count: 150 } }, { campaignId: '', _sum: { count: 100 } }];
    });
    db.order.groupBy.mockImplementation(async ({ by }: { by: string[] }) => {
      if (by[0] === 'landingPageId') return [{ landingPageId: 'lp1', _count: { _all: 10 } }, { landingPageId: 'lp3', _count: { _all: 2 } }];
      if (by[0] === 'deviceClass') return [{ deviceClass: 'mobile', _count: { _all: 9 } }, { deviceClass: null, _count: { _all: 3 } }];
      return [{ campaignId: 'cmp1', _count: { _all: 8 } }, { campaignId: null, _count: { _all: 4 } }];
    });
    db.landingPageView.findFirst.mockResolvedValue({ day: new Date('2026-09-25T00:00:00Z') });
    db.landingPage.findMany.mockResolvedValue([
      { id: 'lp1', name: 'العرض', slug: 'offer' },
      { id: 'lp2', name: 'القديمة', slug: 'old' },
      { id: 'lp3', name: 'بلا زيارات', slug: 'nv' },
    ]);
    db.campaign.findMany.mockResolvedValue([{ id: 'cmp1', name: 'رمضان', code: 'RAM' }]);
  });

  const scope = { companyId: 'c1', storeId: 's1', start: new Date(2026, 8, 1), end: new Date(2026, 8, 30, 23, 59) };

  it('reads the selected store, and only the window', async () => {
    await landingAnalytics(scope);
    const viewWhere = db.landingPageView.groupBy.mock.calls[0][0].where;
    expect(viewWhere).toMatchObject({ companyId: 'c1', storeId: 's1' });
    expect(viewWhere.day.gte.toISOString().slice(0, 10)).toBe('2026-09-01');
    expect(viewWhere.day.lte.toISOString().slice(0, 10)).toBe('2026-09-30');
    const orderWhere = db.order.groupBy.mock.calls[0][0].where;
    expect(orderWhere).toMatchObject({ companyId: 'c1', storeId: 's1', landingPageId: { not: null } });
  });

  it('gives views, orders and conversion per page, busiest first', async () => {
    const r = await landingAnalytics(scope);
    expect(r.totals).toMatchObject({ views: 250, orders: 12 });
    expect(r.byPage.map((p) => [p.label, p.views, p.orders, p.conversion])).toEqual([
      ['العرض', 200, 10, 5],
      ['بلا زيارات', 0, 2, null], // orders with no counted views: no invented rate
      ['القديمة', 50, 0, 0],
    ]);
  });

  it('per device, with the orders from before devices were recorded shown so the rows add up', async () => {
    const r = await landingAnalytics(scope);
    expect(r.byDevice.find((d) => d.key === 'mobile')).toMatchObject({ views: 220, orders: 9, conversion: 4.1 });
    expect(r.byDevice.find((d) => d.key === 'unknown')).toMatchObject({ orders: 3 });
  });

  it('per campaign, and the visits that came without one', async () => {
    const r = await landingAnalytics(scope);
    expect(r.byCampaign[0]).toMatchObject({ label: 'رمضان', hint: '?c=RAM', views: 150, orders: 8 });
    expect(r.byCampaign.at(-1)).toMatchObject({ key: 'none', views: 100, orders: 4 });
  });

  it('the rate uses only the orders from days whose views were counted — never 200%', async () => {
    // 12 orders in the window, but views began on the 25th and only 2 orders
    // came after that: the rate is 2 / 250, not 12 / 250.
    db.order.groupBy.mockImplementation(async ({ by, where }: { by: string[]; where: { createdAt: { gte: Date } } }) => {
      const sinceCounting = where.createdAt.gte.getDate() === 25;
      if (by[0] === 'landingPageId') return [{ landingPageId: 'lp1', _count: { _all: sinceCounting ? 2 : 12 } }];
      return [];
    });
    const r = await landingAnalytics(scope);
    expect(r.totals).toMatchObject({ views: 250, orders: 12, conversion: 0.8 });
    expect(r.byPage[0]).toMatchObject({ orders: 12, conversion: 1 }); // 2 / 200
  });

  it('says since when views have been counted', async () => {
    expect((await landingAnalytics(scope)).countingSince).toBe('2026-09-25');
  });

  it('conversion is empty, not zero, when nothing was counted', () => {
    expect(conversionOf(0, 5)).toBeNull();
    expect(conversionOf(400, 3)).toBe(0.8);
  });
});
