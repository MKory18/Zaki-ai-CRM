import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname, resolve } from 'node:path';

/**
 * «JS أقل من 100 كيلوبايت» — AND WHAT THAT ASKS FOR, MEASURED.
 *
 * `shop-budget.test.ts` holds the CSS half of the brief and says, about
 * this half: «The JavaScript budget belongs to the bundler and is measured
 * against a production build — it is not pretended at here, because a
 * number this file invented would be worse than no number.»
 *
 * The number is no longer invented. A production build was made into
 * `.next-measure` and the shopper's landing page was opened in a real
 * browser against it. What the browser downloaded, by `encodedBodySize`
 * rather than `transferSize` — the second reads 0 from cache and that is
 * how this measurement was wrong once already:
 *
 *     12 chunks · 157.9 KB on the wire · 510 KB decoded
 *
 * AND THE SHAPE OF IT IS THE WHOLE ANSWER. Two chunks carry 113 KB and
 * contain **not one Arabic character** — no string of ours is in them.
 * They are React and React-DOM. `build-manifest.json` names the set
 * exactly: `rootMainFiles`, five chunks, the floor every page in the
 * product pays before it draws anything:
 *
 *     framework floor   127.5 KB
 *     this page's code    29.6 KB
 *     ───────────────────────────
 *     total              157.1 KB   against a budget of 100
 *
 * SO THE BUDGET CANNOT BE MET, and it is not our code that breaks it. Our
 * code is 29.6 KB, under a third of the allowance. Reaching 100 would mean
 * taking React off the page, and the page has an order form — the one
 * thing on it that must be interactive. That is an architecture decision
 * for the owner, not a cleanup, and the figures are here so it is made
 * against numbers rather than against a memory of numbers.
 *
 * WHAT THIS FILE IS FOR, THEREFORE: not to pass a budget that arithmetic
 * forbids, but to stop 157 becoming 250 without anyone noticing. The floor
 * is pinned where it was measured, and what a shopper's page is allowed to
 * import is pinned by a WALK of the client graph rather than a list.
 */

const BUILDS = ['.next-measure', '.next'];
const build = () => BUILDS.map((d) => join(process.cwd(), d)).find((d) => existsSync(join(d, 'build-manifest.json')));

const kb = (b: Buffer) => gzipSync(b, { level: 9 }).length / 1024;

describe('the floor every page pays before it draws anything', () => {
  it('is the framework, and it alone is already over the brief', () => {
    const dir = build();
    if (!dir) return; // measured only where a production build exists
    const manifest = JSON.parse(readFileSync(join(dir, 'build-manifest.json'), 'utf8'));
    const files: string[] = manifest.rootMainFiles ?? [];
    expect(files.length, 'البيان بلا rootMainFiles — تغيّر شكل البناء').toBeGreaterThan(0);

    const total = files.reduce((s, f) => s + kb(readFileSync(join(dir, f))), 0);

    /*
     * 127.5 KB when measured. The ceiling has headroom for a framework
     * upgrade and none for a library somebody adds to the root layout —
     * which is the thing this is here to catch. If React itself gets
     * smaller, this number comes DOWN deliberately, in a commit that says
     * so.
     */
    expect(total, `أرضيةُ الإطار صارت ${total.toFixed(1)} كيلوبايت`).toBeLessThan(150);

    // And it is not passing by measuring nothing.
    expect(total).toBeGreaterThan(60);

    // The brief asks for 100 KB of JavaScript. The floor alone exceeds it,
    // and saying so here is the point: nobody has to rediscover it.
    expect(total).toBeGreaterThan(100);
  });
});

/**
 * WHAT A SHOPPER'S PAGE IS ALLOWED TO CARRY — BY A WALK, NOT A LIST.
 *
 * Three guards in this repository were found incomplete the day they were
 * written because they named files instead of finding them. So this starts
 * at the landing route and follows every local import, collecting the npm
 * packages that `'use client'` files pull in — because those, and only
 * those, become the bundle a customer downloads.
 */
