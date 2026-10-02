import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * بوابة الإطلاق — كلّ قاعدةٍ ومعها اختبارها السلبي.
 *
 * The standing rule of this project is that a guard without a negative test
 * guards nothing, so every refusal below is asserted by making it fire, not
 * by asserting that the happy path still works.
 *
 * Two things this file is careful about:
 *
 *   • THE REGISTRY HAS NO SWITCH. Every real flag is `UNBUILT` or
 *     `INVARIANT`, so the `ON`, `EXPIRED` and hold paths cannot be reached
 *     through `LAUNCH_FLAGS`. They are driven through the pure cores
 *     (`resolveFlag`, `assertResolvedOpen`, `assertWritable`) with fixture
 *     declarations built by the real `declareFlag`, which is why those
 *     cores are exported at all. Without that, the day-15 switch would ship
 *     with its gate never once exercised.
 *   • THE ABSENT FLAGS ARE CHECKED AGAINST THE REAL ARRAY, not a fixture.
 *     The claim being defended is about what this build actually declares,
 *     and a fixture could not break if somebody quietly changed
 *     `ads-agent` to a boolean switch.
 */

const { db, updateCompanySettings } = vi.hoisted(() => ({
  db: { company: { findUnique: vi.fn() } },
  updateCompanySettings: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('./db', () => ({ db }));
vi.mock('./company-settings', () => ({
  updateCompanySettings: (...a: unknown[]) => updateCompanySettings(...a),
}));

import {
  LAUNCH_FLAGS,
  LaunchFlagClosed,
  SETTINGS_KEY,
  assertFlagOpen,
  assertResolvedOpen,
  assertWritable,
  declareFlag,
  flagByKey,
  flagState,
  isFlagOn,
  launchFlagReport,
  overdueFlags,
  parseStoredFlags,
  resolveFlag,
  setLaunchFlag,
  today,
  type FlagDecl,
} from './launch-flags';

/** The company row holds this settings document. */
let stored: Record<string, unknown>;

beforeEach(() => {
  vi.resetAllMocks();
  stored = {};
  db.company.findUnique.mockImplementation(async () => ({ settings: JSON.stringify(stored) }));
  updateCompanySettings.mockImplementation(
    async (_companyId: string, key: string, change: (c: unknown) => unknown) => {
      const next = change(stored[key]);
      stored[key] = next;
      return next;
    }
  );
});

const day = (iso: string) => new Date(`${iso}T09:00:00.000Z`);

/** The refusal `assertFlagOpen` threw, or a failure if it did not refuse. */
async function refusal(p: Promise<unknown>): Promise<LaunchFlagClosed> {
  try {
    await p;
  } catch (e) {
    if (e instanceof LaunchFlagClosed) return e;
    throw e;
  }
  throw new Error('كان يجب أن تُرفَض ولم تُرفَض');
}

/** A real switch, declared through the real declarer. */
const SWITCH: FlagDecl = declareFlag({
  kind: 'SWITCH',
  key: 'fixture-switch',
  ar: 'مفتاح للاختبار',
  owner: 'أحمد',
  reviewOn: '2026-11-30',
  holdUntil: '2026-10-16',
});

// ===========================================================================
describe('الإعلان — النوع يرفض قبل المراجعة', () => {
  /*
   * The compile-time half of the contract. These lines are the test: if the
   * type ever stops refusing them, `@ts-expect-error` becomes an unused
   * directive and `tsc --noEmit` fails on this file. So the TYPE is pinned
   * by the typechecker, which is the only thing that can pin a type.
   */
  it('يرفض الإعلان بلا مالك أو بلا تاريخ مراجعة — في وقت الترجمة', () => {
    // @ts-expect-error — بلا مالك
    const noOwner = () => declareFlag({ kind: 'UNBUILT', key: 'a', ar: 'و', reviewOn: '2026-10-16', absent: 'x' });
    // @ts-expect-error — بلا تاريخ مراجعة
    const noDate = () => declareFlag({ kind: 'UNBUILT', key: 'b', ar: 'و', owner: 'أحمد', absent: 'x' });
    // @ts-expect-error — مالك فارغ
    const blank = () => declareFlag({ kind: 'UNBUILT', key: 'c', ar: 'و', owner: '', reviewOn: '2026-10-16', absent: 'x' });
    // @ts-expect-error — تاريخ ليس يوماً
    const notADate = () => declareFlag({ kind: 'UNBUILT', key: 'd', ar: 'و', owner: 'أحمد', reviewOn: 'soon', absent: 'x' });
    expect([noOwner, noDate, blank, notADate]).toHaveLength(4);
  });

  it('ويرفض ما لا يراه النوع: مالك فراغات، ودور بدل اسم', () => {
    expect(() =>
      declareFlag({ kind: 'UNBUILT', key: 'e', ar: 'و', owner: '   ', reviewOn: '2026-10-16', absent: 'x' })
    ).toThrow(/بلا مالك/);
    for (const role of ['الفريق', 'المالك', 'TBD', 'team', '-']) {
      expect(
        () => declareFlag({ kind: 'UNBUILT', key: 'f', ar: 'و', owner: role, reviewOn: '2026-10-16', absent: 'x' }),
        role
      ).toThrow(/دور لا شخص/);
    }
  });

  it('ويرفض يوماً مستحيلاً يقبله النوع', () => {
    expect(() =>
      declareFlag({ kind: 'UNBUILT', key: 'g', ar: 'و', owner: 'أحمد', reviewOn: '2026-13-45', absent: 'x' })
    ).toThrow(/ليس يوماً حقيقياً/);
  });

  it('ويرفض مفتاحاً تاريخ مراجعته قبل نهاية تجميده', () => {
    expect(() =>
      declareFlag({
        kind: 'SWITCH',
        key: 'h',
        ar: 'و',
        owner: 'أحمد',
        reviewOn: '2026-10-10',
        holdUntil: '2026-10-16',
      })
    ).toThrow(/قبل نهاية التجميد/);
  });

  it('ويرفض «غير مبنيّ» بلا دليل، و«قاعدة» بلا اختبار', () => {
    expect(() =>
      declareFlag({ kind: 'UNBUILT', key: 'i', ar: 'و', owner: 'أحمد', reviewOn: '2026-10-16', absent: '  ' })
    ).toThrow(/بلا دليل/);
    expect(() =>
      declareFlag({ kind: 'INVARIANT', key: 'j', ar: 'و', owner: 'أحمد', reviewOn: '2026-10-16', heldBy: '' })
    ).toThrow(/بلا اختبار/);
  });

  it('ويرفض مفتاحاً بصياغة غير صالحة', () => {
    expect(() =>
      declareFlag({ kind: 'UNBUILT', key: 'Ads Agent', ar: 'و', owner: 'أحمد', reviewOn: '2026-10-16', absent: 'x' })
    ).toThrow(/مفتاح غير صالح/);
  });
});

// ===========================================================================
describe('السجلّ الحقيقي', () => {
  it('كلّ مفتاح معلن له مالكٌ شخصٌ وتاريخُ مراجعةٍ ووصفٌ عربي', () => {
    expect(LAUNCH_FLAGS.length).toBeGreaterThan(0);
    for (const f of LAUNCH_FLAGS) {
      expect(f.owner.trim(), f.key).not.toBe('');
      expect(f.reviewOn, f.key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // عربي: الوصف لِبَشَر، فلا يكون مفتاحاً إنجليزياً مكرّراً
      expect(f.ar, f.key).toMatch(/[؀-ۿ]/);
    }
  });

  it('المفاتيح فريدة', () => {
    const keys = LAUNCH_FLAGS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('الميزتان غير الموجودتين معلنتان UNBUILT لا false', () => {
    for (const key of ['ads-agent', 'late-thresholds-p80']) {
      const decl = flagByKey(key);
      expect(decl, key).not.toBeNull();
      expect(decl!.kind, key).toBe('UNBUILT');
      const r = resolveFlag(decl!, {}, day('2026-10-02'));
      // هذه هي النقطة كلّها: لا تُقرأ كمفتاحٍ مُطفأ
      expect(r.state, key).toBe('UNBUILT');
      expect(r.state, key).not.toBe('OFF');
      expect(r.absent, key).toBeTruthy();
    }
  });

  it('وقاعدة «الاقتراح فقط» ليست مفتاحاً، وتسمّي اختبارها', () => {
    const decl = flagByKey('ai-proposal-only')!;
    expect(decl.kind).toBe('INVARIANT');
    const r = resolveFlag(decl, {}, day('2026-10-02'));
    expect(r.state).toBe('INVARIANT');
    expect(r.state).not.toBe('OFF');
    expect(r.heldBy).toBe('src/lib/ai-proposal-only.test.ts');
  });

  it('ولا مفتاح حيّ واحد في السجلّ اليوم — وهذه هي الحقيقة المقصودة', () => {
    expect(LAUNCH_FLAGS.filter((f) => f.kind === 'SWITCH')).toEqual([]);
  });
});

// ===========================================================================
describe('ما يُقرأ من قاعدة البيانات', () => {
  it('يُسقِط أيّ مفتاح ليس SWITCH معلناً — حتى لو كُتب باليد في الوثيقة', () => {
    expect(parseStoredFlags({ 'ads-agent': true, 'late-thresholds-p80': true, 'ai-proposal-only': true })).toEqual({});
  });

  it('ويُسقِط مفتاحاً غير معروف، وقيمةً ليست منطقية', () => {
    expect(parseStoredFlags({ 'made-up': true, 'fixture-switch': 'yes' })).toEqual({});
  });

  /*
   * ما يُثبته هذا الاختبار بدقّة: الوثيقة المكسورة لا تُسقط الاستدعاء
   * والبوابة تبقى مغلقة. ما لا يُثبته: أنّ البديل هو «لا شيء مخزَّن» —
   * فلا مفتاح SWITCH في السجلّ، فلا حالةَ تعتمد على المخزَّن أصلاً.
   * التحوير M21 بقي أخضر، والسبب مكتوبٌ عند موضعه في الكود.
   */
  it('ووثيقة مكسورة لا تُسقط الاستدعاء، والبوابة تبقى مغلقة', async () => {
    db.company.findUnique.mockResolvedValue({ settings: '{ not json' });
    await expect(assertFlagOpen('c1', 'ads-agent')).rejects.toBeInstanceOf(LaunchFlagClosed);
    const report = await launchFlagReport('c1', day('2026-10-02'));
    expect(report.every((f) => f.state !== 'ON')).toBe(true);
  });
});

// ===========================================================================
describe('الحلّ — جدول الحالات كاملاً', () => {
  it('مُطفأ افتراضاً: البوابة مغلقة حين لا شيء مخزَّن', () => {
    expect(resolveFlag(SWITCH, {}, day('2026-10-20')).state).toBe('OFF');
  });

  it('مُشغَّل بعد التجميد وقبل المراجعة', () => {
    expect(resolveFlag(SWITCH, { 'fixture-switch': true }, day('2026-10-20')).state).toBe('ON');
  });

  it('مخزَّنٌ مُشغَّل داخل التجميد يُقرأ مُطفأً ويقول لماذا', () => {
    const r = resolveFlag(SWITCH, { 'fixture-switch': true }, day('2026-10-05'));
    expect(r.state).toBe('OFF');
    expect(r.heldByHold).toBe(true);
  });

  it('ويوم نهاية التجميد نفسه مسموح', () => {
    expect(resolveFlag(SWITCH, { 'fixture-switch': true }, day('2026-10-16')).state).toBe('ON');
  });

  it('بعد تاريخ المراجعة: EXPIRED لا ON ولا OFF', () => {
    const r = resolveFlag(SWITCH, { 'fixture-switch': true }, day('2026-12-01'));
    expect(r.state).toBe('EXPIRED');
    expect(r.overdue).toBe(true);
    expect(r.daysOverdue).toBe(1);
    expect(r.whyAr).toContain('أحمد');
  });

  it('ويوم المراجعة نفسه ليس متأخراً', () => {
    expect(resolveFlag(SWITCH, { 'fixture-switch': true }, day('2026-11-30')).state).toBe('ON');
  });

  it('والتأخّر ظاهرٌ على غير المبنيّ أيضاً — لا ينتهي بصمت', () => {
    const r = resolveFlag(flagByKey('ads-agent')!, {}, day('2026-11-16'));
    expect(r.state).toBe('UNBUILT');
    expect(r.overdue).toBe(true);
    expect(r.daysOverdue).toBe(31);
    expect(r.whyAr).toMatch(/مراجعتها/);
  });
});

// ===========================================================================
describe('البوابة — assertFlagOpen', () => {
  it('ترفض المُطفأ', () => {
    expect(() => assertResolvedOpen(resolveFlag(SWITCH, {}, day('2026-10-20')))).toThrow(LaunchFlagClosed);
    try {
      assertResolvedOpen(resolveFlag(SWITCH, {}, day('2026-10-20')));
    } catch (e) {
      expect((e as LaunchFlagClosed).code).toBe('OFF');
    }
  });

  it('وترفض المنتهي برمزٍ مختلف', () => {
    try {
      assertResolvedOpen(resolveFlag(SWITCH, { 'fixture-switch': true }, day('2026-12-01')));
      throw new Error('كان يجب أن ترفض');
    } catch (e) {
      expect(e).toBeInstanceOf(LaunchFlagClosed);
      expect((e as LaunchFlagClosed).code).toBe('EXPIRED');
    }
  });

  it('وترفض غير المبنيّ برمزٍ مختلف عن المُطفأ', async () => {
    await expect(assertFlagOpen('c1', 'ads-agent')).rejects.toBeInstanceOf(LaunchFlagClosed);
    const err = await refusal(assertFlagOpen('c1', 'late-thresholds-p80'));
    expect(err.code).toBe('UNBUILT');
    expect(err.code).not.toBe('OFF');
  });

  it('وترفض القاعدة — لا معنى لفتحها', async () => {
    const err = await refusal(assertFlagOpen('c1', 'ai-proposal-only'));
    expect(err.code).toBe('INVARIANT');
  });

  it('ورسالتها تبدأ بـ Forbidden فتصير 403 لا 500 في أيّ مسار', async () => {
    const err = await refusal(assertFlagOpen('c1', 'ads-agent'));
    expect(err.message.startsWith('Forbidden:')).toBe(true);
    expect(err.ar).toMatch(/[؀-ۿ]/);
  });

  it('وتمرّ المُشغَّل', () => {
    expect(assertResolvedOpen(resolveFlag(SWITCH, { 'fixture-switch': true }, day('2026-10-20'))).state).toBe('ON');
  });

  it('ومفتاحٌ غير معلن يرمي خطأً لا «مُطفأ» — الخطأ المطبعي ليس إغلاقاً مقصوداً', async () => {
    await expect(flagState('c1', 'adsagent')).rejects.toThrow(/غير معرَّف/);
    await expect(isFlagOn('c1', 'nope')).rejects.toThrow(/غير معرَّف/);
  });

  it('وisFlagOn كاذبة لغير المبنيّ وللقاعدة وللمنتهي', async () => {
    expect(await isFlagOn('c1', 'ads-agent')).toBe(false);
    expect(await isFlagOn('c1', 'ai-proposal-only')).toBe(false);
  });
});

// ===========================================================================
describe('الكتابة — setLaunchFlag', () => {
  it('ترفض ما ليس مفتاحاً: لا يمكن تخزين ads-agent بأيّ قيمة', async () => {
    await expect(setLaunchFlag('c1', 'ads-agent', true)).rejects.toThrow(/ليس مفتاحاً يُقلَب/);
    await expect(setLaunchFlag('c1', 'ads-agent', false)).rejects.toThrow(/ليس مفتاحاً يُقلَب/);
    await expect(setLaunchFlag('c1', 'late-thresholds-p80', true)).rejects.toThrow(/ليس مفتاحاً يُقلَب/);
    await expect(setLaunchFlag('c1', 'ai-proposal-only', true)).rejects.toThrow(/ليس مفتاحاً يُقلَب/);
    expect(updateCompanySettings).not.toHaveBeenCalled();
    expect(stored[SETTINGS_KEY]).toBeUndefined();
  });

  it('وترفض التشغيل داخل التجميد', () => {
    expect(() => assertWritable(SWITCH, true, '2026-10-05')).toThrow(/مُجمَّد حتى 2026-10-16/);
    expect(() => assertWritable(SWITCH, true, '2026-10-15')).toThrow(/مُجمَّد/);
  });

  it('وترفض التشغيل بعد تاريخ المراجعة', () => {
    expect(() => assertWritable(SWITCH, true, '2026-12-01')).toThrow(/مرّ تاريخ مراجعته/);
  });

  it('ولا ترفض الإطفاء أبداً — مفتاحُ القتل لا يُعطَّل بقاعدة', () => {
    expect(() => assertWritable(SWITCH, false, '2026-10-05')).not.toThrow();
    expect(() => assertWritable(SWITCH, false, '2026-12-01')).not.toThrow();
  });

  it('وتسمح بالتشغيل في النافذة', () => {
    expect(() => assertWritable(SWITCH, true, '2026-10-16')).not.toThrow();
    expect(() => assertWritable(SWITCH, true, '2026-11-30')).not.toThrow();
  });

  it('ومفتاحٌ غير معلن يُرفض قبل أيّ كتابة', async () => {
    await expect(setLaunchFlag('c1', 'made-up', true)).rejects.toThrow(/غير معرَّف/);
    expect(updateCompanySettings).not.toHaveBeenCalled();
  });
});

// ===========================================================================
describe('التقرير', () => {
  it('يعرض كلّ مفتاح بحالته ومالكه وسببه', async () => {
    const report = await launchFlagReport('c1', day('2026-10-02'));
    expect(report.map((f) => f.key).sort()).toEqual(
      [...LAUNCH_FLAGS].map((f) => f.key).sort()
    );
    for (const f of report) {
      expect(f.owner).toBeTruthy();
      expect(f.whyAr).toMatch(/[؀-ۿ]/);
    }
    expect(report.every((f) => f.state !== 'ON')).toBe(true);
  });

  it('ويُفرز المتأخّر عن تاريخ مراجعته', async () => {
    expect(overdueFlags(await launchFlagReport('c1', day('2026-10-02')))).toEqual([]);
    const late = overdueFlags(await launchFlagReport('c1', day('2026-11-01')));
    expect(late.map((f) => f.key).sort()).toEqual(['ads-agent', 'late-thresholds-p80']);
  });
});

describe('today', () => {
  it('يومٌ لا لحظة — فلا ينتهي مفتاحٌ في ساعةٍ مختلفة بحسب مكان الخادم', () => {
    expect(today(new Date('2026-10-02T23:59:59.999Z'))).toBe('2026-10-02');
    expect(today(new Date('2026-10-02T00:00:00.000Z'))).toBe('2026-10-02');
  });
});
