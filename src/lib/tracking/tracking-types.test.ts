import { describe, expect, it } from 'vitest';
import {
  filterPixelsForPage,
  maskPixelId,
  sanitizeTrackingPayload,
  trackingEventKey,
  TrackingPixelView,
} from '@/lib/tracking/tracking-types';

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

describe('sanitizeTrackingPayload — PII protection', () => {
  it('keeps only allowlisted commerce fields', () => {
    const out = sanitizeTrackingPayload({
      contentIds: ['prod-1'],
      contentName: 'T-Shirt',
      value: 19.99,
      currency: 'usd',
      orderId: 'ORD-1',
    });
    expect(out).toEqual({
      content_ids: ['prod-1'],
      content_name: 'T-Shirt',
      value: 19.99,
      currency: 'USD',
      order_id: 'ORD-1',
    });
  });

  it('never emits PII keys even if a caller passes them', () => {
    const out = sanitizeTrackingPayload({
      contentIds: ['prod-1'],
      value: 5,
      ...( {
        full_name: 'John',
        phone: '0912345678',
        address: 'street 1',
        notes: 'secret',
        city: 'Damascus',
        email: 'a@b.c',
        companyId: 'c1',
        productId: 'p1',
      } as object),
    } as never);
    const json = JSON.stringify(out);
    expect(json).not.toContain('John');
    expect(json).not.toContain('0912345678');
    expect(json).not.toContain('street 1');
    expect(json).not.toContain('Damascus');
    expect(json).not.toContain('a@b.c');
  });

  it('drops non-finite and negative values, oversized strings and arrays', () => {
    expect(
      sanitizeTrackingPayload({ value: NaN as unknown as number }).value
    ).toBeUndefined();
    expect(sanitizeTrackingPayload({ value: -5 }).value).toBeUndefined();
    expect(
      sanitizeTrackingPayload({ contentIds: ['x'.repeat(100)] }).content_ids
    ).toBeUndefined();
    expect(sanitizeTrackingPayload({ orderId: 'x'.repeat(100) }).order_id).toBeUndefined();
  });

  it('handles null / garbage payloads', () => {
    expect(sanitizeTrackingPayload(null as never)).toEqual({});
    expect(sanitizeTrackingPayload(undefined as never)).toEqual({});
    expect(sanitizeTrackingPayload('hack' as never)).toEqual({});
  });
});

describe('scope resolution', () => {
  const pixels: TrackingPixelView[] = [
    pixel({ id: 'g', scope: 'GLOBAL' }),
    pixel({ id: 'pub', scope: 'PUBLIC' }),
    pixel({ id: 'lp', scope: 'LANDING_PAGES' }),
    pixel({ id: 'off', scope: 'GLOBAL', enabled: false }),
  ];

  it('PUBLIC pages get GLOBAL + PUBLIC pixels only', () => {
    const ids = filterPixelsForPage(pixels, 'PUBLIC').map((p) => p.id).sort();
    expect(ids).toEqual(['g', 'pub']);
  });

  it('LANDING_PAGES pages get GLOBAL + PUBLIC + LANDING_PAGES pixels', () => {
    const ids = filterPixelsForPage(pixels, 'LANDING_PAGES').map((p) => p.id).sort();
    expect(ids).toEqual(['g', 'lp', 'pub']);
  });

  it('disabled pixels are never included', () => {
    expect(filterPixelsForPage(pixels, 'PUBLIC').some((p) => !p.enabled)).toBe(false);
  });

  it('multiple pixels of the same platform all apply', () => {
    const multi: TrackingPixelView[] = [
      pixel({ id: 'm1' }),
      pixel({ id: 'm2' }),
      pixel({ id: 'm3' }),
    ];
    expect(filterPixelsForPage(multi, 'PUBLIC')).toHaveLength(3);
  });
});

describe('dedupe key + masking', () => {
  it('Purchase dedupe key includes platform + pixel + event + order', () => {
    expect(trackingEventKey('META', '111222333444555', 'Purchase', 'ORD-1')).toBe(
      'META:111222333444555:Purchase:ORD-1'
    );
    expect(trackingEventKey('TIKTOK', 'ABC12345678', 'Purchase', 'ORD-1')).not.toBe(
      trackingEventKey('META', '111222333444555', 'Purchase', 'ORD-1')
    );
    expect(trackingEventKey('META', '111222333444555', 'Purchase', 'ORD-2')).not.toBe(
      trackingEventKey('META', '111222333444555', 'Purchase', 'ORD-1')
    );
  });

  it('non-Purchase events dedupe per pixel without order', () => {
    expect(trackingEventKey('META', '111222333444555', 'PageView')).toBe(
      'META:111222333444555:PageView'
    );
  });

  it('maskPixelId never exposes the full ID in audit logs', () => {
    const masked = maskPixelId('123456789012345');
    expect(masked).not.toBe('123456789012345');
    expect(masked.startsWith('123')).toBe(true);
    expect(masked).toContain('***');
  });
});
