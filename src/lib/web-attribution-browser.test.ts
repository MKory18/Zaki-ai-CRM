// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { collectWebAttribution } from './web-attribution';

/**
 * THE BROWSER'S HALF: what the landing form gathers at submit.
 * The visit's link, kept for the visit; the two Meta cookies; and a click id
 * wrapped in the shape Meta documents when the pixel's cookie is not there.
 */

function visit(search: string) {
  window.history.replaceState({}, '', `/lp/kamaa${search}`);
}
function clearCookies() {
  for (const c of document.cookie.split('; ')) {
    const n = c.split('=')[0];
    if (n) document.cookie = `${n}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

beforeEach(() => {
  sessionStorage.clear();
  clearCookies();
  visit('');
});

describe('collectWebAttribution', () => {
  it('reads the ad link’s own parameters and utm labels', () => {
    visit('?ad_id=120211000000000001&adset_id=120212000000000007&utm_source=facebook&utm_content=cr00042&c=K7Q2');
    expect(collectWebAttribution()).toMatchObject({
      ad_id: '120211000000000001',
      adset_id: '120212000000000007',
      utm_source: 'facebook',
      utm_content: 'cr00042',
    });
  });

  it('reads the _fbc and _fbp cookies', () => {
    document.cookie = '_fbc=fb.1.1762200000000.IwAR0_the_click-id; path=/';
    document.cookie = '_fbp=fb.1.1762200000000.1234567890; path=/';
    expect(collectWebAttribution()).toMatchObject({
      fbc: 'fb.1.1762200000000.IwAR0_the_click-id',
      fbp: 'fb.1.1762200000000.1234567890',
    });
  });

  it('keeps the link for the visit: the query string is gone on the second look, the attribution is not', () => {
    visit('?ad_id=120211000000000001&fbclid=IwAR0_the_click-id');
    const first = collectWebAttribution();
    visit(''); // the visitor wandered off and came back
    const second = collectWebAttribution();
    expect(second.ad_id).toBe('120211000000000001');
    expect(second.fbclid).toBe('IwAR0_the_click-id');
    // …and the _fbc built from the click id keeps the moment it was FIRST seen.
    expect(second.fbc).toBe(first.fbc);
    expect(first.fbc).toMatch(/^fb\.1\.\d{13}\.IwAR0_the_click-id$/);
  });

  it('a pixel cookie beats a built one', () => {
    document.cookie = '_fbc=fb.1.1762200000000.FromTheCookie1; path=/';
    visit('?fbclid=IwAR0_the_click-id');
    expect(collectWebAttribution().fbc).toBe('fb.1.1762200000000.FromTheCookie1');
  });

  it('a visit with nothing yields nothing — and blocked storage does not break it', () => {
    expect(collectWebAttribution()).toEqual({});
    const real = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    try {
      visit('?ad_id=120211000000000001');
      expect(collectWebAttribution().ad_id).toBe('120211000000000001');
    } finally {
      Storage.prototype.getItem = real;
    }
  });

  it('bounds what it carries: a 10k-character parameter is cut', () => {
    visit(`?utm_source=${'x'.repeat(10_000)}`);
    expect(collectWebAttribution().utm_source!.length).toBeLessThanOrEqual(500);
  });
});
