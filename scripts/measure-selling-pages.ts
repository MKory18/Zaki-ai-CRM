/**
 * WHAT A SELLING PAGE COSTS A PHONE ON SLOW INTERNET.
 *
 * «قِس LCP / CLS / TBT محلياً (Playwright عبر npx، Fast 3G + 4× CPU) على
 * ثلاث صفحات لكل عائلة». D7's budget is the one that decides whether these
 * blocks ship: «القالب الي ما بيلتزم ما بينطلق — مهما كان جميل».
 *
 * WHY THIS IS A SCRIPT AND NOT A NUMBER IN THE PULL REQUEST. A measurement
 * taken once and written into a document is true on the day it is taken and
 * nobody takes it again — `shop-budget.test.ts` opens with that sentence
 * about the stylesheet, and the same is true of a page's paint. This runs
 * against a dev server, prints a table, and can be run again by whoever
 * doubts the table.
 *
 * WHAT IT DOES NOT DO. It does not fail a build. These three figures depend
 * on the machine, on what else that machine is doing, and on a dev server's
 * own compile — a threshold enforced from here would be a red CI run on a
 * busy laptop and a green one on an idle desk. The bytes this repository
 * DECIDES are guarded by a test (`shop-budget.test.ts`); what a browser
 * then does with them is measured, reported, and read by a person.
 *
 * ── RUNNING IT ──
 *
 *   npx next dev -p 3140                     # a server with real data
 *   npx tsx scripts/measure-selling-pages.ts --base http://localhost:3140 \
 *     --pages demo-problem-solution,demo-offer-first,demo-s-objections
 *
 * Playwright is NOT a dependency of this project and must not become one:
 * it would land in every install, and this script is run by hand a few
 * times a release. `npx playwright install chromium` provides the browser.
 *
 * ── THE THROTTLE ──
 *
 * Chrome DevTools' own «Fast 3G» numbers, applied through CDP rather than
 * guessed at: 1.6 Mbit/s down, 750 Kbit/s up, 562.5 ms of round trip, and
 * the CPU slowed to a quarter. Those four are what «a phone on slow
 * internet» means in the brief, and writing them out here is what lets
 * somebody disagree with them.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SELLING_FAMILIES, type SellingFamily } from '../src/lib/selling-blocks';

/** Chrome DevTools «Fast 3G», exactly. */
const FAST_3G = {
  offline: false,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
  latency: 562.5,
};
const CPU_SLOWDOWN = 4;

/** A phone, and then a laptop — the two widths the brief asks for. */
const WIDTHS = [
  { label: '390', width: 390, height: 844 },
  { label: '1280', width: 1280, height: 900 },
];

/**
 * THE SHAPE OF PLAYWRIGHT, WRITTEN OUT — because it is not a dependency.
 *
 * `import type { Browser } from 'playwright'` would type-check only on a
 * machine that happens to have it installed, and `next build` type-checks
 * this directory: the first build after this script was written failed with
 * «Cannot find module 'playwright'», on a branch that had not touched the
 * application at all.
 *
 * So the handful of calls this script makes are declared here. It is a
 * dozen lines, it is checked by the compiler like everything else, and it
 * cannot drift into something false without this script failing to run.
 */
interface PwResponse { headers(): Record<string, string> }
interface PwCdp { send(method: string, params?: unknown): Promise<unknown> }
interface PwPage {
  addInitScript(script: string): Promise<void>;
  goto(url: string, options?: { waitUntil?: 'load'; timeout?: number }): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  evaluate(expression: string): Promise<unknown>;
  screenshot(options: { path: string; fullPage?: boolean; quality?: number }): Promise<unknown>;
  on(event: 'response', handler: (res: PwResponse) => void): void;
}
interface PwContext {
  newPage(): Promise<PwPage>;
  newCDPSession(page: PwPage): Promise<PwCdp>;
  close(): Promise<void>;
}
interface PwBrowser {
  newContext(options: {
    viewport: { width: number; height: number };
    deviceScaleFactor?: number;
    userAgent?: string;
  }): Promise<PwContext>;
  close(): Promise<void>;
}
interface PwChromium { launch(): Promise<PwBrowser> }

