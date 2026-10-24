import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * «محفظة binance — العملة USDT». The door asked for exactly three letters, so a tether wallet — the one
 * currency the owner needs that has FOUR — could not be created from the screen or the API. These hold
 * the new shape: three or four letters, upper-cased, nothing else.
 */

const { db, requireContext, requirePermission, logAudit } = vi.hoisted(() => ({
  db: { country: { findFirst: vi.fn() }, wallet: { findFirst: vi.fn(), create: vi.fn() } },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  logAudit: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({
  requirePermission: (...a: unknown[]) => requirePermission(...a),
  can: () => true,
}));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/wallets', () => ({ walletBalance: vi.fn() }));
vi.mock('@/lib/api-error', () => ({ apiErrorResponse: (e: unknown) => new Response(String(e), { status: 500 }) }));

import { POST } from './route';

const COUNTRY = '11111111-1111-4111-8111-111111111111';
const post = (currencyCode: string) =>
  POST(
    new Request('http://x/api/finance/wallets', {
      method: 'POST',
      body: JSON.stringify({ countryId: COUNTRY, name: 'محفظة binance', currencyCode }),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({ user: { id: 'u1' }, companyId: 'co', storeId: 'st' });
  db.country.findFirst.mockResolvedValue({ id: COUNTRY, name: 'سوريا' });
  db.wallet.findFirst.mockResolvedValue(null);
  db.wallet.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'w1', ...data }));
});

describe('the currency a wallet may carry', () => {
  it('accepts a four-letter code and stores it', async () => {
    const res = await post('USDT');
    expect(res.status).toBe(201);
    expect(db.wallet.create.mock.calls[0][0].data.currencyCode).toBe('USDT');
  });

  it('upper-cases what was typed', async () => {
    await post(' usdt ');
    expect(db.wallet.create.mock.calls[0][0].data.currencyCode).toBe('USDT');
  });

  it('still accepts the three-letter codes it always did', async () => {
    expect((await post('SYP')).status).toBe(201);
    expect((await post('USD')).status).toBe(201);
  });

  it('NEGATIVE: two letters, five letters, digits and spaces are refused and nothing is written', async () => {
    for (const bad of ['US', 'USDTT', 'US1', 'U SD', '']) {
      expect((await post(bad)).status, bad).toBe(400);
    }
    expect(db.wallet.create).not.toHaveBeenCalled();
  });
});