const SRC = join(process.cwd(), 'src');

function resolveLocal(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : resolve(dirname(from), spec);
  for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts']) {
    const p = base + ext;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return existsSync(base) && statSync(base).isFile() ? base : null;
}

/** Every file reachable from an entry, and the packages the client half imports. */
function clientGraph(entry: string) {
  const seen = new Set<string>();
  const packages = new Map<string, string>();
  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    const isClient = /^\s*['"]use client['"]/.test(src);
    for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const spec = m[1];
      if (spec.startsWith('.') || spec.startsWith('@/')) {
        const next = resolveLocal(file, spec);
        if (next) walk(next);
        continue;
      }
      // A bare specifier in a client file is a package the browser gets.
      if (!isClient) continue;
      const top = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      if (!packages.has(top)) packages.set(top, file.replace(process.cwd(), '').split('\\').join('/'));
    }
  };
  walk(entry);
  return { files: seen, packages };
}

describe('what reaches a customer', () => {
  const ENTRY = join(SRC, 'app/lp/[slug]/page.tsx');

  it('walks the landing route and finds a real graph', () => {
    expect(existsSync(ENTRY), 'مسارُ صفحةِ الهبوط تغيّر').toBe(true);
    const { files } = clientGraph(ENTRY);
    expect(files.size, 'المشي لم يصل إلى شيء').toBeGreaterThan(20);
  });

  it('and every package its client half imports is one somebody chose', () => {
    /*
     * MEASURED against the build this file documents. Each entry is a
     * package whose bytes a customer pays for, so each needs a reason —
     * and a new one appearing here is the question «does the shop need
     * this?» being asked before the bytes ship, not after.
     */
    const ALLOWED: Record<string, string> = {
      react: 'الإطار نفسه — هو أرضيةُ الـ١٢٧ كيلوبايت أعلاه',
      next: 'التوجيه والصور والخطوط — من CartLink',
      'lucide-react': 'أيقوناتُ صفحةِ الهبوط — عائلةُ المتجر، لا عائلةُ لوحةِ التحكّم',
    };
    /*
     * THREE, AND THE FIRST DRAFT OF THIS LIST HAD SIX.
     *
     * `react-dom`, `clsx` and `@remixicon/react` were written in from
     * memory and the walk never reaches any of them: react-dom arrives
     * through the framework rather than through an import of ours, and the
     * other two are not in the client half of this graph at all. An
     * allowance that can never fire reads as live policy and is never
     * exercised — the same defect as a `??` behind a value that is never
     * null. So the list is what the walk FINDS, and a fourth name appearing
     * is a real question to answer.
     */

    const { packages } = clientGraph(ENTRY);
    const strangers = [...packages].filter(([name]) => !(name in ALLOWED));
    expect(
      strangers.map(([n, where]) => `${n} ← ${where}`),
      `حزمةٌ جديدةٌ تصل إلى متصفّح الزبون بلا سبب مكتوب:\n${strangers
        .map(([n, w]) => `${n} · ${w}`)
        .join('\n')}`
    ).toEqual([]);

    // And the walk is not passing by finding nothing: 72 files reached,
    // 11 of them `'use client'`, three packages between them.
    expect(packages.size, 'المشي لم يجد أيّ حزمة — القاعدة لا تَفحص شيئاً').toBe(3);
  });

  it('and the heavy dashboard libraries are not among them', () => {
    // Named because they are the ones that would hurt: a date library, a
    // chart library, or the dashboard's own screens arriving by accident.
    const { packages } = clientGraph(ENTRY);
    for (const heavy of ['date-fns', 'recharts', 'chart.js', 'moment', 'lodash']) {
      expect(packages.has(heavy), `${heavy} وصلت إلى صفحة الزبون`).toBe(false);
    }
  });
});