interface Row {
  family: SellingFamily;
  page: string;
  lcpMs: number | null;
  cls: number;
  tbtMs: number;
  transferKb: number;
  requests: number;
}

function arg(name: string, fallback = ''): string {
  const at = process.argv.indexOf(`--${name}`);
  return at > -1 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}

/**
 * The collector, installed before the page's own scripts run.
 *
 * `buffered: true` on each observer, so an entry that landed before this
 * executed is still counted — without it the LCP of a fast page is
 * sometimes simply absent, and an absent LCP reads as a good one.
 *
 * TBT from `longtask` rather than from Lighthouse's own definition: the
 * sum of what each long task spent over 50 ms, which is the figure the
 * brief names and the one a `PerformanceObserver` can state.
 */
const COLLECTOR = `
window.__zaki = { lcp: null, cls: 0, tbt: 0 };
try {
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__zaki.lcp = e.startTime;
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (!e.hadRecentInput) window.__zaki.cls += e.value;
  }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__zaki.tbt += Math.max(0, e.duration - 50);
  }).observe({ type: 'longtask', buffered: true });
} catch (e) { window.__zaki.error = String(e); }
`;

/**
 * FORCING THE FAMILY, AND WHY THAT IS AN HONEST MEASUREMENT.
 *
 * The family is a `data-family` attribute the server writes, derived from
 * the template the shop wears, so measuring all three from real pages
 * would need three shops. All three families' rules ship in ONE inlined
 * stylesheet — the same bytes reach the browser whichever family a page
 * is in — so what differs between the three rows of the table is the
 * layout and paint cost of that family's rules on the same page, which is
 * exactly what the table is for.
 *
 * An observer rather than a `querySelector` after load: the attribute has
 * to be right before first paint, or the LCP measured is the other
 * family's.
 */
const forceFamily = (family: string) => `
(() => {
  const want = ${JSON.stringify(family)};
  const set = () => {
    const el = document.querySelector('.lp-family');
    if (!el) return false;
    el.setAttribute('data-family', want);
    return true;
  };
  if (set()) return;
  /*
   * THE OBSERVER WATCHES \`document\`, NOT \`document.documentElement\`.
   *
   * This script runs before anything in the page, which on the very first
   * tick means there is no <html> element yet: observing documentElement
   * threw, the whole script died, and every family measured and
   * photographed the page exactly as the server had sent it. The three
   * «different» screenshots were byte-identical, which is how it was
   * found. \`document\` always exists.
   */
  const mo = new MutationObserver(() => { if (set()) mo.disconnect(); });
  mo.observe(document, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => { set(); mo.disconnect(); });
})();
`;

