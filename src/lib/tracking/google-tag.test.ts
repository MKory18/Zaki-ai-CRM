// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { validateGoogleTagId, validateTrackingPixelId } from './tracking-validation';
import { googleParams, TRACKING_ADAPTERS } from './tracking-platforms';

/**
 * GOOGLE, AS A PLATFORM LIKE THE OTHER THREE.
 *
 * It was two boxes — a comma list and a 4000-character textarea — that
 * were saved and never loaded by anything. Now a tag is a pixel row, held
 * to the same rule: an id is validated, the loader is hard-coded, and no
 * setting can make the page run code of the seller's choosing.
 */

describe('which ids are accepted', () => {
  it('a GA4 measurement id and a Google Ads tag, normalised to upper case', () => {
    expect(validateGoogleTagId('G-ABC1234567')).toBe('G-ABC1234567');
    expect(validateGoogleTagId('aw-123456789')).toBe('AW-123456789');
    expect(validateTrackingPixelId('GOOGLE', ' G-XYZ98765 ')).toBe('G-XYZ98765');
  });

  it('never a Tag Manager container — it runs whatever is published into it', () => {
    expect(validateGoogleTagId('GTM-ABC1234')).toBeNull();
  });

  it('never anything that could carry code', () => {
    for (const bad of ['G-<script>', 'javascript:alert(1)', 'AW-12ab34', 'G-', 'UA-12345-1', '"G-ABC1234"']) {
      expect(validateGoogleTagId(bad)).toBeNull();
    }
  });
});

describe('the events it sends', () => {
  it('pins every event to its own tag, so two tags never both count one purchase', () => {
    expect(googleParams({}, 'G-ABC1234567').send_to).toBe('G-ABC1234567');
  });

  it('carries the order number, the value and the currency the server gave — nothing personal', () => {
    const p = googleParams(
      { contentIds: ['prod-1'], contentName: 'كريم', value: 25.456, currency: 'jod', orderId: 'SY-9', ...({ phone: '079' } as object) },
      'AW-123456789'
    );
    expect(p).toMatchObject({
      send_to: 'AW-123456789',
      transaction_id: 'SY-9',
      value: 25.46,
      currency: 'JOD',
      items: [{ item_id: 'prod-1', item_name: 'كريم' }],
    });
    expect(JSON.stringify(p)).not.toContain('079');
  });
});

describe('loading the tag', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    delete (window as { gtag?: unknown }).gtag;
    delete (window as { dataLayer?: unknown }).dataLayer;
  });

  it('loads gtag.js once, and turns off the tag\'s own page view — the engine sends one', () => {
    TRACKING_ADAPTERS.GOOGLE.init('G-ABC1234567');
    TRACKING_ADAPTERS.GOOGLE.init('AW-123456789');
    const scripts = document.head.querySelectorAll('script[src^="https://www.googletagmanager.com/gtag/js"]');
    expect(scripts).toHaveLength(1);
    const queue = (window as unknown as { dataLayer: IArguments[] }).dataLayer.map((a) => Array.from(a));
    expect(queue).toContainEqual(['config', 'G-ABC1234567', { send_page_view: false }]);
    expect(queue).toContainEqual(['config', 'AW-123456789', { send_page_view: false }]);
  });

  it('maps a purchase to Google\'s own event name', () => {
    TRACKING_ADAPTERS.GOOGLE.init('G-ABC1234567');
    TRACKING_ADAPTERS.GOOGLE.track('Purchase', { orderId: 'SY-1', value: 10, currency: 'SYP' }, 'G-ABC1234567');
    const queue = (window as unknown as { dataLayer: IArguments[] }).dataLayer.map((a) => Array.from(a));
    expect(queue.at(-1)?.slice(0, 2)).toEqual(['event', 'purchase']);
  });
});
