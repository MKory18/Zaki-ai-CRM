import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * ===========================================================================
 * «كلّ إجراء ذكاءٍ اصطناعيٍّ اقتراحٌ فقط» — مثبّتةً لا موعودة.
 * ===========================================================================
 *
 * This is the test named by the `ai-proposal-only` entry of
 * `src/lib/launch-flags.ts`. That entry is declared `INVARIANT` rather than
 * a switch precisely because this property is not a feature somebody turns
 * on — it is a claim about the code, and a claim about code that nothing
 * checks is a claim that stops being true on a Tuesday.
 *
 * The brief's own words: «every AI action is proposal-only». The report it
 * came with said this was already true by construction. It is ALMOST true,
 * and the two exceptions are the reason this file exists rather than a
 * comment:
 *
 *   1. `POST /api/ai/daily-summary` DOES write — `aiDailySummary.upsert`.
 *      That is the model's own answer, cached for the day so the screen does
 *      not pay for a second call. It is not money, not an order, not stock,
 *      not an audit row. Allowlisted BY NAME below, because an exception
 *      nobody wrote down is how the next one gets added quietly.
 *
 *   2. `POST /api/orders/ai-intake` both calls a model AND creates orders —
 *      in two mutually exclusive request modes. `{ text, dryRun }` calls
 *      OpenRouter and writes nothing; `{ parsed, confirm }` writes an order
 *      and never consults a model. The guarantee is therefore STRUCTURAL,
 *      not textual, so a regex cannot pin it and the second half of this
 *      file drives the route and watches the network instead.
 *
 * Everything else that calls a model writes nothing at all, which was
 * measured rather than assumed.
 */

// ===========================================================================
// PART A — the sweep
// ===========================================================================

/** Files that invoke a model, by call or by talking to a provider host. */
const CALLS_A_MODEL =
  /\b(aiChat|askAiAssistant|generateAiBusinessAnalysis|aiAssistedParse)\s*(?:<[^>]*>)?\s*\(/;
const PROVIDER_HOST =
  /openrouter\.ai|api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis|api\.deepseek\.com|api\.groq\.com/;

/** Any Prisma write, as `delegate.method`. */
const WRITE =
  /\b(?:db|tx|prisma)\.(\w+)\.(create|createMany|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)\b/g;

/**
 * Delegates NO file that invokes a model may write, allowlist or not.
 *
 * This is the list that gives the invariant teeth. The allowlist below says
 * «this known exception is fine»; this list says «no exception is fine
 * here», and it is the one a future author cannot talk their way past with
 * one more entry. It is the money, the state machine, the stock and the
 * audit trail — the four things this business is accountable for and that
 * `invariants.md` says a suggestion is never allowed to be.
 */
const NEVER = new Set([
  // المال
  'walletMovement',
  'walletTransfer',
  'walletOpeningCount',
  'wallet',
  'dailyClosing',
  'financialTransaction',
  'expense',
  'courierStatement',
  'statementLine',
  'statementReceipt',
  'settlementMatch',
  'commissionRule',
  'commissionEntry',
  'commissionPayout',
  'commissionPeriod',
  'penalty',
  'penaltyRule',
  'payslip',
  'deliveryFee',
  'offer',
  // حالة الطلب والشحن
  'orderStatusLog',
  'orderChangeRequest',
  'orderIssue',
  'shippingBatch',
  'deliveryAttempt',
  'returnReceipt',
  'orderAddOn',
  'orderClaimHistory',
  // المخزون
  'inventoryMovement',
  'productionBatch',
  'productionBatchCost',
  'stockOpeningCount',
  'product',
  // الصلاحيات والسجل
  'auditLog',
  'role',
  'rolePermission',
  'rolePermissionDefault',
  'userPermission',
  'user',
  'customerBlock',
  'company',
  'systemSetting',
]);

/**
 * Writes that are known, deliberate and explained.
 *
 * Keyed by the path so that a NEW file which writes gets caught even if it
 * writes something already allowed somewhere else — the question is always
 * «was this one thought about», never «is this method ever acceptable».
 */
const ALLOWED: Record<string, readonly string[]> = {
  // إجابة النموذج نفسها، مخزَّنةً ليوم واحد. ليست مالاً ولا حالةً ولا مخزوناً.
  'src/app/api/ai/daily-summary/route.ts': ['aiDailySummary.upsert'],
  /*
   * بابان في ملفٍ واحد: وضعُ المعاينة يسأل النموذج ولا يكتب، ووضعُ التأكيد
   * يكتب الطلب ولا يسأل النموذج. الفصلُ بينهما مثبَّتٌ في الجزء الثاني من
   * هذا الملف — لا هنا، لأنّ تعبيراً نمطياً لا يرى تدفّق التنفيذ.
   */
  'src/app/api/orders/ai-intake/route.ts': [
    'customer.update',
    'order.create',
    'orderActivity.create',
    'orderItem.create',
  ],
};

interface Finding {
  file: string;
  writes: string[];
  settingsWrite: boolean;
}

/** Every `.ts`/`.tsx` under a root, excluding tests. */
function sources(root: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = path.join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p.split(path.sep).join('/'));
    }
  };
  walk(root);
  return out;
}

