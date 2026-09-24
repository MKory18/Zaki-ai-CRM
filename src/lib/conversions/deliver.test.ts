import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WHERE A SERVER EVENT GOES, AND WHICH PAGE IT SAYS IT CAME FROM.
 *
 * Two things that were wrong and invisible: every event named a landing
 * page by its id — a URL that answers 404, since public pages resolve by
 * slug — and there was no way to send to a dataset other than the pixel.
 * Neither shows up anywhere except in Meta's match quality, days later.
 */

const { db, sendEvents } = vi.hoisted(() => ({
  db: { conversionDelivery: { findUnique: vi.fn(), update: vi.fn() } },
  sendEvents: vi.fn(),
}));

vi.mock('../db', () => ({ db }));
vi.mock('../secrets', () => ({ decryptSecret: () => 'TOKEN' }));
vi.mock('./meta-capi', async (orig) => ({
  ...(await orig<typeof import('./meta-capi')>()),
  sendEvents: (...a: unknown[]) => sendEvents(...a),
}));

import { deliverConversion } from './emit';

function row(over: { pixel?: Record<string, unknown>; order?: Record<string, unknown> } = {}) {
  return {
    id: 'd1',
    eventId: 'e1',
    attempts: 0,
    conversion: {
      eventName: 'DeliveredPurchase',
      trigger: 'order.delivered',
      valueSource: 'ORDER_TOTAL',
      pixel: { pixelId: '111111111111111', capiDatasetId: null, capiToken: 'enc', capiTestCode: null, platform: 'META', ...over.pixel },
    },
    order: {
      id: 'o1', orderNumber: 'SY-1', totalAmount: 25, collectedAmount: null, currency: 'SYP',
      createdAt: new Date(), confirmedAt: new Date(), deliveredAt: new Date(),
      productId: 'p1', landingPageId: 'lp-uuid-1', landingPage: { slug: 'summer-offer' },
      customer: { id: 'c1', fullName: 'أحمد', phone: '0791234567', rawPhone: null, city: 'عمان', country: 'JO' },
      ...over.order,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com/';
  db.conversionDelivery.update.mockResolvedValue({});
  sendEvents.mockResolvedValue({ received: 1, traceId: 't' });
});

describe('the page an event came from', () => {
  it('is the page\'s public address, by slug', async () => {
    db.conversionDelivery.findUnique.mockResolvedValue(row());
    expect(await deliverConversion('d1')).toBe(true);
    const [, , events] = sendEvents.mock.calls[0];
    expect(events[0].event_source_url).toBe('https://app.example.com/lp/summer-offer');
    expect(events[0].event_source_url).not.toContain('lp-uuid-1');
  });

  it('is left out for an order that did not come from a page', async () => {
    db.conversionDelivery.findUnique.mockResolvedValue(row({ order: { landingPageId: null, landingPage: null } }));
    await deliverConversion('d1');
    expect(sendEvents.mock.calls[0][2][0].event_source_url).toBeUndefined();
  });
});

describe('where the event is sent', () => {
  it('to the pixel, when no dataset is named', async () => {
    db.conversionDelivery.findUnique.mockResolvedValue(row());
    await deliverConversion('d1');
    expect(sendEvents.mock.calls[0][0]).toBe('111111111111111');
  });

  it('to the dataset, when the seller named one', async () => {
    db.conversionDelivery.findUnique.mockResolvedValue(row({ pixel: { capiDatasetId: '999999999999999' } }));
    await deliverConversion('d1');
    expect(sendEvents.mock.calls[0][0]).toBe('999999999999999');
  });
});
