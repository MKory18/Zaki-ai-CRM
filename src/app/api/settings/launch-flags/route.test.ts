import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * /api/settings/launch-flags — البابُ الذي يقلب المفتاح، وما يرفضه.
 *
 * This route is the half of the «state lives in the database» decision that
 * makes it honest: a column nobody can reach is a code constant with extra
 * steps, and a flip that leaves no audit row is an env var with extra steps.
 * So the three things asserted hardest here are the permission, the audit
 * row, and that the registry's refusals survive the trip through HTTP
 * instead of becoming a 500 with the reason thrown away.
 */

const { db, requireContext, requirePermission, logAudit } = vi.hoisted(() => ({
  db: { company: { findUnique: vi.fn(), update: vi.fn() }, $transaction: vi.fn(), $queryRaw: vi.fn() },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

/**
 * THE REGISTRY IS REAL HERE, EXCEPT WHEN A TEST NEEDS A FLIP TO SUCCEED.
 *
 * Every test below runs against the actual `LAUNCH_FLAGS`, which is the
 * point — a fixture registry could not catch somebody turning `ads-agent`
 * into a boolean switch. But there is no `SWITCH` in that registry today,
 * so a SUCCESSFUL flip is unreachable, and the route's own duty on success
 * — the audit row, and recording the resolved STATE rather than the boolean
 * that was posted — would ship with no test at all.
 *
 * So `setLaunchFlag` is overridable, and only one block overrides it. The
 * lib's refusals keep being tested through the real function; what is
 * simulated is the lib SUCCEEDING, which is the lib's business to get right
 * and not this route's.
 */
const h = vi.hoisted(() => ({ override: null as null | ((...a: unknown[]) => unknown) }));
vi.mock('@/lib/launch-flags', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/launch-flags')>();
  return {
    ...real,
    setLaunchFlag: (...a: unknown[]) =>
      h.override ? h.override(...a) : (real.setLaunchFlag as (...x: unknown[]) => unknown)(...a),
  };
});

import { GET, PUT } from './route';
import { LAUNCH_FLAGS } from '@/lib/launch-flags';

/** The company's settings document, as the mocked row holds it. */
let stored: Record<string, unknown>;

const put = (body: unknown) =>
  PUT(new Request('http://localhost/api/settings/launch-flags', { method: 'PUT', body: JSON.stringify(body) }));

beforeEach(() => {
  vi.resetAllMocks();
  h.override = null;
  stored = {};
  requireContext.mockResolvedValue({ user: { id: 'u1' }, companyId: 'c1', storeId: 's1' });
  requirePermission.mockResolvedValue(undefined);
  db.company.findUnique.mockImplementation(async () => ({ settings: JSON.stringify(stored) }));
  db.$queryRaw.mockImplementation(async () => [{ settings: JSON.stringify(stored) }]);
  db.company.update.mockImplementation(async ({ data }: { data: { settings: string } }) => {
    stored = JSON.parse(data.settings);
    return {};
  });
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
});

describe('GET', () => {
  it('يعرض كلّ مفتاح بحالته ومالكه وتاريخ مراجعته وسببه', async () => {
    const body = await (await GET()).json();
    expect(body.flags).toHaveLength(LAUNCH_FLAGS.length);
    for (const f of body.flags) {
      expect(f.owner).toBeTruthy();
      expect(f.reviewOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(f.whyAr).toMatch(/[؀-ۿ]/);
    }
  });

  it('وغير المبنيّ يظهر UNBUILT لا OFF — لا تلتبس الشاشة', async () => {
    const body = await (await GET()).json();
    const ads = body.flags.find((f: { key: string }) => f.key === 'ads-agent');
    expect(ads.state).toBe('UNBUILT');
    expect(ads.state).not.toBe('OFF');
    expect(ads.absent).toBeTruthy();
  });

  it('ويحسب المتأخّر في الخادم — الشاشة لا تقارن تواريخ', async () => {
    const body = await (await GET()).json();
    expect(Array.isArray(body.overdue)).toBe(true);
  });

  it('ويطلب صلاحية العرض', async () => {
    await GET();
    expect(requirePermission).toHaveBeenCalledWith('settings.view');
  });

  it('ويرفض من لا يملكها', async () => {
    requirePermission.mockRejectedValue(new Error('Forbidden: missing required permission settings.view'));
    expect((await GET()).status).toBe(403);
  });
});

describe('PUT', () => {
  it('يطلب صلاحية التعديل لا صلاحية العرض', async () => {
    await put({ key: 'ads-agent', on: true });
    expect(requirePermission).toHaveBeenCalledWith('settings.edit');
  });

  it('ويرفض من لا يملكها قبل أيّ كتابة', async () => {
    requirePermission.mockRejectedValue(new Error('Forbidden: missing required permission settings.edit'));
    const res = await put({ key: 'ads-agent', on: true });
    expect(res.status).toBe(403);
    expect(db.company.update).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('ويرفض تشغيل ميزةٍ غير مبنيّة بـ409 ويقول السبب بالعربية — لا 500', async () => {
    const res = await put({ key: 'ads-agent', on: true });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('LAUNCH_FLAG_REFUSED');
    expect(body.errorAr).toMatch(/غير مبنيّة/);
    expect(db.company.update).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('ويرفض إطفاءها أيضاً — لأنها ليست مفتاحاً في الأصل', async () => {
    expect((await put({ key: 'ads-agent', on: false })).status).toBe(409);
    expect((await put({ key: 'late-thresholds-p80', on: false })).status).toBe(409);
    expect(db.company.update).not.toHaveBeenCalled();
  });

  it('ويرفض قلب القاعدة المثبّتة', async () => {
    const res = await put({ key: 'ai-proposal-only', on: true });
    expect(res.status).toBe(409);
    expect((await res.json()).errorAr).toMatch(/قاعدة/);
  });

  it('ولا تصل أيّ قيمةٍ إلى وثيقة الإعدادات بعد كلّ هذه الرفوض', async () => {
    await put({ key: 'ads-agent', on: true });
    await put({ key: 'late-thresholds-p80', on: true });
    await put({ key: 'ai-proposal-only', on: true });
    expect(stored.launchFlags).toBeUndefined();
  });

  it('ويرفض جسماً غير صالح', async () => {
    expect((await put({ key: 'ads-agent' })).status).toBe(400);
    expect((await put({ on: true })).status).toBe(400);
    expect((await put({ key: 'ads-agent', on: 'yes' })).status).toBe(400);
  });

  it('ومفتاحٌ غير معلن خطأٌ برمجيّ لا رفضٌ مقصود', async () => {
    // «مُطفأ» كان سيقول «نعرف هذا المفتاح وهو نازل»، والمطبعيُّ ليس كذلك
    expect((await put({ key: 'adsagent', on: true })).status).toBe(500);
  });
});

describe('PUT — حين ينجح القلب فعلاً', () => {
  /** ما يرجّعه السجلّ عند نجاح القلب: مفتاحٌ حقيقيٌّ صار مُشغَّلاً. */
  const flipped = {
    key: 'fixture-switch',
    ar: 'مفتاح',
    owner: 'أحمد',
    reviewOn: '2026-11-30',
    kind: 'SWITCH',
    state: 'ON',
    overdue: false,
    daysOverdue: 0,
    holdUntil: '2026-10-16',
    whyAr: 'مُشغَّل.',
  };

  beforeEach(() => {
    h.override = async () => flipped;
  });

  it('يرجع المفتاح محلولاً بـ200', async () => {
    const res = await put({ key: 'fixture-switch', on: true });
    expect(res.status).toBe(200);
    expect((await res.json()).flag.state).toBe('ON');
  });

  it('ويكتب سجلّ تدقيق — القلب بلا سجلٍّ هو متغيّرُ بيئةٍ بخطواتٍ زائدة', async () => {
    await put({ key: 'fixture-switch', on: true });
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'c1', userId: 'u1', action: 'LAUNCH_FLAG_SET' })
    );
  });

  it('والسجلّ يحمل الحالة التي صدّقها النظام لا القيمة التي طُلبت', async () => {
    h.override = async () => ({ ...flipped, state: 'OFF', heldByHold: true });
    await put({ key: 'fixture-switch', on: true });
    const row = logAudit.mock.calls.at(-1)![0] as { newData: { state: string } };
    // طُلب التشغيل، والنظام أبقاه مُطفأً بسبب التجميد: السجلّ يقول OFF
    expect(row.newData.state).toBe('OFF');
  });
});
