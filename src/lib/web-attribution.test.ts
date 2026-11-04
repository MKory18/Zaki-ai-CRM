import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * WHAT A WEB ORDER REMEMBERS ABOUT ITS AD (the media buyer's work order,
 * §4.1 item 5): `ad_id`, `adset_id`, the Meta cookies, the utm labels.
 *
 * Three things are held here, and the third is the one that matters most
 * to the owner: an order that carries NO attribution is created EXACTLY as
 * it was, and one that carries it changes nothing about the money.
 *
 *   · the server's reader keeps only values of the shape the ad link and
 *     Meta actually produce — everything else is dropped without a word
 *   · the two cookies are sealed with the key a courier password uses, and
 *     are dropped (never stored in the clear) when there is no key
 *   · `createPublicOrder` writes the columns, and nothing else about the
 *     order moves
 * ═══════════════════════════════════════════════════════════════════════
 */

const { db, tx } = vi.hoisted(() => {
  const tx: any = {
    order: { create: vi.fn(async ({ data }: any) => ({ ...data, id: 'o-new' })) },
    orderItem: { createMany: vi.fn(async () => ({ count: 0 })) },
    customer: { update: vi.fn() },
    orderActivity: { create: vi.fn() },
    landingPage: { update: vi.fn() },
  };
  const db: any = {
    region: { findMany: vi.fn(async () => [{ id: 'r1', name: 'عمّان' }]) },
    offer: { findMany: vi.fn(async () => []) },
    order: { groupBy: vi.fn(async () => []) },
    orderChannel: { findFirst: vi.fn(async () => null) },
    store: { findFirst: vi.fn(async () => ({ priceIncludesDelivery: false })) },
    productionBatch: { findMany: vi.fn(async () => []) },
    landingPageRecommendation: { findMany: vi.fn(async () => []) },
    $transaction: vi.fn(async (fn: any) => fn(tx)),
  };
  return { db, tx };
});

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/notification', () => ({ createNotification: vi.fn() }));
vi.mock('@/lib/apps/events', () => ({ emitAppEvent: vi.fn() }));
vi.mock('@/lib/conversions/emit', () => ({ queueConversions: vi.fn() }));
vi.mock('@/lib/customer-identity', () => ({
  findOrCreateCustomer: vi.fn(async () => ({ id: 'cust-1', firstOrderDate: null })),
}));
vi.mock('@/lib/order-ref', () => ({ orderRefFields: vi.fn(async () => ({ orderNumber: 'ORD-77' })) }));
vi.mock('@/lib/blacklist', () => ({ isBlocked: vi.fn(async () => false), NEUTRAL_REFUSAL: 'x' }));
vi.mock('@/lib/notify', () => ({
  notify: vi.fn(),
  afterResponse: (w: () => Promise<unknown>) => {
    void w();
  },
}));

import { createPublicOrder } from './public-order';
import { decryptSecret } from './secrets';
import { cleanLabel, fbcFromClickId, isEmptyAttribution, readWebAttribution } from './web-attribution';
import { attributionColumns } from './web-attribution-server';

const NOW = Date.UTC(2026, 10, 4, 12, 0, 0);
const FBC = 'fb.1.1762200000000.IwAR0_the_click-id';
const FBP = 'fb.1.1762200000000.1234567890';
const KEY = 'c'.repeat(64);

const attribution = (over: Record<string, unknown> = {}) => ({
  ad_id: '120211000000000001',
  adset_id: '120212000000000007',
  fbc: FBC,
  fbp: FBP,
  utm_source: 'facebook',
  utm_medium: 'paid',
  utm_campaign: 'trf01-jo',
  utm_content: 'cr00042',
  utm_term: 'women',
  ...over,
});

let saved: string | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  saved = process.env.APP_ENCRYPTION_KEY;
  process.env.APP_ENCRYPTION_KEY = KEY;
});
afterEach(() => {
  if (saved === undefined) delete process.env.APP_ENCRYPTION_KEY;
  else process.env.APP_ENCRYPTION_KEY = saved;
  vi.restoreAllMocks();
});