/**
 * THE SCANNER, as a pure function of (path → source).
 *
 * Pure so that it can be fed a source that does not exist on disk, which is
 * what the negative tests do: a checker nobody has ever watched FAIL is not
 * a checker, it is a green tick.
 */
export function scanForAiWrites(files: Record<string, string>): Finding[] {
  const out: Finding[] = [];
  for (const [file, src] of Object.entries(files)) {
    if (!CALLS_A_MODEL.test(src) && !PROVIDER_HOST.test(src)) continue;
    const writes = new Set<string>();
    for (const m of src.matchAll(WRITE)) writes.add(`${m[1]}.${m[2]}`);
    if (/\$executeRaw/.test(src)) writes.add('$executeRaw');
    out.push({
      file,
      writes: [...writes].sort(),
      // `updateCompanySettings<T>(` — the generic is why a naive `\s*\(` misses it.
      settingsWrite: /updateCompanySettings\s*(?:<[^>]*>)?\s*\(/.test(src),
    });
  }
  return out;
}

/** The violations in a set of findings: a forbidden delegate, or an unexplained write. */
export function violations(findings: Finding[]): string[] {
  const bad: string[] = [];
  for (const f of findings) {
    const allowed = ALLOWED[f.file] ?? [];
    for (const w of f.writes) {
      const delegate = w.split('.')[0];
      if (NEVER.has(delegate)) {
        bad.push(`${f.file}: يكتب ${w} — وهذا ممنوع على أيّ ملفٍ يسأل نموذجاً، بلا استثناء.`);
        continue;
      }
      if (!allowed.includes(w)) {
        bad.push(`${f.file}: يكتب ${w} ولم يُشرَح. أضِفه إلى ALLOWED مع السبب، أو أزِل الكتابة.`);
      }
    }
  }
  return bad;
}

const onDisk = (): Record<string, string> =>
  Object.fromEntries(sources('src').map((f) => [f, readFileSync(f, 'utf8')]));

describe('مسحُ كلّ ما يسأل نموذجاً', () => {
  it('يجد فعلاً الملفات التي تسأل نموذجاً — وإلا فالمسح أخضرُ لأنه فارغ', () => {
    const found = scanForAiWrites(onDisk()).map((f) => f.file);
    // لو تغيّر اسمٌ أو انتقل ملفٌ، هذا يسقط قبل أن يصير المسح بلا معنى
    expect(found).toContain('src/app/api/ai/chat/route.ts');
    expect(found).toContain('src/app/api/ai/confirmation/route.ts');
    expect(found).toContain('src/app/api/ai/picking/route.ts');
    expect(found).toContain('src/app/api/ai/daily-summary/route.ts');
    expect(found).toContain('src/app/api/orders/ai-intake/route.ts');
    expect(found).toContain('src/app/api/growth/intelligence/ask/route.ts');
    expect(found.length).toBeGreaterThanOrEqual(7);
  });

  it('ولا يكتب أيٌّ منها مالاً ولا حالةً ولا مخزوناً ولا سجلّ تدقيق', () => {
    const bad = violations(scanForAiWrites(onDisk()));
    expect(bad, `\n${bad.join('\n')}\n`).toEqual([]);
  });

  it('وكلّ مسارٍ تحت /api/ai لا يكتب شيئاً، إلا ملخَّص اليوم وهو إجابة النموذج نفسها', () => {
    const writers = scanForAiWrites(onDisk())
      .filter((f) => f.file.startsWith('src/app/api/ai/') && f.writes.length > 0)
      .map((f) => `${f.file} -> ${f.writes.join(', ')}`);
    expect(writers).toEqual(['src/app/api/ai/daily-summary/route.ts -> aiDailySummary.upsert']);
  });
});

describe('والمسح نفسه يسقط حين يجب أن يسقط', () => {
  it('يرفض مساراً يسأل نموذجاً ثم يحرّك محفظة', () => {
    const bad = violations(
      scanForAiWrites({
        'src/app/api/ai/evil/route.ts':
          "const s = await aiChat({ job: 'x' });\nawait db.walletMovement.create({ data: {} });",
      })
    );
    expect(bad).toHaveLength(1);
    expect(bad[0]).toMatch(/walletMovement\.create/);
    expect(bad[0]).toMatch(/بلا استثناء/);
  });

  it('ويرفض مساراً يحرّك حالة طلب بعد سؤال النموذج', () => {
    const bad = violations(
      scanForAiWrites({
        'src/app/api/ai/evil/route.ts':
          "await askAiAssistant('q', {});\nawait db.orderStatusLog.create({ data: {} });",
      })
    );
    expect(bad).toHaveLength(1);
    expect(bad[0]).toMatch(/orderStatusLog/);
  });

  it('ويرفض كتابةً جديدةً غير ممنوعة لكنها غير مشروحة', () => {
    const bad = violations(
      scanForAiWrites({
        'src/app/api/ai/evil/route.ts': "await aiChat({});\nawait db.notification.create({ data: {} });",
      })
    );
    expect(bad).toHaveLength(1);
    expect(bad[0]).toMatch(/لم يُشرَح/);
  });

  it('ويرفض SQL خاماً بعد سؤال النموذج', () => {
    const bad = violations(
      scanForAiWrites({
        'src/app/api/ai/evil/route.ts': 'await aiChat({});\nawait db.$executeRaw`UPDATE orders SET status = 1`;',
      })
    );
    expect(bad).toHaveLength(1);
    expect(bad[0]).toMatch(/\$executeRaw/);
  });

  it('ويرى الملف الذي يتكلّم مع المزوّد مباشرةً بلا دالّة وسيطة', () => {
    const found = scanForAiWrites({
      'src/x.ts': "await fetch('https://api.openai.com/v1/chat/completions');\nawait db.wallet.update({});",
    });
    expect(found).toHaveLength(1);
    expect(violations(found)).toHaveLength(1);
  });

  it('ولا يشتكي من ملفٍ لا يسأل نموذجاً أصلاً، وإلا شمل نصف الشجرة', () => {
    expect(scanForAiWrites({ 'src/x.ts': 'await db.walletMovement.create({});' })).toEqual([]);
  });
});

// ===========================================================================
// PART B — البابُ الوحيد الذي يسأل نموذجاً ويكتب: والفصلُ بينهما مثبَّت
// ===========================================================================

/**
 * `POST /api/orders/ai-intake` is the only file in the tree that both calls
 * a model and creates an order, so it is the only place the invariant could
 * actually break without anybody noticing. The regex above cannot see it:
 * both halves are in one file and the separation is control flow.
 *
 * So the route is DRIVEN. `fetch` is replaced with a spy, the API key is
 * present so the model path is live, and:
 *
 *   • the confirm request creates an order and the spy is never called;
 *   • the preview request calls the spy and writes nothing.
 *
 * The second half is the positive control, and it is not decoration: a spy
 * that is broken, or a key that is missing, would make the first assertion
 * pass for the wrong reason — «the model was not called» because the model
 * can never be called. A negative test whose subject is unreachable proves
 * nothing, and that is the commonest way a guard like this is faked.
 */

const { db, requireContext, requirePermission, logAudit, notify, findOrCreateCustomer, productCost, resolveRegionId, orderRefFields, activeBlock, activeOffersFor } =
  vi.hoisted(() => ({
    db: {
      product: { findFirst: vi.fn(), findMany: vi.fn() },
      user: { findFirst: vi.fn() },
      order: { create: vi.fn() },
      orderItem: { create: vi.fn() },
      customer: { update: vi.fn(), findFirst: vi.fn() },
      orderActivity: { create: vi.fn() },
    },
    requireContext: vi.fn(),
    requirePermission: vi.fn(),
    logAudit: vi.fn(),
    notify: vi.fn(),
    findOrCreateCustomer: vi.fn(),
    productCost: vi.fn(),
    resolveRegionId: vi.fn(),
    orderRefFields: vi.fn(),
    activeBlock: vi.fn(),
    activeOffersFor: vi.fn(),
  }));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/notify', () => ({ notify: (...a: unknown[]) => notify(...a) }));
vi.mock('@/lib/customer-identity', () => ({ findOrCreateCustomer: (...a: unknown[]) => findOrCreateCustomer(...a) }));
vi.mock('@/lib/product-cost', () => ({ productCost: (...a: unknown[]) => productCost(...a) }));
vi.mock('@/lib/regions', () => ({ resolveRegionId: (...a: unknown[]) => resolveRegionId(...a) }));
vi.mock('@/lib/order-ref', () => ({ orderRefFields: (...a: unknown[]) => orderRefFields(...a) }));
vi.mock('@/lib/blacklist', () => ({ activeBlock: (...a: unknown[]) => activeBlock(...a) }));
vi.mock('@/lib/offers', () => ({ activeOffersFor: (...a: unknown[]) => activeOffersFor(...a) }));

const { POST } = await import('@/app/api/orders/ai-intake/route');

/** Every call the route made to the outside world. */
let calledHosts: string[];
const realFetch = globalThis.fetch;

const post = (body: unknown) =>
  POST(new Request('http://localhost/api/orders/ai-intake', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  vi.resetAllMocks();
  calledHosts = [];

  // المفتاح موجود، فمسارُ النموذج حيٌّ فعلاً — وإلا كان الاختبار السلبي فارغاً
  process.env.OPENROUTER_API_KEY = 'test-key-not-a-real-one';

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    calledHosts.push(String(input instanceof Request ? input.url : input));
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ customerName: 'سامر', phone: '0999111222', quantity: 1 }) } }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }) as unknown as typeof fetch;

  requireContext.mockResolvedValue({
    user: { id: 'u1', name: 'موظف', role: 'ADMIN' },
    companyId: 'c1',
    storeId: 's1',
    countryId: 'sy',
    country: { orderPrefix: 'SY', minorUnit: 0, currencyCode: 'SYP', allowNegativeStock: false },
  });
  requirePermission.mockResolvedValue(undefined);
  activeBlock.mockResolvedValue(null);
  findOrCreateCustomer.mockResolvedValue({ id: 'cust1', city: 'حلب', firstOrderDate: null });
  db.product.findFirst.mockResolvedValue({ id: 'p1', companyId: 'c1', name: 'منتج', basePrice: 100, image: null, batches: [] });
  db.product.findMany.mockResolvedValue([{ id: 'p1', name: 'منتج', sku: 'SKU1' }]);
  db.customer.findFirst.mockResolvedValue(null);
  productCost.mockResolvedValue({ average: 40 });
  orderRefFields.mockResolvedValue({ merchantReference: 'SY-1' });
  resolveRegionId.mockResolvedValue('r1');
  activeOffersFor.mockResolvedValue([]);
  db.order.create.mockResolvedValue({ id: 'o1', source: 'AI Intake' });
  db.orderItem.create.mockResolvedValue({});
  db.customer.update.mockResolvedValue({});
  db.orderActivity.create.mockResolvedValue({});
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.OPENROUTER_API_KEY;
});

