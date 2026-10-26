import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/types/auth';

/**
 * «المساعد الذكي بيرد بناءً على الصلاحيات الممنوحة للدور ولا الموظف؟»
 *
 * The employee's: every check reads the role's keys AND that person's
 * exceptions, and a DENY wins. So these tests do not mock `can` — each
 * person is built by the REAL engine (`computeEffectiveGrants`) from role
 * rows and exception rows, and the routes ask the real `can()`. That is what
 * makes «the role has the key, and this employee is denied it» and «the role
 * does not, and this employee is allowed it» real tests rather than two
 * mocks agreeing with each other.
 *
 * The holes were never «role or employee»; they were WHICH key each door
 * asked: the money on «عرض التقارير», the daily summary on nothing, «اسأل
 * الذكاء» on «استخدام المساعد الذكي» alone and deaf to the owner's ticks.
 */

const { db, current, getCompanyAnalytics, aiChat, aiSettings, askAiAssistant, generateAiBusinessAnalysis, teamPerformance } = vi.hoisted(() => ({
  db: {
    aiDailySummary: { findUnique: vi.fn(), findFirst: vi.fn(), upsert: vi.fn() },
    customer: { findMany: vi.fn() },
    store: { findFirst: vi.fn() },
  },
  current: { user: null as unknown as SessionUser },
  getCompanyAnalytics: vi.fn(),
  aiChat: vi.fn(),
  aiSettings: vi.fn(),
  askAiAssistant: vi.fn(),
  generateAiBusinessAnalysis: vi.fn(),
  teamPerformance: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
// The per-person ceiling is its own test (the-assistant-has-a-ceiling).
vi.mock('@/lib/ai-rate', () => ({ tooManyAiCalls: () => null }));
vi.mock('@/lib/geo-context', async (orig) => ({
  ...(await orig<typeof import('@/lib/geo-context')>()),
  requireContext: async () => ({
    user: current.user, companyId: 'c1', storeId: 's1', countryId: 'co1',
    country: { currencyCode: 'JOD', workHoursStart: 9, workHoursEnd: 17, weekendDays: [5], timezone: 'Asia/Amman' },
  }),
}));
// requirePermission asks the REAL can() of the person in the request.
vi.mock('@/lib/authorization', async (orig) => {
  const real = await orig<typeof import('@/lib/authorization')>();
  return {
    ...real,
    requirePermission: async (k: string) => {
      if (!real.can(current.user, k)) throw new Error(`Forbidden: missing required permission ${k}`);
      return current.user;
    },
  };
});
vi.mock('@/lib/analytics', () => ({ getCompanyAnalytics: (...a: unknown[]) => getCompanyAnalytics(...a) }));
vi.mock('@/lib/ai', () => ({
  askAiAssistant: (...a: unknown[]) => askAiAssistant(...a),
  generateAiBusinessAnalysis: (...a: unknown[]) => generateAiBusinessAnalysis(...a),
}));
vi.mock('@/lib/ai-provider', async (orig) => ({
  ...(await orig<typeof import('@/lib/ai-provider')>()),
  aiChat: (...a: unknown[]) => aiChat(...a),
  aiSettings: (...a: unknown[]) => aiSettings(...a),
}));
vi.mock('@/lib/team-performance', () => ({ teamPerformance: (...a: unknown[]) => teamPerformance(...a) }));

import { computeEffectiveGrants } from '@/lib/permissions-core';
import { attachGrants } from '@/lib/authorization';
import { GET as readSummary, POST as writeSummary } from './daily-summary/route';
import { GET as askInfo, POST as ask } from '../growth/intelligence/ask/route';
import { POST as chat } from './chat/route';

/** An employee as the real engine builds them: role rows, then their exceptions. */
async function employee(roleKeys: string[], ex: { allow?: string[]; deny?: string[] } = {}): Promise<SessionUser> {
  const base = { id: 'e1', email: 'e@x', name: 'هبة', role: 'CUSTOM', roleId: 'r1', status: 'ACTIVE', companyId: 'c1' } as unknown as SessionUser;
  const grants = await computeEffectiveGrants(base as never, {
    roleRows: async () => roleKeys.map((k) => ({ permission: k, scope: 'ALL_COMPANY', scopeIds: null })),
    overrideRows: async () => [
      ...(ex.allow ?? []).map((k) => ({ permission: k, effect: 'ALLOW', scope: 'ALL_COMPANY', scopeIds: null })),
      ...(ex.deny ?? []).map((k) => ({ permission: k, effect: 'DENY', scope: null, scopeIds: null })),
    ],
  });
  return attachGrants(base, grants);
}

const MONEY = ['revenue', 'net_profit', 'commission', 'production_cost', 'shipping_cost', 'profit_margin', 'operational_expenses', 'top_profitable_product'];
const CONTEXT = {
  period: 'all', total_orders: 100, confirmed_orders: 80, confirmation_rate: 80,
  revenue: 5000, net_profit: 2200, commission: 300, production_cost: 2000, shipping_cost: 400,
  profit_margin: 44, operational_expenses: 100, top_profitable_product: 'سيروم', top_moderator: 'سارة',
};
const PRODUCT = { id: 'p1', image: 'x.webp', name: 'سيروم', sku: 'S1', totalOrders: 10, confirmedOrders: 8, deliveredOrders: 6, rejectedOrders: 2, revenue: 300, cogs: 100, shippingCost: 30, netProfit: 170, profitMargin: 56 };

beforeEach(() => {
  vi.clearAllMocks();
  getCompanyAnalytics.mockResolvedValue({ aiContext: CONTEXT, productStats: [PRODUCT] });
  aiChat.mockResolvedValue('جواب');
  askAiAssistant.mockResolvedValue('جواب');
  generateAiBusinessAnalysis.mockResolvedValue({ summary: 'ملخّص', observations: [], risks: [], recommendations: [] });
  teamPerformance.mockResolvedValue({ employees: [{ name: 'سارة', confirmed: 40 }] });
  db.aiDailySummary.findUnique.mockResolvedValue({ id: 'd1', summaryText: 'صافي الربح ٢٢٠٠' });
  db.aiDailySummary.upsert.mockResolvedValue({ id: 'd1' });
  db.customer.findMany.mockResolvedValue([]);
  db.store.findFirst.mockResolvedValue({ country: { currencyCode: 'JOD' } });
  aiSettings.mockResolvedValue({ provider: 'OPENROUTER', model: 'm', hasKey: true, prompt: 'برومبت المالك', intelligenceScopes: ['orders', 'finance', 'team'] });
});

describe('the daily summary — the company’s money, all stores', () => {
  it('is read for the finance key with every country', async () => {
    current.user = await employee(['ai.use', 'finance.view', 'geo.manage']);
    expect((await (await readSummary()).json()).summary).toEqual({ id: 'd1', summaryText: 'صافي الربح ٢٢٠٠' });
  });

  it('the same role with a DENY on «عرض المالية»: no summary, and the row is never read', async () => {
    current.user = await employee(['ai.use', 'finance.view', 'geo.manage'], { deny: ['finance.view'] });
    const body = await (await readSummary()).json();
    expect(body.summary).toBeNull();
    expect(body.reasonAr).toContain('عرض المالية');
    expect(db.aiDailySummary.findUnique).not.toHaveBeenCalled();
    expect(db.aiDailySummary.findFirst).not.toHaveBeenCalled();
  });

  it('a DENY on «استخدام المساعد الذكي» closes the door — it asked for nothing at all before', async () => {
    current.user = await employee(['ai.use', 'finance.view', 'geo.manage'], { deny: ['ai.use'] });
    expect((await readSummary()).status).toBe(403);
  });

  it('a role without the money, with an ALLOW on it, reads it', async () => {
    current.user = await employee(['ai.use', 'geo.manage'], { allow: ['finance.view'] });
    expect((await (await readSummary()).json()).summary).not.toBeNull();
  });

  it('the confirmation-agent template (ai.use alone) neither reads nor regenerates it', async () => {
    current.user = await employee(['ai.use', 'confirmation.work']);
    expect((await (await readSummary()).json()).summary).toBeNull();
    const res = await writeSummary();
    expect(res.status).toBe(403);
    expect(getCompanyAnalytics).not.toHaveBeenCalled();
    expect(db.aiDailySummary.upsert).not.toHaveBeenCalled();
  });

  it('finance confined to some stores does not read the all-stores figures', async () => {
    current.user = await employee(['ai.use', 'finance.view']);
    expect((await (await readSummary()).json()).summary).toBeNull();
  });
});

describe('the bubble: money on «عرض المالية»', () => {
  const asked = async () => {
    await chat(new Request('http://x', { method: 'POST', body: JSON.stringify({ question: 'كم الربح؟' }) }));
    return askAiAssistant.mock.calls[0][1] as Record<string, unknown>;
  };

  it('the moderator template (reports, no finance) gets no money figure', async () => {
    current.user = await employee(['ai.use', 'reports.view']);
    const ctx = await asked();
    for (const k of MONEY) expect(k in ctx, k).toBe(false);
    expect(ctx.total_orders).toBe(100);
  });

  it('a role with the money and a DENY on it gets none', async () => {
    current.user = await employee(['ai.use', 'finance.view'], { deny: ['finance.view'] });
    const ctx = await asked();
    for (const k of MONEY) expect(k in ctx, k).toBe(false);
  });

  it('an ALLOW on «عرض المالية» brings it', async () => {
    current.user = await employee(['ai.use'], { allow: ['finance.view'] });
    expect((await asked()).net_profit).toBe(2200);
  });
});

describe('«اسأل الذكاء»: each source on its own key, and on the owner’s ticks', () => {
  const ASK = (sources: string[]) =>
    ask(new Request('http://x', { method: 'POST', body: JSON.stringify({ question: 'شو الوضع؟', sources }) }));
  const sent = () => JSON.parse(String((aiChat.mock.calls[0][0] as { user: string }).user).split('\n\nالسؤال:')[0].replace(/^البيانات:\n/, ''));

  it('the confirmation agent asking for sales: refused, and nothing goes to the model', async () => {
    current.user = await employee(['ai.use', 'customers.view_basic']);
    const res = await ASK(['SALES', 'PRODUCTS']);
    expect(res.status).toBe(403);
    expect(aiChat).not.toHaveBeenCalled();
  });

  it('the same agent on «العملاء» still works — counts, no names', async () => {
    current.user = await employee(['ai.use', 'customers.view_basic']);
    expect((await ASK(['CUSTOMERS'])).status).toBe(200);
    expect(sent().customers).toBeTruthy();
  });

  it('a manager with the centre and reports, no finance: orders without money, products without cost', async () => {
    current.user = await employee(['ai.use', 'growth.intelligence', 'reports.view']);
    await ASK(['SALES', 'PRODUCTS']);
    const data = sent();
    expect(data.sales.total_orders).toBe(100);
    for (const k of MONEY) expect(k in data.sales, k).toBe(false);
    expect(data.products[0]).toEqual({ name: 'سيروم', sku: 'S1', totalOrders: 10, confirmedOrders: 8, deliveredOrders: 6, rejectedOrders: 2 });
  });

  it('the same manager with an ALLOW on «عرض المالية» gets the profit and the cost', async () => {
    current.user = await employee(['ai.use', 'growth.intelligence', 'reports.view'], { allow: ['finance.view'] });
    await ASK(['SALES', 'PRODUCTS']);
    const data = sent();
    expect(data.sales.net_profit).toBe(2200);
    expect(data.products[0].cogs).toBe(100);
    // A column nobody listed never reaches the model.
    expect('image' in data.products[0]).toBe(false);
  });

  it('a DENY on «مركز الذكاء» withholds sales, products and team — and says so', async () => {
    current.user = await employee(['ai.use', 'growth.intelligence', 'finance.view', 'team.monitor', 'customers.view'], { deny: ['growth.intelligence'] });
    const res = await ASK(['SALES', 'PRODUCTS', 'TEAM', 'CUSTOMERS']);
    const body = await res.json();
    const data = sent();
    expect(data.sales).toBeUndefined();
    expect(data.products).toBeUndefined();
    expect(data.team).toBeUndefined();
    expect(body.noteAr).toContain('مركز الذكاء');
  });

  it('the owner left every scope unticked: the centre reads none of them, as its settings row promises', async () => {
    current.user = await employee(['ai.use', 'growth.intelligence', 'finance.view', 'team.monitor']);
    aiSettings.mockResolvedValue({ provider: 'OPENROUTER', model: 'm', hasKey: true, prompt: '', intelligenceScopes: [] });
    const res = await ASK(['SALES', 'TEAM']);
    expect(res.status).toBe(403);
    expect((await res.json()).errorAr).toContain('إعدادات الذكاء');
    expect(aiChat).not.toHaveBeenCalled();
  });

  it('the team: withheld without a team key, read with an ALLOW on «team.monitor»', async () => {
    current.user = await employee(['ai.use', 'growth.intelligence', 'customers.view']);
    await ASK(['TEAM', 'CUSTOMERS']);
    expect(sent().team).toBeUndefined();

    vi.clearAllMocks();
    aiChat.mockResolvedValue('جواب');
    teamPerformance.mockResolvedValue({ employees: [{ name: 'سارة', confirmed: 40 }] });
    aiSettings.mockResolvedValue({ provider: 'OPENROUTER', model: 'm', hasKey: true, prompt: '', intelligenceScopes: ['orders', 'team'] });
    getCompanyAnalytics.mockResolvedValue({ aiContext: CONTEXT, productStats: [PRODUCT] });
    current.user = await employee(['ai.use', 'growth.intelligence'], { allow: ['team.monitor'] });
    await ASK(['TEAM']);
    expect(sent().team).toEqual([{ name: 'سارة', confirmed: 40 }]);
  });

  it('goes the way «مركز الذكاء» is routed in AI settings — it went to the default', async () => {
    current.user = await employee(['ai.use', 'customers.view_basic']);
    await ASK(['CUSTOMERS']);
    expect((aiChat.mock.calls[0][0] as { job?: string }).job).toBe('advisor');
  });

  it('the panel lists only what this person may tick, names the rest, and shows the house prompt only to settings', async () => {
    current.user = await employee(['ai.use', 'customers.view_basic']);
    const info = await (await askInfo()).json();
    expect(info.sources.map((s: { id: string }) => s.id)).toEqual(['CUSTOMERS']);
    expect(info.withheld.map((w: { id: string }) => w.id)).toEqual(['SALES', 'PRODUCTS', 'TEAM']);
    expect(info.housePrompt).toBe('');

    current.user = await employee(['ai.use', 'customers.view_basic', 'settings.view']);
    expect((await (await askInfo()).json()).housePrompt).toBe('برومبت المالك');
  });
});