describe('the server keeps only what the ad link and Meta really produce', () => {
  it('a complete, well-formed attribution is kept whole', () => {
    expect(readWebAttribution({ attribution: attribution() }, NOW)).toEqual({
      adId: '120211000000000001',
      adsetId: '120212000000000007',
      fbc: FBC,
      fbp: FBP,
      utmSource: 'facebook',
      utmMedium: 'paid',
      utmCampaign: 'trf01-jo',
      utmContent: 'cr00042',
      utmTerm: 'women',
    });
  });

  it('ids must be digits: a name, a script, a negative or a too-short one is dropped', () => {
    for (const bad of ['ad-1', '<script>', '-120211000000000001', '12', '1'.repeat(40), '120 211', 120211000000000001, null]) {
      const r = readWebAttribution({ attribution: { ad_id: bad, adset_id: bad } }, NOW);
      expect(r.adId, String(bad)).toBeNull();
      expect(r.adsetId, String(bad)).toBeNull();
    }
  });

  it('_fbc and _fbp must be Meta’s shape, else dropped', () => {
    for (const bad of ['', 'abc', 'fb.1.x.y', 'fb.9.1762200000000.IwAR0_the_click', FBC + '<b>', 'fb.1.1762200000000.']) {
      expect(readWebAttribution({ attribution: { fbc: bad } }, NOW).fbc, bad).toBeNull();
    }
    for (const bad of ['', 'fb.1.1762200000000.notdigits', 'fb.1.1762200000000.12', FBC]) {
      expect(readWebAttribution({ attribution: { fbp: bad } }, NOW).fbp, bad).toBeNull();
    }
  });

  it('a bare click id becomes the _fbc Meta documents, at the order’s own time; the cookie wins when both come', () => {
    expect(readWebAttribution({ attribution: { fbclid: 'IwAR0_the_click-id' } }, NOW).fbc).toBe(`fb.1.${NOW}.IwAR0_the_click-id`);
    expect(readWebAttribution({ attribution: { fbclid: 'IwAR0_the_click-id', fbc: FBC } }, NOW).fbc).toBe(FBC);
    expect(readWebAttribution({ attribution: { fbclid: 'short' } }, NOW).fbc).toBeNull();
    expect(fbcFromClickId('has space and <', NOW)).toBeNull();
  });

  it('labels are trimmed, flattened, bounded at 100, and an empty one is null', () => {
    expect(cleanLabel('  a\n\tb  ')).toBe('a b');
    expect(cleanLabel('x'.repeat(500))).toHaveLength(100);
    expect(cleanLabel('   ')).toBeNull();
    expect(cleanLabel({})).toBeNull();
    expect(cleanLabel('a\u0000b\u001fc')).toBe('a b c');
  });

  it('nothing, rubbish and the wrong type are all «no attribution» — never a throw', () => {
    for (const raw of [undefined, null, 7, 'x', [], {}, { attribution: null }, { attribution: 'x' }, { attribution: [] }]) {
      expect(isEmptyAttribution(readWebAttribution(raw, NOW)), JSON.stringify(raw)).toBe(true);
    }
  });
});

