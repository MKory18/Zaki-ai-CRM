import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { minifyCss } from './css-minify';
import { FONTS } from './landing-theme';
import { repoFile, stripComments } from './guard-source';
import { BLOCK_CSS } from '@/components/landing/blocks/styles';
import { FAMILY_SHEET, STOREFRONT_CSS } from '@/components/storefront/styles';
import { FAMILY_IDS, familyById } from './store-families';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * D7 — WHAT A SHOPPER'S FIRST SCREEN COSTS, ON THE PUBLIC ENTRY, ALONE.
 *
 * The owner's D7: «على موبايل بـFast 3G و4× CPU — أول تحميل (HTML + CSS +
 * JS + خطوط) ≤ 250 كيلوبايت قبل صورة البطل».
 *
 * Three budgets existed before this and NONE of them answered that:
 *
 *   `quality-gates.test.ts` ratchets the first-load STYLESHEET — the
 *   DASHBOARD's. 96 KB of Tailwind utilities and four palettes that no
 *   public page loads, read from `.next/static/**.css`. A management
 *   number, and the CI step «Payload budget» ran that file alone.
 *
 *   `shop-budget.test.ts` holds the shop's own inline stylesheet (50 KB,
 *   base plus one family) and says of the JavaScript: «it is not
 *   pretended at here, because a number this file invented would be
 *   worse than no number».
 *
 *   `what-a-shopper-downloads.test.ts` measured the framework floor and
 *   walked the client graph — and was not in the CI step, so in CI it
 *   returned early, silently, on every run.
 *
 * This is the public half, measured as the browser gets it: the two
 * entries a customer can reach, their JavaScript gzipped, plus the
 * stylesheet the shop inlines, against a ceiling taken from a
 * measurement. `AUDIT.md` §7.5 said «the public pages are a different
 * entry, and that is why 250 KB is reachable» and left it **unverified**
 * — «Stage 2 measures it first». This is that measurement.
 *
 * ── AND IT IS LOUD WHEN IT CANNOT MEASURE ──
 *
 * `REQUIRE_BUILD=1` turns «no build» into a failure, as the dashboard
 * ratchet does, because that is exactly how four kilobytes grew unseen: a
 * guard that is quiet when it cannot measure is indistinguishable from a
 * guard that passed. Locally, with no flag, it skips — nobody is made to
 * build before running the suite.
 * ═══════════════════════════════════════════════════════════════════════
 */

const dist = () => join(process.cwd(), process.env.NEXT_DIST_DIR || '.next');
const kb = (b: Buffer | string) =>
  gzipSync(typeof b === 'string' ? Buffer.from(b, 'utf8') : b, { level: 9 }).length / 1024;

/**
 * The two entries a customer can reach, by their directory under
 * `server/app` — a shop's front page and a landing page.
 */
const PUBLIC_ENTRIES = ['s/[store]', 'lp/[slug]'];
/** One dashboard screen, for the comparison that is the whole point. */
const DASHBOARD_ENTRY = '(system)/(shell)/orders';

/**
 * EVERY SCRIPT THE BROWSER FETCHES FOR ONE ROUTE, GZIPPED.
 *
 * Two sources, because a route's cost is two things:
 *
 *   `rootMainFiles` in `build-manifest.json` — the framework floor every
 *   page pays before it draws anything. 127 KB of React and the router;
 *   `what-a-shopper-downloads.test.ts` pins it on its own.
 *
 *   the route's own client chunks, named inside
 *   `server/app/<route>/page_client-reference-manifest.js`. That file is
 *   Next's, not the bundler's, so it is written under Turbopack and under
 *   webpack alike — and it is read as TEXT rather than parsed, because it
 *   is a script that assigns a global and its shape is not ours.
 *
 * A route whose manifest is missing or names nothing is NOT measured as
 * zero: it throws. «The build changed shape» must never read as «the page
 * got lighter».
 */
function routeJs(route: string): { count: number; total: number } {
  const dir = dist();
  const root = JSON.parse(readFileSync(join(dir, 'build-manifest.json'), 'utf8')) as {
    rootMainFiles?: string[];
  };
  const names = new Set<string>(root.rootMainFiles ?? []);
  if (names.size === 0) {
    throw new Error('البيانُ بلا rootMainFiles — تغيّرَ شكلُ البناء، والقياسُ لم يحدث.');
  }

  const manifest = join(dir, 'server', 'app', route, 'page_client-reference-manifest.js');
  if (!existsSync(manifest)) {
    throw new Error(
      `لا بيانَ عميلٍ للمسار «${route}» — تغيّرَ شكلُ البناء. ` +
        'القياسُ بالأرضيّةِ وحدَها يُخفي كلَّ ما تَحمِلُه الصفحةُ نفسُها.'
    );
  }
  const text = readFileSync(manifest, 'utf8');
  const own = [...text.matchAll(/static\/chunks\/[A-Za-z0-9._-]+\.js/g)].map((m) => m[0]);
  if (own.length === 0) {
    throw new Error(`بيانُ «${route}» لا يُسمّي أيَّ قطعة — تغيّرَ شكلُ البناء.`);
  }
  for (const n of own) names.add(n);

  let total = 0;
  let count = 0;
  for (const n of names) {
    const p = join(dir, n);
    if (!existsSync(p) || !statSync(p).isFile()) continue;
    total += kb(readFileSync(p));
    count++;
  }
  return { count, total };
}