describe('ai-intake — الوضعُ الذي يكتب لا يسأل نموذجاً', () => {
  it('ينشئ الطلب ولا يلمس أيّ مزوّد', async () => {
    const res = await post({
      confirm: true,
      parsed: {
        customerName: 'سامر الأحمد',
        phone: '0999111222',
        address: 'شارع',
        governorate: 'حلب',
        productId: 'p1xxxxxxxxxx',
        quantity: 2,
        finalPrice: 200,
      },
    });

    expect(res.status).toBe(200);
    expect(db.order.create).toHaveBeenCalledTimes(1);
    // هذا هو بيت القصيد: لا طلبَ شبكيّ واحد إلى نموذج في المسار الكاتب
    expect(calledHosts).toEqual([]);
  });

  it('ولا يسأل نموذجاً حتى حين يُدسُّ نصٌّ مع التأكيد', async () => {
    await post({
      confirm: true,
      text: 'اسمي سامر ورقمي 0999111222 وبدي منتج',
      parsed: {
        customerName: 'سامر الأحمد',
        phone: '0999111222',
        productId: 'p1xxxxxxxxxx',
        quantity: 1,
        finalPrice: 100,
      },
    });
    expect(calledHosts).toEqual([]);
  });

  it('وحين يُرفض المدخل لا يكتب ولا يسأل', async () => {
    const res = await post({ confirm: true, parsed: { customerName: 'x', phone: '1' } });
    expect(res.status).toBe(400);
    expect(db.order.create).not.toHaveBeenCalled();
    expect(calledHosts).toEqual([]);
  });
});

