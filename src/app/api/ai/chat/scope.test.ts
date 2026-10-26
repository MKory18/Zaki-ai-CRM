import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE MONEY NEVER LEAVES THE SERVER FOR SOMEBODY WHO MAY NOT SEE IT.
 *
 * Two ways out of this route, and both used to carry the whole business:
 * the request sent to the model, and the `context` sent back to the screen.
 * Narrowing one and not the other would hand back exactly what the other
 * just removed.
 */

const { requireContext, requirePermission, getCompanyAnalytics, askAiAssistant, can, db } = vi.hoisted(() => ({
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  getCompanyAnalytics: vi.fn(),
  askAiAssistant: vi.fn(),
  can: vi.fn(),
  db: { store: { findFirst: vi.fn() } },
}));

vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({
  requirePermission: (...a: unknown[]) => requirePermission(...a),
  can: (...a: unknown[]) => can(...a),
}));
vi.mock('@/lib/analytics', () => ({ getCompanyAnalytics: (...a: unknown[]) => getCompanyAnalytics(...a) }));
vi.mock('@/lib/ai', () => ({ askAiAssistant: (...a: unknown[]) => askAiAssistant(...a) }));
vi.mock('@/lib/db', () => ({ db }));

import { POST } from './route';

const ask = () =>
  POST(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify({ question: 'كم ربحنا؟' }) }));

const MONEY = ['revenue', 'net_profit', 'profit_margin', 'commission', 'production_cost', 'shipping_cost'];

beforeEach(() => {
  vi.resetAllMocks();
  requireContext.mockResolvedValue({ user: { id: 'u1' }, companyId: 'c1', storeId: 's1' });
  requirePermission.mockResolvedValue(undefined);
  db.store.findFirst.mockResolvedValue({ country: { currencyCode: 'SYP' } });
  askAiAssistant.mockResolvedValue('جواب');
  getCompanyAnalytics.mockResolvedValue({
    aiContext: {
      period: 'month', total_orders: 100, confirmed_orders: 80, confirmation_rate: 80,
      revenue: 5000, net_profit: 2200, profit_margin: 44, commission: 300,
      production_cost: 2000, shipping_cost: 400, top_profitable_product: 'سيروم',
      top_moderator: 'سارة',
    },
  });
});

describe('a person who may not see the money («عرض المالية»)', () => {
  beforeEach(() => can.mockImplementation((_u: unknown, p: string) => p !== 'finance.view'));

  it('the model is never given a money figure', async () => {
    await ask();
    const context = askAiAssistant.mock.calls[0][1];
    expect(context.total_orders).toBe(100);
    for (const key of MONEY) expect(key in context, key).toBe(false);
  });

  it('and neither is the screen', async () => {
    const body = await (await ask()).json();
    for (const key of MONEY) expect(key in body.context, key).toBe(false);
    expect(body.removed).toContain('finance');
  });

  it('the answer says so, rather than reading as the whole picture', async () => {
    await ask();
    expect(askAiAssistant.mock.calls[0][2].removed).toContain('finance');
  });
});

describe('a person who may', () => {
  beforeEach(() => can.mockReturnValue(true));

  it('gets the money, and the figures carry their own currency', async () => {
    await ask();
    const [, context, options] = askAiAssistant.mock.calls[0];
    expect(context.net_profit).toBe(2200);
    expect(options.removed).toEqual([]);
    // Not a dollar sign over Syrian pounds.
    expect(options.currency).toBe('SYP');
  });
});

describe('what the route still demands', () => {
  it('the permission that opens the assistant at all', async () => {
    can.mockReturnValue(true);
    await ask();
    expect(requirePermission).toHaveBeenCalledWith('ai.use');
  });

  it('a question', async () => {
    can.mockReturnValue(true);
    const res = await POST(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify({}) }));
    expect(res.status).toBe(400);
    expect(askAiAssistant).not.toHaveBeenCalled();
  });
});

/**
 * «عرض التقارير» IS NOT THE MONEY KEY.
 *
 * The money used to open on it, and the moderator and manager templates
 * hold it: the dashboard hid the net profit from them and the bubble told
 * them. The money is «عرض المالية»'s, as on every money screen.
 */
describe('reports without the money', () => {
  beforeEach(() => can.mockImplementation((_u: unknown, p: string) => p === 'ai.use' || p === 'reports.view'));

  it('the moderator template — reports, no finance — gets the orders and not a money figure', async () => {
    await ask();
    const context = askAiAssistant.mock.calls[0][1];
    expect(context.total_orders).toBe(100);
    for (const key of MONEY) expect(key in context, key).toBe(false);
  });

  it('and still the best moderator, because the performance board already shows it', async () => {
    await ask();
    expect(askAiAssistant.mock.calls[0][1].top_moderator).toBe('سارة');
  });
});

describe('a colleague’s name', () => {
  it('is not handed to someone who holds no screen that shows colleagues’ numbers', async () => {
    can.mockImplementation((_u: unknown, p: string) => p === 'ai.use');
    await ask();
    const context = askAiAssistant.mock.calls[0][1];
    expect('top_moderator' in context).toBe(false);
    expect(context.total_orders).toBe(100);
  });

  it('is handed to the team scoreboard’s key', async () => {
    can.mockImplementation((_u: unknown, p: string) => p === 'ai.use' || p === 'team.monitor');
    await ask();
    expect(askAiAssistant.mock.calls[0][1].top_moderator).toBe('سارة');
  });
});
