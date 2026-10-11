import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { stripComments } from './guard-source';
import { benchExcludedAr, benchOnly, realStoresHere, realStoresOnly } from './test-store';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A TEST BENCH IS NOT THE BUSINESS, AND ITS NUMBERS ARE NOT ITS FIGURES.
 *
 * «منتج تيست — بيئةٌ منعزلة … أرقامٌ لا تدخل أيَّ حسبة». Fifty niche
 * products tried, forty-six abandoned, and not one dinar of that in the
 * owner's profit.
 *
 * ── WHAT WAS MEASURED BEFORE A LINE WAS WRITTEN ──
 *
 * 253 queries in this product already filter by `storeId`. Every one of
 * them excludes a bench store FOR FREE — which is why the mark is on the
 * STORE and not on the product: a product flag inherits none of those 253
 * and has to defend all 284, and the one site nobody thought of is the one
 * that puts a test sale in the profit report.
 *
 * 31 are company-wide AND touch a money table, in 22 files. Read one by
 * one, and this is the finding that matters: ALMOST ALL OF THEM ARE SCOPED
 * TO NAMED IDS — one order's add-ons, one statement's lines, one customer's
 * history, one user's penalties, one product's batches. A query keyed on an
 * id that belongs to the bench answers about the bench, which is correct;
 * it is not an aggregate over the business.
 *
 * Exactly ONE was a real leak and is fixed: `staleStatements` in
 * `intelligence.ts` listed every OPEN courier statement in the company, so
 * an unclosed bench statement was raised as a finding about the business —
 * in the one screen built to tell the owner what is wrong.
 *
 * ── AND TWO ARE NOT FIXABLE HERE, WHICH IS SAID RATHER THAN HIDDEN ──
 *
 * `Expense` and `WalletTransfer` carry NO `storeId` at all. They are
 * company money by schema design, and a bench's ad spend is money that
 * really left the account. Subtracting it would need a column on those
 * tables and a ruling from the owner about whether a test's cost is a cost.
 * Named below so the list cannot grow in silence.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const SRC = join(process.cwd(), 'src');

function files(d: string, out: string[] = []): string[] {
  for (const n of readdirSync(d)) {
    const f = join(d, n);
    if (statSync(f).isDirectory()) files(f, out);
    else if (/\.ts$/.test(n) && !/\.test\.ts$/.test(n)) out.push(f);
  }
  return out;
}

/**
 * Comments blanked IN PLACE — same length, so every line number still
 * points at the real file. Replacing them with '' shifted every number and
 * made the first version of this sweep report lines with nothing on them.
 */
const blank = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^([ \t]*)\/\/.*$/gm, (m) => m.replace(/[^\n]/g, ' '));