/**
 * The stylesheet a PUBLIC page really sends: inline, inside the document.
 *
 * Not in `.next/static/**.css` at all — the shop inlines its sheet so
 * there is no second round trip for it, which is why the dashboard's
 * ratchet cannot see it and why this reads the source of truth. The
 * HEAVIEST family is the one that counts: a budget met by the lightest is
 * a budget met for somebody else's shop.
 */
function inlineCss(): { heaviest: string; value: number } {
  const base = minifyCss(BLOCK_CSS + STOREFRONT_CSS);
  let heaviest = FAMILY_IDS[0] as string;
  let value = 0;
  for (const id of FAMILY_IDS) {
    const size = kb(base + FAMILY_SHEET[id]);
    if (size > value) {
      value = size;
      heaviest = id;
    }
  }
  return { heaviest, value };
}

const measurable = () => existsSync(join(dist(), 'build-manifest.json'));
const required = () => process.env.REQUIRE_BUILD === '1';

function noBuild(): true {
  if (required()) {
    throw new Error(
      'لا يوجد بناءٌ لقياسِه و`REQUIRE_BUILD=1` مطلوبٌ هنا. هذه الخطوة تَجري بعدَ «Build» ' +
        'في ci.yml عن قصد: إن لم يُنتِجِ البناءُ شيئاً فالسقفُ لم يُقَس — وحارسٌ صامتٌ ' +
        'لأنّه لم يَقِس لا يُفرَّقُ عن حارسٍ نجح.'
    );
  }
  return true;
}

describe('what a shopper downloads before the hero image', () => {
  /**
   * ── THE CEILING, AND THE TWO MEASUREMENTS BEHIND IT ──
   *
   * MEASURED 2026-10-16 on this tree, gzipped, with
   * `NEXT_DIST_DIR=.next-verify npx next build --webpack`:
   *
   *     /s/[store]   193.6 KB of JavaScript (11 files, floor included)
   *     /lp/[slug]   193.6 KB
   *     inline CSS     8.4 KB  (base + «علامة», the heaviest family)
   *     ───────────────────────────────────────────────────────────────
   *     total        202.0 KB
   *
   * AND THE SAME TREE UNDER TURBOPACK, which is what CI and the
   * production image build with. Measured on the first run of this very
   * step, 2026-10-16:
   *
   *     /s/[store]   162.5 KB of JavaScript (13 files) + 7.7 CSS = 170.2
   *     /lp/[slug]   161.4 KB (12 files)               + 7.7     = 169.2
   *     the orders screen, for scale                             = 388.4
   *
   * Webpack was used locally because a production Turbopack build cannot
   * resolve `next` from inside a git worktree whose `node_modules`
   * belongs to the parent checkout («Could not find the Next.js
   * package»). Turbopack splits smaller — 170 against 202 — so the
   * ceiling stays over the HIGHER of the two and holds under either
   * bundler, and both numbers are written here so nobody has to
   * rediscover which is which.
   *
   * ── AND D7'S OWN NUMBER, HONESTLY ──
   *
   * 250 KB is HTML + CSS + JS + FONTS. Of that, **170.2 KB** is what
   * this repository decides, on the build that actually ships. The faces
   * are not ours: every skin's font is fetched from Google at run time
   * by `fontHref`, and `AUDIT.md` §7.2 measured two Arabic subsets at
   * 42–55 KB. So a public page lands between **212 and 225 KB** — D7 is
   * MET, with twenty-five kilobytes to spare on the heavier pair. What
   * would make it certain rather than likely is serving the faces from
   * the repository, which needs the owner's word on two font files
   * (`docs/storefront/FAMILIES.md` §٥).
   */
  const CEILING_KB = 205;

  it(`keeps each public entry at or under ${CEILING_KB} KB of JS + CSS, gzipped`, () => {
    if (!measurable()) return noBuild();
    const css = inlineCss();
    for (const route of PUBLIC_ENTRIES) {
      const js = routeJs(route);
      const total = js.total + css.value;
      console.log(
        `[public] ${route}: JS ${js.total.toFixed(1)} (${js.count} ملف) + CSS ${css.value.toFixed(1)} ` +
          `(${css.heaviest}) = ${total.toFixed(1)} ك.ب مضغوطة — السقف ${CEILING_KB}، ` +
          `المتبقّي ${(CEILING_KB - total).toFixed(1)}`
      );
      expect(
        total,
        `«${route}» صار ${total.toFixed(1)} ك.ب — السقف ${CEILING_KB} وهو مقياسٌ لا رقمٌ مستدير. ` +
          'أرضيّةُ الإطارِ وحدَها ١٢٧ ك.ب: اقرأ what-a-shopper-downloads.test.ts قبل تحريكِ الرقم.'
      ).toBeLessThanOrEqual(CEILING_KB);
    }
  });

  /**
   * AND IT IS A DIFFERENT NUMBER FROM THE DASHBOARD'S — which is the
   * whole reason for measuring the public entry separately.
   *
   * MEASURED in the same build: the orders screen is 287.9 KB of
   * JavaScript against the shop's 193.6. A public page that drifted into
   * importing a dashboard screen would show up here before it showed up
   * on a customer's phone.
   */
  it('and the public entry is lighter than a dashboard screen’s', () => {
    if (!measurable()) return noBuild();
    const shop = routeJs(PUBLIC_ENTRIES[0]);
    const admin = routeJs(DASHBOARD_ENTRY);
    console.log(
      `[public] المتجر ${shop.total.toFixed(1)} ك.ب · شاشةُ الطلبات ${admin.total.toFixed(1)} ك.ب`
    );
    expect(shop.total, 'صفحةُ الزبون صارت أثقل من شاشةِ الإدارة').toBeLessThan(admin.total);
  });

  it('and the measurement is of something — the floor alone is not a page', () => {
    if (!measurable()) return noBuild();
    const shop = routeJs(PUBLIC_ENTRIES[0]);
    // Eleven files when measured. The floor is four of them, so a count
    // that collapses to four means the route's own manifest stopped
    // being read — which `routeJs` throws about, and this is the second
    // lock on the same failure.
    expect(shop.count, 'القياسُ ما لقِيَ غيرَ الأرضيّة').toBeGreaterThan(5);
    expect(shop.total, 'القياسُ بلا بايتات').toBeGreaterThan(60);
  });
});

