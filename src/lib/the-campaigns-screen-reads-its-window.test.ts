import { describe, expect, it } from 'vitest';
import { campaignWindow } from './campaign-window';
import { campaignInsights, duplicatesOf, sameName } from './campaign-insights';
import { NO_FILTER, filterCampaigns, isFiltering } from './campaign-filters';

/**
 * «ضروري يكون في تواريخ والدراج اند دروب وترتيب الحملات» · «زر حذف المكرر، تحديد، زر حذف الكل، فلاتر، بطاقات».
 * The three pure halves of the campaigns screen: the window it reads, the duplicates and cards, the filters.
 */

const q = (s: string) => new URLSearchParams(s);
const days = (r: { start?: Date; end?: Date }) => Math.round(((r.end?.getTime() ?? 0) - (r.start?.getTime() ?? 0)) / 86_400_000);

describe('the window', () => {
  it('the old keys mean what they said — not the 90-day fallback they used to fall into', () => {
    const month = campaignWindow(q('period=this_month'));
    expect(month.start?.getDate()).toBe(1);
    expect(days(campaignWindow(q('period=last_30')))).toBe(31);
  });

  it('«كل الوقت» is the whole history — no bounds at all', () => {
    expect(campaignWindow(q('period=all'))).toEqual({});
  });

  it('a picked range is the whole of both days, however long — not clamped to 90 days', () => {
    const r = campaignWindow(q('startDate=2026-01-01&endDate=2026-10-25'));
    expect(r.start?.getHours()).toBe(0);
    expect(r.end?.getHours()).toBe(23);
    expect(days(r)).toBeGreaterThan(290);
  });

  it('NEGATIVE: a backwards or malformed range is ignored, and an unknown period reads as this month', () => {
    expect(campaignWindow(q('startDate=2026-10-25&endDate=2026-10-01')).start?.getDate()).toBe(1);
    expect(campaignWindow(q('startDate=x&endDate=y&period=nonsense')).start?.getDate()).toBe(1);
  });
});

const c = (id: string, name: string, externalId: string | null, over: Partial<{ spend: number; net: number; roas: number | null; brought: number; hasProduct: boolean }> = {}) => ({
  id, name, externalId, hasProduct: over.hasProduct ?? true,
  money: { spend: over.spend ?? 0, net: over.net ?? 0, roas: over.roas ?? null },
  funnel: { brought: over.brought ?? 0 },
});

describe('the duplicates', () => {
  it('a hand-typed campaign is the duplicate of the platform one with the same name, however it was spaced or cased', () => {
    const dup = duplicatesOf([c('m1', 'ARMO  سايت سوريا 1', null), c('p1', 'armo سايت سوريا 1', 'ext-1'), c('m2', 'وحيدة', null)]);
    expect([...dup]).toEqual([['m1', 'p1']]);
    expect(sameName('  A  b ')).toBe('a b');
  });

  it('NEGATIVE: a name the platform has twice is matched to neither — orders are never moved by a guess', () => {
    expect(duplicatesOf([c('m1', 'X', null), c('p1', 'X', 'e1'), c('p2', 'X', 'e2')]).size).toBe(0);
  });

  it('NEGATIVE: two platform campaigns are never each other’s duplicate', () => {
    expect(duplicatesOf([c('p1', 'X', 'e1'), c('p2', 'Y', 'e2')]).size).toBe(0);
  });
});

describe('the cards', () => {
  const list = [
    c('a', 'رابحة', 'e1', { spend: 100, net: 300, roas: 4, brought: 20 }),
    c('b', 'خاسرة', 'e2', { spend: 200, net: -150, roas: 0.25, brought: 3 }),
    c('d', 'صرفت بس', 'e3', { spend: 50, net: -50, roas: 0, brought: 0, hasProduct: false }),
    c('m', 'يدوية', null),
  ];
  it('best return, biggest loss, spent with no orders, no product, duplicates', () => {
    expect(campaignInsights(list, new Map([['m', 'a']]))).toEqual({
      best: { id: 'a', name: 'رابحة', roas: 4 },
      worst: { id: 'b', name: 'خاسرة', net: -150 },
      spentNoOrders: 1,
      noProduct: 1,
      duplicates: 1,
    });
  });

  it('NEGATIVE: with nothing losing there is no «biggest loss» card claiming one', () => {
    expect(campaignInsights([list[0]], new Map()).worst).toBeNull();
  });
});

describe('the filters', () => {
  const f = (over: Record<string, unknown>) => ({
    name: 'كمأة سايت', code: 'AB12CD', status: 'ACTIVE', platform: 'META', adAccount: { id: 'acc' }, product: { id: 'p' },
    duplicateOf: null, money: { spend: 10, net: 5 }, funnel: { brought: 2 }, ...over,
  });
  const list = [
    f({}),
    f({ name: 'ندبات', code: 'ZZ99', status: 'PAUSED', money: { spend: 40, net: -40 }, funnel: { brought: 0 } }),
    f({ name: 'يدوية', adAccount: null, product: null, duplicateOf: 'x', money: { spend: 0, net: 0 }, funnel: { brought: 3 } }),
  ];
  it('by name or code, status, account, product, and the quick ones', () => {
    expect(filterCampaigns(list, { ...NO_FILTER, q: 'zz99' })).toHaveLength(1);
    expect(filterCampaigns(list, { ...NO_FILTER, status: 'PAUSED' })).toHaveLength(1);
    expect(filterCampaigns(list, { ...NO_FILTER, account: 'none' })).toHaveLength(1);
    expect(filterCampaigns(list, { ...NO_FILTER, product: 'none' })).toHaveLength(1);
    expect(filterCampaigns(list, { ...NO_FILTER, quick: 'losing' })).toHaveLength(1);
    expect(filterCampaigns(list, { ...NO_FILTER, quick: 'spentNoOrders' })).toHaveLength(1);
    expect(filterCampaigns(list, { ...NO_FILTER, quick: 'duplicates' })).toHaveLength(1);
  });

  it('NEGATIVE: no filter shows everything, and says it is not filtering', () => {
    expect(filterCampaigns(list, NO_FILTER)).toHaveLength(3);
    expect(isFiltering(NO_FILTER)).toBe(false);
    expect(isFiltering({ ...NO_FILTER, q: 'x' })).toBe(true);
  });
});