async function main() {
  const base = arg('base', 'http://localhost:3140').replace(/\/$/, '');
  const slugs = arg('pages').split(',').map((s) => s.trim()).filter(Boolean);
  const families = (arg('families').split(',').map((s) => s.trim()).filter(Boolean) as SellingFamily[]);
  const out = arg('out', join('docs', 'storefront', 'shots', 's2'));
  const shots = process.argv.includes('--shots');

  if (!slugs.length) {
    console.error('اكتب الصفحات: --pages slug1,slug2,slug3');
    process.exit(1);
  }

  /*
   * PLAYWRIGHT IS NOT A DEPENDENCY, AND MUST NOT BECOME ONE.
   *
   * It would land in every install of this project for a script that runs
   * by hand a few times a release. So it is imported by NAME when it
   * happens to be installed, and otherwise from wherever the person
   * running this put it — `PLAYWRIGHT_MODULE=<path to playwright>`, which
   * is how it is run from a git worktree that has no `node_modules` of its
   * own.
   */
  let chromium: PwChromium;
  try {
    // A path has to be handed to the loader as a `file://` URL: on Windows
    // `C:\…` reads as a URL scheme called «c», which is the error you get
    // instead of the module.
    const given = process.env.PLAYWRIGHT_MODULE;
    const where = given ? pathToFileURL(given).href : 'playwright';
    // Playwright is CommonJS, so an `import()` of it hands back the whole
    // `module.exports` under `default`. Reading `chromium` off the namespace
    // gives `undefined` and the failure lands twenty lines later, at
    // `.launch()`, where it says nothing about the import.
    const mod = (await import(where)) as { default?: { chromium: PwChromium }; chromium?: PwChromium };
    const pw = mod.default ?? (mod as { chromium: PwChromium });
    chromium = pw.chromium;
    if (!chromium) throw new Error('الوحدة ما فيها chromium');
  } catch (e) {
    console.error('Playwright غير موجود:', String(e).split('\n')[0]);
    console.error('ثبّته: npm install playwright && npx playwright install chromium');
    console.error('أو مرّر مكانه: PLAYWRIGHT_MODULE=/path/to/node_modules/playwright');
    process.exit(1);
  }

  mkdirSync(out, { recursive: true });
  const rows: Row[] = [];
  const browser = await chromium.launch();

  for (const family of families.length ? families : [...SELLING_FAMILIES]) {
    for (const slug of slugs) {
      const url = `${base}/lp/${slug}`;

      for (const size of WIDTHS) {
        const context = await browser.newContext({
          viewport: { width: size.width, height: size.height },
          deviceScaleFactor: 2,
          // A visitor arriving from an advert has no cache and no cookie.
          // Measuring a warm page is measuring the second visit.
          userAgent:
            'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
        });
        const page = await context.newPage();
        await page.addInitScript(COLLECTOR);
        await page.addInitScript(forceFamily(family));

        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions', FAST_3G);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });

        let bytes = 0;
        let requests = 0;
        page.on('response', (res) => {
          requests += 1;
          const len = Number(res.headers()['content-length'] ?? 0);
          if (Number.isFinite(len)) bytes += len;
        });

        await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
        // Settle: the clock ticks, the images below the fold lazy-load, and
        // a shift three seconds in is still a shift the visitor saw.
        await page.waitForTimeout(4000);

        const metrics = (await page.evaluate('window.__zaki')) as { lcp: number | null; cls: number; tbt: number };

        // The phone is the measurement the brief is about; the wide screen is
        // for the screenshot. Both are recorded, only the phone is tabled.
        if (size.label === '390') {
          rows.push({
            family,
            page: slug,
            lcpMs: metrics.lcp === null ? null : Math.round(metrics.lcp),
            cls: Number(metrics.cls.toFixed(3)),
            tbtMs: Math.round(metrics.tbt),
            transferKb: Number((bytes / 1024).toFixed(1)),
            requests,
          });
        }

        if (shots) {
          // JPEG, like every other shot under docs/storefront/shots, and a
          // third of the bytes: eighteen lossless screenshots of a page that
          // is mostly flat colour is three megabytes in the repository for
          // no more detail than this shows.
          const file = join(out, `${family}-${slug}-${size.label}.jpg`);
          await page.screenshot({ path: file, fullPage: false, quality: 82 });
          console.log(`shot  ${file}`);
        }

        await context.close();
      }
    }
  }

  await browser.close();

  const table = [
    '| العائلة | الصفحة | LCP | CLS | TBT | أول تحميل | طلبات |',
    '|---|---|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.family} | ${r.page} | ${r.lcpMs === null ? '—' : `${r.lcpMs} ms`} | ${r.cls} | ${r.tbtMs} ms | ${r.transferKb} KB | ${r.requests} |`
    ),
  ].join('\n');

  console.log('\n' + table + '\n');
  writeFileSync(join(out, 'measurements.md'), `${table}\n`, 'utf8');
  writeFileSync(join(out, 'measurements.json'), `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