/**
 * THE FONT ALLOWANCE, HELD BY THE THING THAT BOUNDS IT.
 *
 * The faces are not in the build, so no number here could be measured
 * from it. What CAN be held is the rule the brief states — «≤ 2 font
 * families, Arabic subset, font-display: swap» — because two families is
 * what keeps the font cost inside the 42–55 KB `AUDIT.md` §7.2 measured.
 * The kilobytes are the consequence; this is the cause.
 */
describe('the fonts a public page asks for', () => {
  it('are at most two families per shop, which is what bounds their weight', () => {
    // The contract's SHAPE is the limit: `type` has two fields, so a
    // third family cannot be named without changing the contract.
    const skin = stripComments(repoFile('src/lib/store-skin.ts'));
    expect(skin).toMatch(/heading: templateFont,\s*\n\s*body: templateFont,/);
    for (const family of FAMILY_IDS) {
      const look = familyById(family)!;
      expect(Object.keys(look.type).sort(), family).toEqual(['body', 'heading']);
    }
  });

  it('and every face a shop may wear is swapped, never blocking', () => {
    // `font-display: swap` is what makes a slow font a late font rather
    // than a blank screen.
    const blocks = stripComments(repoFile('src/components/landing/blocks/styles.ts'));
    expect(blocks, 'الخطوطُ المجلوبةُ بلا swap').toMatch(/display=swap/);
    // And the one face this repository serves itself says so too.
    expect(blocks, 'الخطُّ المحلّيُّ بلا swap').toMatch(/font-display:\s*swap/);
  });

  it('and no public page loads the dashboard’s own faces', () => {
    // 218 KB of preloaded woff2 appeared on a storefront page once, for a
    // stylesheet that was never applied. See `(system)/fonts.ts`.
    for (const rel of [
      'src/app/s/layout.tsx',
      'src/app/lp/layout.tsx',
      'src/components/public/PublicLayout.tsx',
    ]) {
      expect(repoFile(rel), rel).not.toMatch(/next\/font|\(system\)/);
    }
  });

  it('and the registry really is where the faces are declared', () => {
    // A guard reading an empty list would pass forever.
    expect(FONTS.length).toBeGreaterThan(10);
    expect(FONTS.filter((f) => f.openArabic).length).toBeGreaterThan(8);
  });
});
