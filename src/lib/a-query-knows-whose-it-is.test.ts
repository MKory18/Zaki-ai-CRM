import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * تشطيب ٢ — PASS 3: «switch country → all data rescoped? switch store →
 * products rescoped?» — and the worst cascade a multi-store system can have:
 * one shop seeing another's rows.
 *
 * WHAT WAS SWEPT, AND WHAT WAS FOUND. 165 queries against the six tenant
 * models (order, product, customer, landingPage, offer, shipment) in the
 * whole of `src`. Every one is scoped — directly, through a shared `scope`
 * object, through a `scope` parameter, or through an entity the caller was
 * already authorised for. **No leak.**
 *
 * SO WHY NOT A GUARD THAT ASSERTS «EVERY QUERY IS SCOPED»?
 *
 * Because it cannot be written honestly. `where` is an identifier here, a
 * spread there, a parameter somewhere else, and a product's siblings are
 * scoped by a `storeId` taken off a row the route already checked. A regex
 * calls all of those unscoped, which makes about thirty false alarms — and a
 * guard that cries wolf is a guard somebody switches off. A rule I cannot
 * state precisely is one I should not pretend to enforce.
 *
 * WHAT IS PRECISE, AND IS THE THING ACTUALLY WORTH PINNING: the queries that
 * run with NO tenant at all, on purpose, because a public visitor has no
 * company. There are a handful, each keyed on something a stranger cannot
 * guess their way past, and a new one must be a decision rather than a diff.
 */

const SRC = join(process.cwd(), 'src');

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p));
    else if (/\.tsx?$/.test(p) && !p.includes('.test.')) out.push(p);
  }
  return out;
}

const rel = (p: string) => relative(process.cwd(), p).split(sep).join('/');

/**
 * THE PUBLIC LOOKUPS, AND WHAT EACH IS KEYED ON INSTEAD OF A TENANT.
 *
 * `isPublished` is doing real work in every one of them: an unpublished page
 * is invisible to a stranger however they arrive, so a draft cannot be read
 * by guessing a slug.
 */
const PUBLIC_LOOKUPS: Record<string, { why: string; mustKeyOn: RegExp }> = {
  'src/lib/landing-domain.ts': {
    why: 'يحلّ اسم مضيف إلى الصفحة التي أثبتته — والنطاق فضاءٌ واحدٌ لكل الشركات',
    mustKeyOn: /isPublished: true/,
  },
  'src/lib/public-metadata.ts': {
    why: 'بطاقة المشاركة لصفحة منشورة، يقرأها فيسبوك وواتساب بلا جلسة',
    mustKeyOn: /isPublished: true/,
  },
  /*
   * FOUND BY THIS TEST ON ITS FIRST RUN, and it is legitimate — which is the
   * useful kind of catch. Picking a front page checks whether ANY other
   * company's page already holds that slug, because `/lp/<slug>` is one
   * public namespace and a collision would send this store's customers to
   * somebody else's page. It has to look across companies to answer that.
   *
   * What makes it safe is not a scope but the SELECT: it asks whether a row
   * exists and reads nothing else, so a stranger's page can be collided with
   * and never read.
   */
  'src/app/api/growth/storefronts/route.ts': {
    why: 'تصادم الروابط عبر الشركات — /lp/<slug> فضاءٌ واحد',
    mustKeyOn: /where: \{ slug: page\.slug, id: \{ not: page\.id \} \},[\s\S]{0,40}select: \{ id: true \},/,
  },
};

describe('a query that runs without a tenant is one of a known few', () => {
  /** Every `landingPage` read that carries no companyId anywhere near it. */
  const unscopedPageReads = filesUnder(SRC)
    .filter((p) => {
      const src = readFileSync(p, 'utf8');
      const calls = [...src.matchAll(/db\.landingPage\.(findFirst|findMany)\(\{([\s\S]{0,300}?)\n\s*\}\)/g)];
      return calls.some((m) => !/companyId/.test(m[2]) && !/\.\.\.\w+/.test(m[2]));
    })
    .map(rel);

  it('finds them, so this file is not asserting about an empty list', () => {
    expect(unscopedPageReads.length).toBeGreaterThanOrEqual(2);
  });

  it('and every one is a public lookup that was decided on', () => {
    const strangers = unscopedPageReads.filter((f) => !(f in PUBLIC_LOOKUPS));
    expect(
      strangers,
      'استعلامٌ بلا شركةٍ في ملفٍّ غير معلَن — إمّا أن يُنطَق سببُه هنا أو أن يُقيَّد'
    ).toEqual([]);
  });

  it('and each is keyed on something a stranger cannot walk into', () => {
    for (const [file, rule] of Object.entries(PUBLIC_LOOKUPS)) {
      const src = readFileSync(join(process.cwd(), file), 'utf8');
      expect(src, `${file}: ${rule.why}`).toMatch(rule.mustKeyOn);
    }
  });

  it('and `isPublished` is not decoration — a draft is invisible to a stranger', () => {
    // The one rule all of them share, asserted on its own so that removing it
    // from any single file fails here rather than in somebody's inbox.
    // The two files a STRANGER reaches. The storefronts route is a seller's,
    // behind a session, and its cross-company read is an existence check that
    // must see unpublished pages too — a draft holding your slug collides
    // just the same.
    for (const file of ['src/lib/landing-domain.ts', 'src/lib/public-metadata.ts']) {
      const src = readFileSync(join(process.cwd(), file), 'utf8');
      const reads = [...src.matchAll(/db\.landingPage\.(findFirst|findMany)\(\{([\s\S]{0,300}?)\n\s*\}\)/g)];
      expect(reads.length, `${file}: لا استعلام`).toBeGreaterThan(0);
      for (const [i, m] of reads.entries()) {
        expect(m[2], `${file}: الاستعلام ${i} يقرأ مسوّدة`).toMatch(/isPublished: true/);
      }
    }
  });
});

describe('the public order door takes its tenant from the page, never from the caller', () => {
  /**
   * The one query in the public order path that runs without a companyId is
   * the page lookup itself — and everything downstream is scoped FROM it.
   * That is the whole shape of the door: a stranger names a slug, and the
   * server decides whose shop that is.
   */
  const route = readFileSync(
    join(process.cwd(), 'src/app/api/public/landing-pages/[slug]/orders/route.ts'),
    'utf8'
  );

  it('resolves the page by slug and published state, and nothing the browser sent', () => {
    expect(route).toMatch(/where: \{ slug, isPublished: true \}/);
  });

  it('and derives the company from the row, with the comment saying so', () => {
    expect(route).toContain('companyId: lp.company.id');
    expect(route).toMatch(/NEVER from the browser/);
  });

  it('and refuses a page that belongs to no store, rather than guessing one', () => {
    expect(route).toMatch(/if \(!lp\.store/);
  });
});
