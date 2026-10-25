import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * «بس طلبات صفحات الهبوط والمتجر، وطلبات الرسائل ما تنبعت» — and «اعزل البكسل والـAPI والـevent» per store.
 *
 * A server conversion is owed only for an order that came through a selling page, and only to a pixel
 * that page loads: the same store/country rule and the same kind-of-page rule as the browser. An order
 * typed in from a chat, a call or a sheet reaches no pixel; a store's pixel never hears another store's sale.
 */

const { db } = vi.hoisted(() => ({
  db: {
    order: { findFirst: vi.fn() },
    customConversion: { findMany: vi.fn() },
    conversionDelivery: { createMany: vi.fn(async (a: { data: unknown[] }) => ({ count: a.data.length })) },
  },
}));
vi.mock('../db', () => ({ db }));
vi.mock('../secrets', () => ({ decryptSecret: () => 'TOKEN' }));

import { queueConversions } from './emit';
import { LANDING_PAGE_ORDER_SOURCE, STOREFRONT_ORDER_SOURCE, salesPageOf } from './types';

const pixel = (id: string, p: { scope?: string; storeId?: string | null; countryId?: string | null }) => ({
  id,
  pixel: { scope: p.scope ?? 'GLOBAL', storeId: p.storeId ?? null, countryId: p.countryId ?? null },
});

const PIXELS = [
  pixel('c-store-a', { storeId: 'store-a' }),
  pixel('c-store-b', { storeId: 'store-b' }),
  pixel('c-syria', { countryId: 'sy' }),
  pixel('c-jordan', { countryId: 'jo' }),
  pixel('c-company', {}),
  pixel('c-a-landing-only', { storeId: 'store-a', scope: 'LANDING_PAGES' }),
];

const order = (o: Partial<{ source: string; landingPageId: string | null; storeId: string | null; countryId: string | null }>) => ({
  source: 'Manual', landingPageId: null, storeId: 'store-a', countryId: 'sy', ...o,
});

const queued = () => {
  const call = db.conversionDelivery.createMany.mock.calls[0]?.[0] as { data: { conversionId: string }[] } | undefined;
  return (call?.data ?? []).map((d) => d.conversionId).sort();
};

beforeEach(() => {
  vi.clearAllMocks();
  db.customConversion.findMany.mockResolvedValue(PIXELS);
});

describe('which orders are sent', () => {
  it('a landing-page order is sent — to its own store, its country and the company-wide pixel only', async () => {
    db.order.findFirst.mockResolvedValue(order({ source: LANDING_PAGE_ORDER_SOURCE, landingPageId: 'lp-1' }));
    expect(await queueConversions('co', 'order.confirmed', 'o1')).toBe(4);
    expect(queued()).toEqual(['c-a-landing-only', 'c-company', 'c-store-a', 'c-syria']);
  });

  it('a storefront order is sent — but never to a «landing pages only» pixel', async () => {
    db.order.findFirst.mockResolvedValue(order({ source: STOREFRONT_ORDER_SOURCE }));
    await queueConversions('co', 'order.confirmed', 'o1');
    expect(queued()).toEqual(['c-company', 'c-store-a', 'c-syria']);
  });

  it('NEGATIVE: an order from the messages, a call, a sheet or the migration reaches no pixel at all', async () => {
    for (const source of ['Manual', 'WhatsApp', 'Facebook Ads', 'Instagram', 'ترحيل', 'Website']) {
      vi.clearAllMocks();
      db.customConversion.findMany.mockResolvedValue(PIXELS);
      db.order.findFirst.mockResolvedValue(order({ source }));
      expect(await queueConversions('co', 'order.confirmed', 'o1')).toBe(0);
      expect(db.conversionDelivery.createMany).not.toHaveBeenCalled();
    }
  });

  it('NEGATIVE: store B’s pixel never hears store A’s sale, nor Jordan’s pixel a Syrian one', async () => {
    db.order.findFirst.mockResolvedValue(order({ landingPageId: 'lp-1' }));
    await queueConversions('co', 'order.delivered', 'o1');
    expect(queued()).not.toContain('c-store-b');
    expect(queued()).not.toContain('c-jordan');
  });

  it('a page with no store is heard by the company-wide pixel only — unknown is never «matches everything»', async () => {
    db.order.findFirst.mockResolvedValue(order({ landingPageId: 'lp-1', storeId: null, countryId: null }));
    await queueConversions('co', 'order.confirmed', 'o1');
    expect(queued()).toEqual(['c-company']);
  });

  it('NEGATIVE: an order that is not this company’s is owed nothing', async () => {
    db.order.findFirst.mockResolvedValue(null);
    expect(await queueConversions('co', 'order.confirmed', 'o1')).toBe(0);
    expect(db.order.findFirst.mock.calls[0][0]).toMatchObject({ where: { id: 'o1', companyId: 'co' } });
    expect(db.customConversion.findMany).not.toHaveBeenCalled();
  });

  it('a store with no matching pixel queues nothing', async () => {
    db.order.findFirst.mockResolvedValue(order({ landingPageId: 'lp-1', storeId: 'store-c', countryId: 'eg' }));
    db.customConversion.findMany.mockResolvedValue(PIXELS.filter((p) => p.id !== 'c-company'));
    expect(await queueConversions('co', 'order.confirmed', 'o1')).toBe(0);
    expect(db.conversionDelivery.createMany).not.toHaveBeenCalled();
  });
});

describe('the selling page an order came through', () => {
  it('a landing page by its id or its source; a storefront by its source; anything else is none', () => {
    expect(salesPageOf({ source: 'Manual', landingPageId: 'lp-1' })).toBe('LANDING_PAGES');
    expect(salesPageOf({ source: LANDING_PAGE_ORDER_SOURCE, landingPageId: null })).toBe('LANDING_PAGES');
    expect(salesPageOf({ source: STOREFRONT_ORDER_SOURCE, landingPageId: null })).toBe('PUBLIC');
    expect(salesPageOf({ source: 'WhatsApp', landingPageId: null })).toBeNull();
    expect(salesPageOf({ source: null, landingPageId: null })).toBeNull();
  });

  it('and the two spellings are the ones the public doors actually write', () => {
    const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
    expect(read('src/lib/landing-pages.ts')).toContain(`LANDING_PAGE_SOURCE = '${LANDING_PAGE_ORDER_SOURCE}'`);
    for (const door of ['src/app/api/public/stores/[store]/orders/route.ts', 'src/app/api/public/stores/[store]/products/[sku]/orders/route.ts']) {
      expect(read(door)).toContain(`source: '${STOREFRONT_ORDER_SOURCE}'`);
    }
  });
});
