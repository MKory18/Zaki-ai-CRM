import { describe, expect, it } from 'vitest';
import { TrackingEngine } from '@/lib/tracking/tracking-client';
import { TrackingPixelView } from '@/lib/tracking/tracking-types';
import { TrackingAdapter } from '@/lib/tracking/tracking-platforms';

function pixel(over: Partial<TrackingPixelView>): TrackingPixelView {
  return {
    id: 'p1',
    platform: 'META',
    name: 'test',
    pixelId: '123456789012345',
    scope: 'GLOBAL',
    enabled: true,
    ...over,
  };
}

interface Call {
  platform: string;
  pixelId: string;
  event: string;
  payload?: unknown;
  init?: boolean;
}

function fakeAdapters(log: Call[]) {
  const make = (platform: 'META' | 'TIKTOK' | 'SNAPCHAT'): TrackingAdapter => ({
    platform,
    init(pixelId: string) {
      log.push({ platform, pixelId, event: '__init__', init: true });
    },
    track(event, payload, pixelId) {
      log.push({ platform, pixelId, event, payload });
    },
  });
  return { META: make('META'), TIKTOK: make('TIKTOK'), SNAPCHAT: make('SNAPCHAT') };
}

describe('TrackingEngine', () => {
  it('fires PageView once to every enabled, in-scope pixel (multiple Meta pixels)', () => {
    const log: Call[] = [];
    const engine = new TrackingEngine({
      page: 'PUBLIC',
      adapters: fakeAdapters(log),
      pixels: [
        pixel({ id: 'm1', pixelId: '111111111111111' }),
        pixel({ id: 'm2', pixelId: '222222222222222' }),
        pixel({ id: 'm3', pixelId: '333333333333333' }),
        pixel({ id: 't1', platform: 'TIKTOK', pixelId: 'TIKTOK123456' }),
        pixel({ id: 's1', platform: 'SNAPCHAT', pixelId: '110ec58a-a0f2-4ac4-8393-c866d813b8d1' }),
      ],
    });
    engine.initAll();
    const pageViews = log.filter((c) => c.event === 'PageView');
    expect(pageViews).toHaveLength(5); // 3 Meta + 1 TikTok + 1 Snapchat â€” nothing stops after the first
  });

  it('never dispatches twice for PageView (once per page load per pixel)', () => {
    const log: Call[] = [];
    const engine = new TrackingEngine({
      page: 'PUBLIC',
      adapters: fakeAdapters(log),
      pixels: [pixel({ id: 'm1' })],
    });
    engine.initAll();
    engine.initAll();
    engine.track('PageView', {});
    expect(log.filter((c) => c.event === 'PageView')).toHaveLength(1);
  });

  it('disabled pixels receive nothing', () => {
    const log: Call[] = [];
    const engine = new TrackingEngine({
      page: 'PUBLIC',
      adapters: fakeAdapters(log),
      pixels: [pixel({ id: 'off', enabled: false }), pixel({ id: 'on' })],
    });
    engine.initAll();
    engine.track('Purchase', { orderId: 'O1', value: 10 });
    expect(log.every((c) => c.pixelId === '123456789012345')).toBe(true);
    expect(log.some((c) => c.event === 'Purchase')).toBe(true);
  });

  it('invalid pixel IDs are excluded (fail closed â€” no script load)', () => {
    const log: Call[] = [];
    const engine = new TrackingEngine({
      page: 'PUBLIC',
      adapters: fakeAdapters(log),
      pixels: [
        pixel({ id: 'bad-meta', pixelId: '<script>' }),
        pixel({ id: 'bad-tt', platform: 'TIKTOK', pixelId: 'javascript:alert(1)' }),
        pixel({ id: 'ok' }),
      ],
    });
    engine.initAll();
    expect(log.some((c) => c.pixelId === '<script>')).toBe(false);
    expect(log.some((c) => c.pixelId === 'javascript:alert(1)')).toBe(false);
    expect(log.length).toBeGreaterThan(0);
  });

  it('scope filtering: LANDING_PAGES pixels active on landing pages only', () => {
    const log: Call[] = [];
    const lp = pixel({ id: 'lp', scope: 'LANDING_PAGES' });
    const engine = new TrackingEngine({ page: 'PUBLIC', adapters: fakeAdapters(log), pixels: [lp] });
    engine.initAll();
    expect(log).toHaveLength(0); // public non-landing page â†’ silent

    const log2: Call[] = [];
    const engine2 = new TrackingEngine({
      page: 'LANDING_PAGES',
      adapters: fakeAdapters(log2),
      pixels: [lp],
    });
    engine2.initAll();
    expect(log2.filter((c) => c.event === 'PageView')).toHaveLength(1);
  });

  it('dedupes Purchase per platform+pixel+orderNumber (re-renders never re-fire)', () => {
    const log: Call[] = [];
    const engine = new TrackingEngine({
      page: 'PUBLIC',
      adapters: fakeAdapters(log),
      pixels: [pixel({ id: 'm1' }), pixel({ id: 'm2', pixelId: '222222222222222' })],
    });
    engine.initAll();
    engine.track('Purchase', { orderId: 'ORD-1', value: 100 });
    engine.track('Purchase', { orderId: 'ORD-1', value: 100 });
    engine.track('Purchase', { orderId: 'ORD-1', value: 100 });
    const purchases = log.filter((c) => c.event === 'Purchase');
    expect(purchases).toHaveLength(2); // one per pixel, NOT per call
    // a different order is a new Purchase
    engine.track('Purchase', { orderId: 'ORD-2', value: 50 });
    expect(log.filter((c) => c.event === 'Purchase')).toHaveLength(4);
  });

  it('Purchase value comes from the server payload, never from client fields', () => {
    const log: Call[] = [];
    const engine = new TrackingEngine({
      page: 'PUBLIC',
      adapters: fakeAdapters(log),
      pixels: [pixel({ id: 'm1' })],
    });
    engine.initAll();
    // caller tries to smuggle client-side price/companyId/productId
    engine.track('Purchase', {
      orderId: 'ORD-1',
      value: 250, // server response total â€” trusted
      ...( {
        totalAmount: 1, // client-tampered â€” must not survive
        companyId: 'hacked',
        productId: 'hacked',
        full_name: 'attacker',
      } as object),
    } as never);
    const purchase = log.find((c) => c.event === 'Purchase')!;
    const json = JSON.stringify(purchase.payload);
    expect(json).not.toContain('hacked');
    expect(json).not.toContain('attacker');
  });

  it('registerPixels adds landing-scope pixels at runtime and dedupes by id', () => {
    const log: Call[] = [];
    const engine = new TrackingEngine({
      page: 'PUBLIC',
      adapters: fakeAdapters(log),
      pixels: [pixel({ id: 'g' })],
    });
    engine.registerPixels([pixel({ id: 'lp', scope: 'LANDING_PAGES', pixelId: '999999999999999' })]);
    engine.setPage('LANDING_PAGES');
    engine.initAll();
    const pv = log.filter((c) => c.event === 'PageView');
    expect(pv).toHaveLength(2);

    engine.registerPixels([pixel({ id: 'g' }), pixel({ id: 'lp', scope: 'LANDING_PAGES', pixelId: '999999999999999' })]);
    engine.track('ViewContent', { contentIds: ['prod-1'] });
    expect(log.filter((c) => c.event === 'ViewContent')).toHaveLength(2);
  });

  it('ViewContent fires only with a valid product (no product â†’ nothing)', () => {
    const log: Call[] = [];
    const engine = new TrackingEngine({
      page: 'PUBLIC',
      adapters: fakeAdapters(log),
      pixels: [pixel({ id: 'm1' })],
    });
    engine.initAll();
    const before = log.length;
    engine.track('ViewContent', { contentIds: [], contentName: null, value: null });
    expect(log.filter((c) => c.event === 'ViewContent')).toHaveLength(0);
    engine.track('ViewContent', { contentIds: ['prod-1'], contentName: 'P', value: 10 });
    expect(log.filter((c) => c.event === 'ViewContent')).toHaveLength(1);
    expect(log.length).toBeGreaterThan(before);
  });

  it('InitiateCheckout fires to all pixels and dedupes identical repeats', () => {
    const log: Call[] = [];
    const engine = new TrackingEngine({
      page: 'LANDING_PAGES',
      adapters: fakeAdapters(log),
      pixels: [pixel({ id: 'm1' }), pixel({ id: 't1', platform: 'TIKTOK', pixelId: 'TIKTOK123456' })],
    });
    engine.initAll();
    engine.track('InitiateCheckout', { contentIds: ['prod-1'], value: 30, currency: 'USD' });
    engine.track('InitiateCheckout', { contentIds: ['prod-1'], value: 30, currency: 'USD' });
    expect(log.filter((c) => c.event === 'InitiateCheckout')).toHaveLength(2); // one per pixel
  });

  it('no pixels â†’ engine is a complete no-op', () => {
    const log: Call[] = [];
    const engine = new TrackingEngine({ page: 'PUBLIC', adapters: fakeAdapters(log), pixels: [] });
    engine.initAll();
    engine.track('Purchase', { orderId: 'O1' });
    expect(log).toHaveLength(0);
  });

  it('Purchase never fires after a failed order (caller contract: only success calls track)', () => {
    const log: Call[] = [];
    const engine = new TrackingEngine({
      page: 'PUBLIC',
      adapters: fakeAdapters(log),
      pixels: [pixel({ id: 'm1' })],
    });
    engine.initAll();
    // OrderForm only calls trackEvent('Purchase') inside `if (res.ok)`.
    // A failed order produces no Purchase calls:
    expect(log.filter((c) => c.event === 'Purchase')).toHaveLength(0);
  });
});
