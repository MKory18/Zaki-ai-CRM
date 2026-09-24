import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE EDGE PASS, FROM A SHOPPER'S SIDE.
 *
 * A shopper has no session. Everything a public page needs to draw itself
 * must reach them anyway; everything of the dashboard's must not. The
 * self-hosted font faces fell between the two — their extension is not in
 * the matcher's static-asset list, so the request reached the session check
 * and every public page was answered with a 302 to /login for its own font.
 */

const { hostSite } = vi.hoisted(() => ({ hostSite: vi.fn() }));
vi.mock('@/lib/landing-domain', async (orig) => ({
  ...(await orig<typeof import('@/lib/landing-domain')>()),
  hostSite,
}));

import { proxy } from './proxy';

const get = (path: string, host = 'app.example.com', cookie?: string) =>
  proxy(
    new Request(`https://${host}${path}`, {
      headers: cookie ? { host, cookie } : { host },
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  hostSite.mockResolvedValue(null); // the app's own hostname
});

describe('what a visitor with no session may fetch', () => {
  it.each([
    '/fonts/kawkab-300.woff2',
    '/fonts/kawkab-700.woff2',
    '/fonts/kawkab-OFL.txt',
  ])('%s — a face a public page declares, so it must not need signing in', async (path) => {
    const res = await get(path);
    expect(res.status, path).toBe(200);
    expect(res.headers.get('location'), path).toBeNull();
  });

  it.each(['/lp/winter', '/s/seha', '/login'])('%s passes through', async (path) => {
    expect((await get(path)).headers.get('location')).toBeNull();
  });
});

describe('what it may not', () => {
  it.each(['/', '/orders', '/finance/wallets', '/fonts-admin', '/settings/tracking'])(
    '%s is the dashboard, and sends them to sign in',
    async (path) => {
      const res = await get(path);
      expect(res.status, path).toBe(307);
      expect(new URL(res.headers.get('location')!).pathname, path).toBe('/login');
    }
  );
});

describe("a seller's own domain", () => {
  it('serves the fonts from our own folder, not rewritten under the page', async () => {
    hostSite.mockResolvedValue({ path: '/lp/winter', companyId: 'c1' });
    const res = await get('/fonts/kawkab-300.woff2', 'shop.example.com');
    expect(hostSite).not.toHaveBeenCalled(); // skipped before the lookup
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
    expect(res.headers.get('location')).toBeNull();
  });
});
