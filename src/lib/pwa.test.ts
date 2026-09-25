import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AN APP THAT INSTALLS — AND NEVER SAVES A TAP FOR LATER.
 *
 * The rule the whole section rests on, and the one that will be broken by
 * somebody being helpful: a service worker's usual trick is to hold a
 * failed request and replay it when the network returns. In this system
 * that trick WRITES MONEY.
 *
 * An agent taps "confirm" in a lift with no signal. The request is queued.
 * Forty minutes later — after somebody else cancelled the order, after the
 * stock went to another customer, after the shift ended — it fires. A
 * wallet movement, a shipment, a commission accrual, all from a tap nobody
 * remembers making, against a world that has moved.
 *
 * So the tests below are not about caching strategy. They are about making
 * sure nobody ever adds background sync to this file.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const sw = () => read('public/sw.js');

describe('the worker never saves a tap for later', () => {
  it('has no background sync, in any of its spellings', () => {
    const src = sw();
    for (const forbidden of ['SyncManager', 'periodicsync', 'BackgroundSync', 'workbox-background-sync']) {
      expect(src, `${forbidden} would replay a write after the world moved`).not.toContain(forbidden);
    }
    // The event itself: a 'sync' listener is the replay mechanism.
    expect(/addEventListener\(\s*['"]sync['"]/.test(src), 'a sync listener replays writes').toBe(false);
  });

  it('returns early for anything that is not a plain read', () => {
    const src = sw();
    expect(src).toContain("request.method !== 'GET'");
    // `return` before respondWith — not intercepted at all, so the browser's
    // own failure reaches the code that made the call.
    expect(/if \(changesSomething\(request\)\) return;/.test(src)).toBe(true);
  });

  it('never puts a mutation in a cache', () => {
    const src = sw();
    // Every cache.put/addAll must sit below the early return. Crudely: the
    // first mutation guard appears before the first cache write in fetch.
    const guard = src.indexOf('changesSomething(request)) return');
    const fetchStart = src.indexOf("addEventListener('fetch'");
    expect(guard).toBeGreaterThan(fetchStart);
    const cacheWrite = src.indexOf('cache.put', fetchStart);
    expect(cacheWrite === -1 || cacheWrite > guard).toBe(true);
  });

  it('and does not serve an API read from yesterday', () => {
    // A stale order list is a list somebody acts on.
    expect(sw()).toContain("url.pathname.startsWith('/api/')");
  });
});

describe('the person is told', () => {
  it('the offline page says nothing was kept — not just "you are offline"', () => {
    const html = read('public/offline.html');
    expect(html).toContain('لم يُحفَظ شيء');
    // Somebody who thinks it was saved will not redo it.
    expect(html).toContain('لن تُرسَل لاحقاً');
  });

  it('and so does the banner inside the app', () => {
    const banner = read('src/components/shell/OfflineWatch.tsx');
    expect(banner).toContain('لا شيء يُحفَظ');
    expect(banner).toContain('لن يُرسَل لاحقاً');
  });

  it('the offline page comes back by itself when the line returns', () => {
    expect(read('public/offline.html')).toContain("addEventListener('online'");
  });
});

describe('it installs', () => {
  const manifest = () => JSON.parse(read('public/manifest.webmanifest'));

  it('as a standalone Arabic app that reads right to left', () => {
    const m = manifest();
    expect(m.display).toBe('standalone');
    expect(m.lang).toBe('ar');
    expect(m.dir).toBe('rtl');
    expect(m.name).toBeTruthy();
    expect(m.short_name.length).toBeLessThanOrEqual(12);
  });

  it('with the icons a launcher actually asks for', () => {
    const sizes = manifest().icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
  });

  it('including a maskable one, or Android crops the fins off', () => {
    const maskable = manifest().icons.filter((i: { purpose: string }) => i.purpose === 'maskable');
    expect(maskable.length).toBeGreaterThan(0);
  });

  it('and every icon file is really there and not empty', () => {
    for (const icon of manifest().icons) {
      const p = join(process.cwd(), 'public', icon.src);
      expect(existsSync(p), icon.src).toBe(true);
      expect(statSync(p).size, icon.src).toBeGreaterThan(1000);
    }
  });

  it('opening on a screen somebody can work in, not the sign-in page', () => {
    expect(manifest().start_url).toBe('/dashboard');
  });
});

describe('it fits a phone with a notch', () => {
  it('the layout asks for the safe-area insets', () => {
    // Without viewport-fit=cover the insets are always zero, and the bottom
    // bar sits under the home indicator.
    expect(read('src/app/(system)/layout.tsx')).toContain("viewportFit: 'cover'");
  });

  it('and the status bar wears the theme this person chose', () => {
    expect(read('src/app/(system)/layout.tsx')).toContain('theme-color');
  });
});

/**
 * The fault this section actually shipped with, caught by asking the
 * running server rather than by reading the code.
 *
 * The proxy's matcher excluded .png, .js and .css but not .webmanifest or
 * .html, so the manifest was redirected to /login — the app could not be
 * installed at all — and the offline page the worker falls back to was
 * redirected to a page that, by definition, cannot be reached offline.
 */
describe('the app’s own files are not behind the sign-in wall', () => {
  it('the proxy lets the manifest, the offline page and the icons through', () => {
    const proxy = read('src/proxy.ts');
    for (const path of ['manifest.webmanifest', 'offline.html', 'icons/']) {
      expect(proxy, `${path} is redirected to /login`).toContain(path);
    }
    // And by extension, so a second manifest-ish file does not repeat it.
    expect(proxy).toContain('webmanifest|html');
  });

  it('while everything else still goes through it', () => {
    // The exclusion must be a list of files, never a blanket opt-out.
    const proxy = read('src/proxy.ts');
    expect(proxy).toContain('(?!_next/static');
    expect(proxy).not.toMatch(/matcher:\s*\[\s*\]/);
  });
});