describe('ai-intake — الوضعُ الذي يسأل النموذج لا يكتب', () => {
  it('يسأل المزوّد فعلاً — هذه هي الشاهدة على أنّ الجاسوس يعمل', async () => {
    const res = await post({ text: 'اسمي سامر ورقمي 0999111222 وبدي منتج واحد' });
    expect(res.status).toBe(200);
    expect(calledHosts.some((u) => u.includes('openrouter.ai'))).toBe(true);
  });

  it('ولا يكتب شيئاً وهو يسأل', async () => {
    await post({ text: 'اسمي سامر ورقمي 0999111222 وبدي منتج واحد' });
    expect(db.order.create).not.toHaveBeenCalled();
    expect(db.orderItem.create).not.toHaveBeenCalled();
    expect(db.customer.update).not.toHaveBeenCalled();
    expect(db.orderActivity.create).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('وإذا سقط المزوّد يرجع إلى المحلّل الحتمي، ولا يكتب أيضاً', async () => {
    globalThis.fetch = vi.fn(async () => {
      calledHosts.push('boom');
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const res = await post({ text: 'اسمي سامر ورقمي 0999111222 وبدي منتج واحد' });
    expect(res.status).toBe(200);
    expect((await res.json()).engine).toBe('deterministic');
    expect(db.order.create).not.toHaveBeenCalled();
  });
});