/** The whole `where: { … }`, brace-counted — a regex stops at the first `}`. */
function whereAt(src: string, start: number): string {
  const open = src.indexOf('{', start);
  if (open === -1) return '';
  let depth = 0;
  for (let i = open; i < src.length && i < open + 3000; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return '';
}

/** The `db.<model>.<method>(` this `where:` belongs to. */
function callBefore(src: string, at: number): { model: string; method: string } | null {
  const slice = src.slice(Math.max(0, at - 400), at);
  const m = [...slice.matchAll(/\b(?:db|tx|prisma)\.([a-zA-Z]+)\.([a-zA-Z]+)\s*\(/g)].pop();
  return m ? { model: m[1], method: m[2] } : null;
}

const READS_MANY = new Set(['aggregate', 'groupBy', 'count', 'findMany']);

/** Tables whose rows carry money or quantities that feed a figure. */
const MONEY_MODELS = new Set([
  'order', 'orderItem', 'orderAddOn', 'expense', 'commission', 'fundMovement',
  'productionBatch', 'inventoryMovement', 'courierStatement', 'statementLine',
  'statementReceipt', 'walletTransfer', 'payslip', 'penalty', 'campaign',
]);

/**
 * EVERY COMPANY-WIDE READ OVER A MONEY TABLE, WITH ITS `where`.
 *
 * Over-inclusive on purpose, the same bet `every-money-writer-is-known`
 * makes: the part that fails OPEN is a new money path nobody classified, so
 * the sweep is wide and each hit has to fall on one of the sides below.
 */
interface Site {
  at: string;
  call: string;
  where: string;
}

function sites(): Site[] {
  const out: Site[] = [];
  for (const f of files(SRC)) {
    const rel = relative(SRC, f).split(/[\\/]/).join('/');
    const src = blank(readFileSync(f, 'utf8'));
    for (const m of src.matchAll(/where:/g)) {
      const w = whereAt(src, m.index!);
      if (!w.includes('companyId')) continue;
      if (/storeId|store:/.test(w)) continue;
      const call = callBefore(src, m.index!);
      if (!call || !READS_MANY.has(call.method) || !MONEY_MODELS.has(call.model)) continue;
      out.push({
        at: `${rel}:${src.slice(0, m.index!).split('\n').length}`,
        call: `${call.model}.${call.method}`,
        where: w.replace(/\s+/g, ' '),
      });
    }
  }
  return out;
}

/**
 * NOT AN AGGREGATE OVER THE BUSINESS — each with the reason, and each
 * reason is a FACT A READER CAN CHECK against the `where` printed beside
 * it. «It only reads one row» is exactly what was wrongly assumed about
 * the winback in the money sweep, so the reasons here name the key that
 * does the scoping.
 */
interface Excuse {
  reason: string;
  /**
   * HOW MANY SITES THIS EXCUSE COVERS — and it is here because the guard
   * failed to catch a mutation without it.
   *
   * The excuse was per FILE, so adding a brand-new unclassified
   * company-wide aggregate to a file that already had an excuse passed
   * silently: `lib/analytics.ts` is excused for its expense aggregate, and
   * a fresh `order.count({ where: { companyId } })` dropped in beside it
   * inherited that excuse. Found by mutation, which is the only way a hole
   * of that shape is ever found.
   *
   * So the count is pinned. A new site in an excused file makes the number
   * wrong, and the failure names the file.
   */
  sites: number;
}

const ID_SCOPED: Record<string, Excuse> = {
  'app/api/control/blacklist/route.ts': { reason: 'مقيَّد بأرقام هواتف مُسمّاة — سؤالٌ عن عميلٍ بعينه', sites: 1 },
  'app/api/finance/statements/[id]/route.ts': { reason: 'مقيَّد بـ settledOrderIds — سطورُ كشفٍ بعينه', sites: 2 },
  'app/api/geo/countries/[id]/route.ts': { reason: 'عدٌّ ليُعرَفَ هل يُحذَفُ بلد — ليس رقماً يُعرَض', sites: 1 },
  'app/api/ops/tracking/deliver/route.ts': { reason: 'مقيَّد بـ orderId واحد', sites: 1 },
  'app/api/orders/[id]/route.ts': { reason: 'مقيَّد بـ orderId واحد — إضافاتُ طلبٍ بعينه', sites: 1 },
  'app/api/whatsapp/conversations/[id]/route.ts': { reason: 'مقيَّد بـ customerId واحد — محادثةٌ بعينها', sites: 1 },
  'lib/commission-metrics.ts': { reason: 'مقيَّد بـ orderId: { in } ومستخدمٍ واحد', sites: 1 },
  'lib/courier-dispatch.ts': { reason: 'مقيَّد بـ shippingBatchId واحد', sites: 1 },
  'lib/customer-risk.ts': { reason: 'مقيَّد بالعميل نفسِه — تاريخُ شخصٍ لا رقمُ متجر', sites: 3 },
  'lib/jobs/definitions.ts': { reason: 'مقيَّد بمندوبٍ واحد وبوليصةٍ موجودة', sites: 1 },
  'lib/landing-analytics.ts': { reason: 'مقيَّد بـ campaignIds مُسمّاة', sites: 1 },
  'lib/operations.ts': { reason: 'مقيَّد بالعميل نفسِه — طلباتُه الأخرى', sites: 2 },
  'lib/payroll.ts': { reason: 'مقيَّد بمستخدمٍ واحد — جزاءُ شخصٍ لا رقمُ متجر', sites: 1 },
  'lib/penalty-service.ts': { reason: 'مقيَّد بمستخدمين مُسمّين', sites: 2 },
  'lib/product-cost.ts': { reason: 'مقيَّد بـ productId — ومنتجُ المنصّة صفُّه الخاصّ', sites: 2 },
  'lib/receiving.ts': { reason: 'مقيَّد بـ productId، أو عدُّ ترقيمٍ لتوليدِ رقمٍ فريد', sites: 2 },
  'lib/settlement.ts': { reason: 'مقيَّد بمراجعَ مُسمّاة من كشف', sites: 1 },
};

/**
 * COMPANY MONEY WITH NO STORE TO SUBTRACT — the honest bucket.
 *
 * These tables carry no `storeId` in the schema at all, so the filter
 * cannot be written. And the question underneath is the owner's, not a
 * programmer's: money spent advertising a test product really left the
 * account, so whether it is a cost of the business is a ruling.
 *
 * A CLOSED LIST THAT CANNOT GROW. If a thirty-second company-wide money
 * aggregate appears, it is not here and the sweep fails.
 */
const NO_STORE_COLUMN: Record<string, Excuse> = {
  'app/api/analytics/route.ts': { reason: 'expense — لا عمودَ متجرٍ في الجدول؛ وكلفةُ تجربةٍ مالٌ خرجَ فعلاً، وحسمُها قرارُ المالك', sites: 1 },
  'app/api/finance/route.ts': { reason: 'expense — لا عمودَ متجرٍ في الجدول؛ القرارُ نفسُه', sites: 3 },
  'app/api/finance/transfers/route.ts': { reason: 'walletTransfer — لا عمودَ متجرٍ في الجدول', sites: 1 },
  'lib/analytics.ts': { reason: 'expense — لا عمودَ متجرٍ في الجدول؛ القرارُ نفسُه', sites: 1 },
};

describe('Ⅰ · every company-wide money read is on one side or the other', () => {
  const all = sites();

  it('and the sweep found them — a sweep that counts nothing proves nothing', () => {
    expect(all.length, 'لم يُعثَرْ على استعلامٍ واحد — المسحُ لا يَمسح').toBeGreaterThanOrEqual(20);
  });

  it('and not one falls outside the three buckets', () => {
    const stray = all.filter((s) => {
      const file = s.at.split(':')[0];
      if (file in ID_SCOPED || file in NO_STORE_COLUMN) return false;
      // Or it carries the filter itself, which is the third side.
      return !/realStoresOnly|isTest/.test(s.where);
    });
    expect(
      stray,
      `استعلامُ مالٍ على الشركةِ لم يُصنَّفْ — إمّا أن يَستثنيَ المنصّةَ أو يُكتَبَ لماذا لا يَحتاج:\n${stray
        .map((s) => `  ${s.at}  ${s.call}\n    ${s.where.slice(0, 120)}`)
        .join('\n')}`
    ).toEqual([]);
  });

  it('and no excused file grew a new site under cover of its excuse', () => {
    /*
     * THE HOLE THIS CLOSES, found by mutation: the excuses are per FILE, so
     * a brand-new company-wide aggregate added to an already-excused file
     * inherited that file's excuse and the sweep stayed green. Pinning the
     * count is what makes an excuse cover the sites it was written for and
     * no others.
     */
    const counted = new Map<string, number>();
    for (const s of all) {
      const f = s.at.split(':')[0];
      counted.set(f, (counted.get(f) ?? 0) + 1);
    }
    const wrong: string[] = [];
    for (const [file, excuse] of Object.entries({ ...ID_SCOPED, ...NO_STORE_COLUMN })) {
      const now = counted.get(file) ?? 0;
      if (now !== excuse.sites) {
        wrong.push(`${file}: العذرُ كُتب لـ${excuse.sites} موضعاً وفيه الآن ${now}`);
      }
    }
    expect(
      wrong,
      `موضعٌ جديدٌ تحتَ عذرٍ قديم — صنِّفْه بنفسِه أو صحِّحِ العدد:\n${wrong.join('\n')}`
    ).toEqual([]);
  });

  it('and the one real leak carries the filter', () => {
    /*
     * `staleStatements` listed every OPEN statement in the company. Named
     * here rather than left to the sweep, because it is the ONE site the
     * sweep's two excuse-lists do not cover — so if the filter is removed,
     * this says which line and why rather than «something is unclassified».
     */
    /*
     * COMMENTS STRIPPED, THEN WHITESPACE COLLAPSED — and the second half
     * is the part I got wrong twice.
     *
     * The first version matched a 600-character window between the call and
     * the filter and failed, on the ten-line comment I had just written
     * between them. So I stripped comments — and it failed again, because
     * `stripComments` BLANKS a block comment in place, keeping its length
     * so that line numbers still point at the real file. Seven hundred
     * characters of spaces is the same obstacle as seven hundred characters
     * of prose.
     *
     * Widening the window would make the assertion weaker instead of truer.
     * Collapsing the runs makes it tight AND immune to whatever is written
     * between the two lines.
     */
    const src = stripComments(readFileSync(join(SRC, 'lib/intelligence.ts'), 'utf8')).replace(/\s+/g, ' ');
    expect(src, 'كشوفُ المنصّةِ عادت تُرفَعُ كمشكلةٍ في العمل').toMatch(
      /courierStatement\.findMany\(\{[\s\S]{0,160}?realStoresOnly\(\)/
    );
  });

  it('and every excuse names a reason long enough to be one', () => {
    for (const [file, excuse] of Object.entries({ ...ID_SCOPED, ...NO_STORE_COLUMN })) {
      expect(excuse.reason.length, `${file}: عذرٌ بلا سبب`).toBeGreaterThan(20);
    }
  });

  it('and no excuse outlives what put it there', () => {
    /*
     * An excuse list nobody prunes is how a sweep stops sweeping. If a
     * file no longer has a company-wide money read, its entry goes.
     */
    const present = new Set(all.map((s) => s.at.split(':')[0]));
    const stale = [...Object.keys(ID_SCOPED), ...Object.keys(NO_STORE_COLUMN)].filter((f) => !present.has(f));
    expect(stale, `عذرٌ لم يَبقَ له موضع — احذِفْه:\n${stale.join('\n')}`).toEqual([]);
  });

  it('and the «no store column» bucket is really about tables with no store column', () => {
    /*
     * CHECKED AGAINST THE SCHEMA, not taken on trust. This is the bucket
     * that admits a live leak, so its claim is the one most worth being
     * false: if somebody adds `storeId` to `Expense`, the excuse evaporates
     * and this fails, which is exactly when the filter becomes writable.
     */
    const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
    const modelOf = (name: string) =>
      schema.slice(schema.indexOf(`model ${name} {`), schema.indexOf('\n}', schema.indexOf(`model ${name} {`)));
    for (const model of ['Expense', 'WalletTransfer']) {
      expect(modelOf(model), `${model} صارَ له عمودُ متجر — فالعذرُ بَطَلَ والفلترُ صارَ ممكناً`).not.toMatch(
        /^\s+storeId/m
      );
    }
  });
});

describe('Ⅱ · the filter itself', () => {
  it('asks for a real store, not «not a bench»', () => {
    /*
     * `isTest: false` and not `{ not: true }`: the column is NOT NULL
     * DEFAULT false so the two are the same set today — and `false` stays
     * correct if it ever becomes nullable, where `not: true` would also
     * match a row nobody has decided.
     */
    expect(realStoresOnly()).toEqual({ store: { isTest: false } });
    expect(realStoresHere()).toEqual({ isTest: false });
    expect(JSON.stringify(realStoresOnly()), 'صِيغَ كنفيٍ لا كإثبات').not.toContain('not');
  });

  it('and builds a FRESH object each call', () => {
    /*
     * A module-level object spread into a query is shared mutable state:
     * one caller editing it changes the rule for every other caller for
     * the life of the process. The same reason `leftWarehouseWhere()` is a
     * function.
     */
    const a = realStoresOnly();
    const b = realStoresOnly();
    expect(a).not.toBe(b);
    expect(a.store).not.toBe(b.store);
  });

  it('and the bench’s own screens get the inverse, from the same file', () => {
    expect(benchOnly()).toEqual({ store: { isTest: true } });
    expect(benchOnly().store.isTest).not.toBe(realStoresOnly().store.isTest);
  });

  it('and a figure that left a bench sale out can say so', () => {
    expect(benchExcludedAr(12)).toContain('12');
    expect(benchExcludedAr(0), 'قالَ شيئاً عن منصّةٍ لا طلبَ فيها').toBeNull();
    expect(benchExcludedAr(-3)).toBeNull();
  });
});

describe('Ⅲ · the mark is on the store, and a bench cannot be a shopfront', () => {
  it('the column exists in the schema, mapped to the database name', () => {
    const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
    const store = schema.slice(schema.indexOf('model Store {'), schema.indexOf('\n}', schema.indexOf('model Store {')));
    expect(store, 'العلامةُ ليست على المتجر').toMatch(/isTest\s+Boolean\s+@default\(false\)\s+@map\("is_test"\)/);
  });

  it('and the database refuses a public bench, not a screen', () => {
    /*
     * A bench carries half-finished products at invented prices, and a
     * store with `storefrontEnabled` is reachable by anybody at
     * `/s/<slug>`. Refused by a CHECK constraint because a screen is one
     * of several doors — see
     * [[osm-schema-is-not-the-constraints]]: six partial unique indexes in
     * this product live only in migrations, so a schema-only guard would
     * have missed those too.
     */
    const migrations = join(process.cwd(), 'prisma/migrations');
    const found = readdirSync(migrations)
      .filter((d) => statSync(join(migrations, d)).isDirectory())
      .map((d) => {
        try {
          return readFileSync(join(migrations, d, 'migration.sql'), 'utf8');
        } catch {
          return '';
        }
      })
      .some((sql) => /stores_test_bench_is_not_public/.test(sql) && /CHECK/.test(sql));
    expect(found, 'لا قيدَ في قاعدةِ البياناتِ يَمنعُ منصّةَ تجريبٍ معروضةً للناس').toBe(true);
  });
});
