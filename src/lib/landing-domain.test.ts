import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { db } = vi.hoisted(() => ({
  db: { landingPage: { findFirst: vi.fn() }, store: { findFirst: vi.fn() } },
}));
vi.mock('./db', () => ({ db }));

import { normalizeHost, validateDomain, pathForHost, forgetHost } from './landing-domain';

/**
 * A hostname the seller owns, pointed here, serving one landing page.
 *
 * The proxy runs this on every request, so the ways it can go wrong are: a
 * seller claiming the app's own hostname and putting their page where the
 * dashboard lives; an unpublished draft served on a live domain; and a
 * database query per image.
 */

const host = 'shop.example.com';

beforeEach(() => {
  vi.clearAllMocks();
  forgetHost(host);
  db.landingPage.findFirst.mockResolvedValue({ slug: 'winter-offer' });
  db.store.findFirst.mockResolvedValue(null);
});
afterEach(() => { delete process.env.APP_DOMAIN; });

describe('reading a host header', () => {
  it('drops the port and the case, because DNS has neither', () => {
    expect(normalizeHost('Shop.Example.COM:3000')).toBe('shop.example.com');
  });

  it('treats local and numeric hosts as the app itself, never a seller domain', () => {
    for (const h of ['localhost', 'localhost:3000', 'app.localhost', '127.0.0.1', '192.168.1.9']) {
      expect(normalizeHost(h), h).toBeNull();
    }
  });

  it('is nothing when there is no header', () => {
    expect(normalizeHost(null)).toBeNull();
    expect(normalizeHost('')).toBeNull();
  });
});

describe('claiming a domain', () => {
  it('accepts a plain hostname, however it was pasted', () => {
    for (const input of ['shop.example.com', 'https://shop.example.com/', 'SHOP.example.com:443']) {
      const r = validateDomain(input);
      expect(r.ok && r.domain, input).toBe('shop.example.com');
    }
  });

  it('refuses the app’s own domain and anything under it', () => {
    // Otherwise a seller's page lands where the dashboard lives, for everyone.
    process.env.APP_DOMAIN = 'zaki.app';
    expect(validateDomain('zaki.app').ok).toBe(false);
    expect(validateDomain('admin.zaki.app').ok).toBe(false);
    expect(validateDomain('other.com').ok).toBe(true);
  });

  it('refuses what is not a routable hostname', () => {
    for (const bad of ['', 'no-dot', 'localhost', '10.0.0.1', '-bad.com', 'a..b.com', 'x'.repeat(300)]) {
      expect(validateDomain(bad).ok, bad).toBe(false);
    }
  });
});

describe('resolving a host to a page', () => {
  it('serves only a published page', async () => {
    expect(await pathForHost(host)).toBe('/lp/winter-offer');
    expect(db.landingPage.findFirst.mock.calls[0][0].where).toMatchObject({
      domain: host,
      isPublished: true,
    });
  });

  it('falls to a storefront when no page holds the host', async () => {
    db.landingPage.findFirst.mockResolvedValue(null);
    db.store.findFirst.mockResolvedValue({ slug: 'sehha-plus' });
    expect(await pathForHost('shop2.example.com')).toBe('/s/sehha-plus');
    expect(db.store.findFirst.mock.calls[0][0].where).toMatchObject({
      storefrontEnabled: true,
      status: 'ACTIVE',
    });
    forgetHost('shop2.example.com');
  });

  it('does not serve a storefront that was never enabled', async () => {
    db.landingPage.findFirst.mockResolvedValue(null);
    db.store.findFirst.mockResolvedValue(null);
    expect(await pathForHost('shop3.example.com')).toBeNull();
    forgetHost('shop3.example.com');
  });

  it('asks the database once, then remembers', async () => {
    // The proxy runs on every request, including every image.
    await pathForHost(host);
    await pathForHost(host);
    await pathForHost('SHOP.EXAMPLE.COM:8080');
    expect(db.landingPage.findFirst).toHaveBeenCalledTimes(1);
  });

  it('remembers a miss too — the app’s own host asks most often', async () => {
    db.landingPage.findFirst.mockResolvedValue(null);
    expect(await pathForHost('unknown.example.com')).toBeNull();
    await pathForHost('unknown.example.com');
    expect(db.landingPage.findFirst).toHaveBeenCalledTimes(1);
    forgetHost('unknown.example.com');
  });

  it('forgets on demand, so a domain just saved works at once', async () => {
    await pathForHost(host);
    forgetHost(host);
    await pathForHost(host);
    expect(db.landingPage.findFirst).toHaveBeenCalledTimes(2);
  });

  it('falls through to the app when the database is unreachable', async () => {
    // A brief outage must not take every page down; it returns null and the
    // request is served as it was before custom domains existed.
    db.landingPage.findFirst.mockRejectedValue(new Error('connection refused'));
    expect(await pathForHost('down.example.com')).toBeNull();
  });

  it('never queries for a local host', async () => {
    await pathForHost('localhost:3000');
    expect(db.landingPage.findFirst).not.toHaveBeenCalled();
  });
});