describe('the columns an order writes', () => {
  it('the cookies are sealed — they open to the originals and are not the originals', () => {
    const cols = attributionColumns(readWebAttribution({ attribution: attribution() }, NOW));
    expect(cols.fbcEnc).toMatch(/^v1:/);
    expect(cols.fbcEnc).not.toContain('IwAR0');
    expect(decryptSecret(cols.fbcEnc)).toBe(FBC);
    expect(decryptSecret(cols.fbpEnc)).toBe(FBP);
    // The rest is plain; there is no plaintext cookie column at all.
    expect(cols).toMatchObject({
      adId: '120211000000000001',
      adsetId: '120212000000000007',
      adSourceType: 'URL',
      utmSource: 'facebook',
      utmTerm: 'women',
    });
    expect(Object.keys(cols)).not.toContain('fbc');
    expect(Object.keys(cols)).not.toContain('fbp');
    expect(JSON.stringify(cols)).not.toContain(FBP);
  });

  it('with no encryption key the cookies are DROPPED, never stored in the clear — the rest still is', () => {
    delete process.env.APP_ENCRYPTION_KEY;
    delete process.env.WHATSAPP_ENCRYPTION_KEY;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cols = attributionColumns(readWebAttribution({ attribution: attribution() }, NOW));
    expect(cols.fbcEnc).toBeUndefined();
    expect(cols.fbpEnc).toBeUndefined();
    expect(cols.adId).toBe('120211000000000001');
    expect(JSON.stringify(cols)).not.toContain(FBC);
    // The one line it logs names the missing key, never a value.
    expect(JSON.stringify(err.mock.calls)).not.toContain(FBC);
  });

  it('nothing to keep → no keys at all', () => {
    expect(attributionColumns(readWebAttribution({}, NOW))).toEqual({});
  });

  it('only utm labels → no adSourceType (no ad was named)', () => {
    const cols = attributionColumns(readWebAttribution({ attribution: { utm_source: 'fb' } }, NOW));
    expect(cols).toEqual({ utmSource: 'fb' });
  });
});

describe('createPublicOrder — the order is the same order', () => {
  const surface = (n: number) => ({
    companyId: 'c1',
    store: {
      id: 'store-a',
      countryId: 'jo',
      country: { code: 'JO', currencyCode: 'JOD', orderPrefix: 'ORD', minorUnit: 3 },
    },
    products: [{ id: 'p-a', name: 'منتج أ', image: null, basePrice: 20 }],
    landingPage: null,
    source: 'Landing',
    campaignId: null,
    dedupeScope: `attr-${n}`,
    notice: { title: 'طلب', message: (x: string) => x },
  });
  const body = (over: Record<string, unknown> = {}) => ({
    full_name: 'زبون تجريبي',
    phone: '0790000000',
    address: 'شارع الاختبار، بناية ٣',
    city: 'عمّان',
    ...over,
  });
  const data = () => tx.order.create.mock.calls.at(-1)![0].data;

  it('an order with no attribution has none of the new keys — byte for byte as before', async () => {
    const r = await createPublicOrder(surface(1) as never, body());
    expect(r.ok, JSON.stringify(r)).toBe(true);
    for (const k of ['adId', 'adsetId', 'adSourceType', 'fbcEnc', 'fbpEnc', 'utmSource', 'utmMedium', 'utmCampaign', 'utmContent', 'utmTerm']) {
      expect(data(), k).not.toHaveProperty(k);
    }
  });

  it('with attribution it writes the columns — and the money, lines and campaign do not move', async () => {
    await createPublicOrder(surface(2) as never, body());
    const plain = data();
    const r = await createPublicOrder(surface(3) as never, body({ attribution: attribution(), phone: '0790000001' }));
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const withAd = data();

    expect(withAd).toMatchObject({
      adId: '120211000000000001',
      adsetId: '120212000000000007',
      adSourceType: 'URL',
      utmSource: 'facebook',
      utmCampaign: 'trf01-jo',
    });
    expect(decryptSecret(withAd.fbcEnc)).toBe(FBC);
    expect(decryptSecret(withAd.fbpEnc)).toBe(FBP);

    // Everything the new columns are NOT: identical.
    const strip = ({ adId, adsetId, adSourceType, fbcEnc, fbpEnc, utmSource, utmMedium, utmCampaign, utmContent, utmTerm, ...rest }: any) => rest;
    expect(strip(withAd)).toEqual(strip(plain));
    expect(withAd.totalAmount).toBe(plain.totalAmount);
    expect(withAd.campaignId).toBe(plain.campaignId);
  });

  it('a hand-edited, hostile attribution still creates the order, with nothing hostile stored', async () => {
    const r = await createPublicOrder(
      surface(4) as never,
      body({
        phone: '0790000002',
        attribution: { ad_id: "1; DROP TABLE orders;--", fbc: '<script>', fbp: {}, utm_source: 'x'.repeat(10_000) },
      })
    );
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(data().adId).toBeUndefined();
    expect(data().fbcEnc).toBeUndefined();
    expect(data().utmSource).toHaveLength(100);
  });
});
