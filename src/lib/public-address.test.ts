import { describe, expect, it } from 'vitest';
import { domainIsLive, publicAddress, publicPath } from './public-address';

/**
 * THE ADDRESS HANDED TO A CUSTOMER.
 *
 * The property under test is not "does it build a string" — it is WHAT IS
 * REFUSED. A domain that has never resolved must never be offered as the
 * shop's address, because the seller pastes it into a paid advertisement and
 * finds out from the customer.
 */

describe('publicPath', () => {
  it('a landing page answers under /lp and a storefront under /s', () => {
    expect(publicPath({ kind: 'lp', slug: 'offer-1' })).toBe('/lp/offer-1');
    expect(publicPath({ kind: 'store', slug: 'sehha-plus' })).toBe('/s/sehha-plus');
  });
});

describe('domainIsLive', () => {
  it('needs BOTH a domain and a verification behind it', () => {
    expect(domainIsLive({ domain: 'shop.com', domainVerifiedAt: new Date() })).toBe(true);
  });

  it('a domain nobody has checked is NOT live', () => {
    expect(domainIsLive({ domain: 'shop.com', domainVerifiedAt: null })).toBe(false);
  });

  it('a verification with no domain left standing is NOT live', () => {
    // Clearing a domain clears the stamp, but a row that slipped through
    // must not read as live on the strength of a date alone.
    expect(domainIsLive({ domain: null, domainVerifiedAt: new Date() })).toBe(false);
    expect(domainIsLive({ domain: '   ', domainVerifiedAt: new Date() })).toBe(false);
  });
});

describe('publicAddress', () => {
  it('with no domain it is the app’s own address', () => {
    const a = publicAddress('https://app.example.com', { kind: 'lp', slug: 'offer-1' });
    expect(a.url).toBe('https://app.example.com/lp/offer-1');
    expect(a.source).toBe('APP');
    expect(a.pending).toBeNull();
  });

  it('a VERIFIED domain is the address, and carries no path', () => {
    // The proxy rewrites the host's root to the page. `https://shop.com/s/x`
    // is a 404 on the seller's own domain — a host answers for its own scope
    // only.
    const a = publicAddress('https://app.example.com', {
      kind: 'store', slug: 'sehha-plus', domain: 'shop.com', domainVerifiedAt: '2026-09-01T00:00:00.000Z',
    });
    expect(a.url).toBe('https://shop.com');
    expect(a.source).toBe('DOMAIN');
    expect(a.pending).toBeNull();
    // The internal address is still reported: it never stops working.
    expect(a.path).toBe('/s/sehha-plus');
  });

  it('AN UNVERIFIED DOMAIN IS NOT THE ADDRESS — and the reason is said, not swallowed', () => {
    const a = publicAddress('https://app.example.com', {
      kind: 'store', slug: 'sehha-plus', domain: 'shop.com', domainVerifiedAt: null,
    });
    expect(a.url).toBe('https://app.example.com/s/sehha-plus');
    expect(a.source).toBe('APP');
    expect(a.pending?.domain).toBe('shop.com');
    expect(a.pending?.reason, 'نطاق غير متحقَّق يُسلَّم بلا سبب مكتوب').toBeTruthy();
  });

  it('never offers the unverified host, however it was typed', () => {
    for (const verifiedAt of [null, undefined, '' as unknown as null]) {
      const a = publicAddress('https://app.example.com', {
        kind: 'lp', slug: 'offer-1', domain: 'Shop.COM ', domainVerifiedAt: verifiedAt,
      });
      expect(a.url, String(verifiedAt)).not.toContain('shop.com');
      expect(a.url, String(verifiedAt)).not.toContain('Shop.COM');
    }
  });

  it('with no origin it yields the bare path, never a URL with undefined in it', () => {
    for (const origin of [null, undefined, '']) {
      const a = publicAddress(origin, { kind: 'lp', slug: 'offer-1' });
      expect(a.url).toBe('/lp/offer-1');
      expect(a.url).not.toContain('undefined');
    }
  });

  it('a trailing slash on the origin does not double up', () => {
    expect(publicAddress('https://app.example.com///', { kind: 'lp', slug: 'x' }).url)
      .toBe('https://app.example.com/lp/x');
  });
});
