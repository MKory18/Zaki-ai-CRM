import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { db } = vi.hoisted(() => ({
  db: { landingPage: { findFirst: vi.fn(), findMany: vi.fn() }, store: { findFirst: vi.fn() } },
}));
vi.mock('./db', () => ({ db }));

import { normalizeHost, validateDomain, pathForHost, forgetHost, dashboardHosts, hostSite, inHostScope } from './landing-domain';

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
  db.landingPage.findFirst.mockResolvedValue({ id: 'lp-own', slug: 'winter-offer', createdAt: new Date(2026, 8, 1) });
  db.landingPage.findMany.mockResolvedValue([]);
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

  it('refuses the host the dashboard answered on, even with APP_DOMAIN unset', () => {
    // APP_DOMAIN is optional and was unset in the documented deploy, which
    // left the dashboard's own hostname free to claim.
    const saved = { d: process.env.APP_DOMAIN, u: process.env.NEXT_PUBLIC_APP_URL, a: process.env.APP_URL };
    delete process.env.APP_DOMAIN;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.APP_URL;
    try {
      expect(validateDomain('crm.example.com', 'crm.example.com:443').ok).toBe(false);
      expect(validateDomain('shop.crm.example.com', 'CRM.example.com').ok).toBe(false);
      expect(validateDomain('shop.example.com', 'crm.example.com').ok).toBe(true);
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.zaki.io/';
      expect(validateDomain('app.zaki.io').ok).toBe(false);
    } finally {
      process.env.APP_DOMAIN = saved.d ?? '';
      if (saved.d === undefined) delete process.env.APP_DOMAIN;
      if (saved.u === undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL = saved.u;
      if (saved.a === undefined) delete process.env.APP_URL; else process.env.APP_URL = saved.a;
    }
  });

  it('knows the dashboard by every name a request carries — forwarded host, Origin, Referer', () => {
    const req = new Request('http://internal:3000/api/landing-pages/x', {
      method: 'PATCH',
      headers: {
        'x-forwarded-host': 'crm.example.com',
        origin: 'https://panel.example.com',
        referer: 'https://admin.example.com/growth/landing-pages/x',
      },
    });
    const hosts = dashboardHosts(req);
    const saved = { d: process.env.APP_DOMAIN, u: process.env.NEXT_PUBLIC_APP_URL, a: process.env.APP_URL };
    delete process.env.APP_DOMAIN;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.APP_URL;
    try {
      for (const own of ['crm.example.com', 'panel.example.com', 'admin.example.com']) {
        expect(validateDomain(own, hosts).ok, own).toBe(false);
      }
      expect(validateDomain('shop.example.com', hosts).ok).toBe(true);
    } finally {
      if (saved.d !== undefined) process.env.APP_DOMAIN = saved.d;
      if (saved.u !== undefined) process.env.NEXT_PUBLIC_APP_URL = saved.u;
      if (saved.a !== undefined) process.env.APP_URL = saved.a;
    }
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

describe('what the host of a seller may serve', () => {
  // The public space (/lp, /s) is shared by every company. A seller's host
  // answered for all of it: shop-a.com/lp/<any company's page> rendered that
  // page under seller A's domain. A host now serves its own paths only.
  it('the host of a page: that page, and nothing else', async () => {
    const site = (await hostSite(host))!;
    expect(inHostScope(site, '/lp/winter-offer')).toBe(true);
    expect(inHostScope(site, '/lp/winter-offer/raw')).toBe(true);
    expect(inHostScope(site, '/lp/winter-offer-2')).toBe(false);
    expect(inHostScope(site, '/lp/another-company')).toBe(false);
    expect(inHostScope(site, '/s/any-store')).toBe(false);
  });

  it('the host of a store: the store and its own published pages', async () => {
    db.landingPage.findFirst.mockResolvedValue(null);
    db.store.findFirst.mockResolvedValue({ slug: 'sehha-plus', landingPages: [{ id: 'lp-front', slug: 'front', createdAt: new Date(2026, 8, 1) }] });
    const site = (await hostSite('shop4.example.com'))!;
    expect(site.path).toBe('/s/sehha-plus');
    expect(inHostScope(site, '/s/sehha-plus/p/SKU1')).toBe(true);
    expect(inHostScope(site, '/lp/front/raw')).toBe(true);
    expect(inHostScope(site, '/s/sehha')).toBe(false);
    expect(inHostScope(site, '/lp/not-ours')).toBe(false);
    expect(db.store.findFirst.mock.calls[0][0].select.landingPages.where).toEqual({ isPublished: true });
    forgetHost('shop4.example.com');
  });

  it('leaves out a legacy slug an older page of another company holds — that path shows the other page', async () => {
    db.landingPage.findFirst.mockResolvedValue(null);
    db.store.findFirst.mockResolvedValue({
      slug: 'sehha-plus',
      landingPages: [
        { id: 'lp-a', slug: 'offer', createdAt: new Date(2026, 8, 10) },
        { id: 'lp-b', slug: 'own-only', createdAt: new Date(2026, 8, 10) },
      ],
    });
    db.landingPage.findMany.mockResolvedValue([{ slug: 'offer', createdAt: new Date(2026, 7, 1) }]);
    const site = (await hostSite('shop5.example.com'))!;
    expect(inHostScope(site, '/lp/offer')).toBe(false);
    expect(inHostScope(site, '/lp/own-only')).toBe(true);
    forgetHost('shop5.example.com');
  });

  it('does not serve the host of a page another older page shadows at all', async () => {
    db.landingPage.findMany.mockResolvedValue([{ slug: 'winter-offer', createdAt: new Date(2026, 7, 1) }]);
    expect(await hostSite('shop6.example.com')).toBeNull();
    forgetHost('shop6.example.com');
  });

  it('a newer page with the same slug does not shadow the older one', async () => {
    db.landingPage.findMany.mockResolvedValue([{ slug: 'winter-offer', createdAt: new Date(2026, 9, 1) }]);
    expect((await hostSite('shop7.example.com'))?.path).toBe('/lp/winter-offer');
    forgetHost('shop7.example.com');
  });
});
