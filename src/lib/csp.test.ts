import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import nextConfig from '../../next.config';
import { PIXEL_SCRIPT_ORIGINS, SELLING_PAGE_CSP, SELLING_PAGE_HEADERS } from './csp';

/**
 * PIXELS LOAD ON SELLING PAGES, AND NOWHERE ELSE.
 *
 * Every page used to send `script-src 'self'`, so the browser refused all
 * four pixel loaders and not one browser pixel ever fired — while the
 * dashboard, which should load none, asked for them on every screen.
 */

const directive = (csp: string, name: string) =>
  csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? '';

describe('the selling-page policy', () => {
  it('lets every pixel loader in the adapters load — checked against the adapter source, so the two cannot drift', () => {
    const src = fs.readFileSync('src/lib/tracking/tracking-platforms.ts', 'utf8');
    const loaders = [...src.matchAll(/'(https:\/\/[^'/]+)\/[^']*'/g)].map((m) => m[1]);
    expect(loaders.length).toBeGreaterThanOrEqual(4);
    const scriptSrc = directive(SELLING_PAGE_CSP, 'script-src');
    for (const origin of loaders) expect(scriptSrc).toContain(origin);
  });

  it('still refuses to be framed by any other site', () => {
    expect(directive(SELLING_PAGE_CSP, 'frame-ancestors')).toBe("frame-ancestors 'self'");
  });
});

describe('which paths get which policy', () => {
  it('landing pages and every storefront path answer with the selling-page headers', async () => {
    const rules = await nextConfig.headers!();
    const lp = rules.find((r) => r.source === '/lp/:slug');
    const store = rules.find((r) => r.source === '/s/:path*');
    expect(lp?.headers).toBe(SELLING_PAGE_HEADERS);
    expect(store?.headers).toBe(SELLING_PAGE_HEADERS);
  });

  it('the dashboard keeps the shut policy — no pixel origin anywhere in it', async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === '/:path*')!;
    const csp = all.headers.find((h) => h.key === 'Content-Security-Policy')!.value;
    for (const origin of PIXEL_SCRIPT_ORIGINS) expect(csp).not.toContain(origin);
  });

  it('the old tracking address sends people to the new one', async () => {
    const redirects = await nextConfig.redirects!();
    expect(redirects).toContainEqual(
      expect.objectContaining({ source: '/settings/pixels', destination: '/settings/tracking' })
    );
  });
});

describe('the uploaded HTML of a landing page', () => {
  it("is sandboxed by the header that actually reaches the browser — the config's", async () => {
    // Next writes the config's headers first and drops a route's same-named
    // one, so a sandbox sent only by the route never arrived.
    const rules = await nextConfig.headers!();
    const raw = rules.find((r) => r.source === '/lp/:slug/raw')!;
    const csp = raw.headers.find((h) => h.key === 'Content-Security-Policy')!.value;
    const sandbox = directive(csp, 'sandbox');
    expect(sandbox).toContain('sandbox allow-scripts');
    expect(sandbox).not.toContain('allow-same-origin');
  });
});

describe('the dashboard registers no pixel', () => {
  it('the root layout starts the engine empty — pixels come from the selling page being rendered', () => {
    const layout = fs.readFileSync('src/app/layout.tsx', 'utf8');
    expect(layout).toContain('<GlobalTrackingProvider pixels={[]}>');
    expect(layout).not.toMatch(/getSiteTrackingPixels|getTrackingPixelsForPage/);
  });
});
