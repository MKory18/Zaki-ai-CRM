// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { TrackingEngine } from './tracking-client';
import { TRACKING_ADAPTERS, type TrackingAdapter } from './tracking-platforms';
import { sanitizeTrackingPayload, type TrackingPixelView } from './tracking-types';
import { validateGoogleTagId } from './tracking-validation';

/**
 * WHAT ACTUALLY REACHED A PLATFORM.
 *
 * Three silent losses, each invisible except in an ad account's numbers:
 * a ViewContent sent before the pixel existed (dropped, and marked fired);
 * the products and the order number lost by sanitising a sanitised payload;
 * and a Google Ads tag that could never record a conversion.
 */

const pixel = (over: Partial<TrackingPixelView>): TrackingPixelView => ({
  id: 'p1', platform: 'META', name: 'm', pixelId: '111111111111111', scope: 'GLOBAL', enabled: true, ...over,
});

function recorder() {
  const log: { platform: string; what: string; payload?: Record<string, unknown> }[] = [];
  const make = (platform: 'META' | 'TIKTOK' | 'SNAPCHAT' | 'GOOGLE'): TrackingAdapter => ({
    platform,
    init() { log.push({ platform, what: 'init' }); },
    track(event, payload) { log.push({ platform, what: event, payload: payload as Record<string, unknown> }); },
  });
  return { log, adapters: { META: make('META'), TIKTOK: make('TIKTOK'), SNAPCHAT: make('SNAPCHAT'), GOOGLE: make('GOOGLE') } };
}

describe('an event asked for before the page started', () => {
  it('waits, and goes out right after PageView — once', () => {
    const { log, adapters } = recorder();
    const engine = new TrackingEngine({ pixels: [], page: 'PUBLIC', adapters });
    // What a landing page does: register, announce the product, THEN the
    // provider starts the engine.
    engine.registerPixels([pixel({})]);
    engine.setPage('LANDING_PAGES');
    engine.track('ViewContent', { contentIds: ['prod-1'], value: 10, currency: 'SYP' });
    expect(log).toEqual([]);
    engine.initAll();
    expect(log.map((l) => l.what)).toEqual(['init', 'PageView', 'ViewContent']);
    expect(log[2].payload?.content_ids).toEqual(['prod-1']);
  });
});

describe('a pixel registered after the page started', () => {
  it('is loaded on its first event rather than never', () => {
    const { log, adapters } = recorder();
    const engine = new TrackingEngine({ pixels: [], page: 'PUBLIC', adapters });
    engine.initAll();
    engine.registerPixels([pixel({ id: 'late' })]);
    engine.track('ViewContent', { contentIds: ['prod-1'] });
    expect(log.map((l) => l.what)).toEqual(['init', 'ViewContent']);
  });
});

describe('ViewContent', () => {
  it('is once per PRODUCT, so the next product page counts as a view', () => {
    const { log, adapters } = recorder();
    const engine = new TrackingEngine({ pixels: [pixel({})], page: 'PUBLIC', adapters });
    engine.initAll();
    engine.track('ViewContent', { contentIds: ['a'] });
    engine.track('ViewContent', { contentIds: ['a'] });
    engine.track('ViewContent', { contentIds: ['b'] });
    expect(log.filter((l) => l.what === 'ViewContent').map((l) => (l.payload?.content_ids as string[])[0])).toEqual(['a', 'b']);
  });
});

describe('sanitising twice', () => {
  it('keeps the products and the order number', () => {
    const once = sanitizeTrackingPayload({ contentIds: ['p1'], contentName: 'كريم', orderId: 'SY-1', value: 5, currency: 'syp' });
    expect(sanitizeTrackingPayload(once)).toEqual(once);
    expect(once).toMatchObject({ content_ids: ['p1'], order_id: 'SY-1', currency: 'SYP' });
  });
});

describe('through the real adapters', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    for (const k of ['fbq', '_fbq', 'gtag', 'dataLayer', 'snaptr']) delete (window as unknown as Record<string, unknown>)[k];
  });

  it('a Purchase carries its order number to Snapchat and to Google', () => {
    const engine = new TrackingEngine({
      pixels: [
        pixel({ id: 's', platform: 'SNAPCHAT', pixelId: '110ec58a-a0f2-4ac4-8393-c866d813b8d1' }),
        pixel({ id: 'g', platform: 'GOOGLE', pixelId: 'G-ABC1234567' }),
      ],
      page: 'PUBLIC',
      adapters: TRACKING_ADAPTERS,
    });
    engine.initAll();
    engine.track('Purchase', { orderId: 'SY-77', value: 25, currency: 'SYP', contentIds: ['p1'] });
    const snap = ((window as unknown as { snaptr: { queue: unknown[][] } }).snaptr.queue).find((c) => c[1] === 'PURCHASE');
    expect((snap?.[2] as Record<string, unknown>).transaction_id).toBe('SY-77');
    const g = (window as unknown as { dataLayer: IArguments[] }).dataLayer.map((a) => Array.from(a)).find((c) => c[1] === 'purchase');
    expect(g?.[2]).toMatchObject({ transaction_id: 'SY-77', items: [{ item_id: 'p1' }] });
  });
});

describe('a Google Ads tag', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    delete (window as unknown as Record<string, unknown>).gtag;
    delete (window as unknown as Record<string, unknown>).dataLayer;
  });

  it('accepts its conversion label and keeps the label\'s case', () => {
    expect(validateGoogleTagId('aw-123456789/AbC-dEf_9')).toBe('AW-123456789/AbC-dEf_9');
    expect(validateGoogleTagId('G-ABC1234567/label')).toBeNull(); // a label is an Ads thing
    expect(validateGoogleTagId('AW-123/x/y')).toBeNull();
  });

  it('loads the tag without the label, and records the purchase as the conversion', () => {
    const engine = new TrackingEngine({
      pixels: [pixel({ id: 'a', platform: 'GOOGLE', pixelId: 'AW-123456789/AbC-dEf' })],
      page: 'PUBLIC',
      adapters: TRACKING_ADAPTERS,
    });
    engine.initAll();
    engine.track('Purchase', { orderId: 'SY-9', value: 30, currency: 'JOD' });
    expect(document.head.querySelector('script')?.getAttribute('src')).toBe('https://www.googletagmanager.com/gtag/js?id=AW-123456789');
    const q = (window as unknown as { dataLayer: IArguments[] }).dataLayer.map((a) => Array.from(a));
    expect(q).toContainEqual(['config', 'AW-123456789', { send_page_view: false }]);
    const conversion = q.find((c) => c[0] === 'event' && c[1] === 'conversion');
    expect(conversion?.[2]).toMatchObject({ send_to: 'AW-123456789/AbC-dEf', transaction_id: 'SY-9', value: 30, currency: 'JOD' });
  });
});
