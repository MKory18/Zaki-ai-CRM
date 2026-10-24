import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

const { logAudit } = vi.hoisted(() => ({ logAudit: vi.fn() }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

import { applyWallets } from '../../scripts/wallets/apply';
import { WALLETS } from '../../scripts/wallets/catalog';

/** A tiny in-memory stand-in for the three calls the script makes. */
function fake(stores: { id: string; companyId: string; countryId: string; name: string }[], wallets: Record<string, unknown>[] = []) {
  const rows = [...wallets];
  const db = {
    store: { findMany: vi.fn(async () => stores) },
    wallet: {
      findFirst: vi.fn(async ({ where }: { where: { storeId: string; name: string } }) =>
        rows.find((w) => w.storeId === where.storeId && w.name === where.name) ?? null
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const w = { id: `w${rows.length + 1}`, ...data };
        rows.push(w);
        return w;
      }),
    },
  };
  return { db: db as unknown as PrismaClient, raw: db, rows };
}

const STORE = { id: 's1', companyId: 'co', countryId: 'sy', name: 'متجر صحة بلس' };
const log = () => undefined;

beforeEach(() => vi.clearAllMocks());

describe('what the owner asked for', () => {
  it('is exactly these five names with these currencies', () => {
    expect(WALLETS.map((w) => [w.name, w.currencyCode])).toEqual([
      ['كاش ليرة سوري', 'SYP'],
      ['كاش دولار', 'USD'],
      ['شام كاش سوري', 'SYP'],
      ['شام كاش دولار', 'USD'],
      ['محفظة binance', 'USDT'],
    ]);
  });
});

describe('applying it', () => {
  it('a dry run writes nothing and says what it would add', async () => {
    const { db, raw } = fake([STORE]);
    const r = await applyWallets({ db, log }, { apply: false });
    expect(raw.wallet.create).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
    expect(r.created).toHaveLength(5);
  });

  it('--apply creates the five in THIS store and country, opening balance zero, each audited', async () => {
    const { db, rows } = fake([STORE]);
    await applyWallets({ db, log }, { apply: true });
    expect(rows).toHaveLength(5);
    for (const w of rows) {
      expect(w).toMatchObject({ companyId: 'co', storeId: 's1', countryId: 'sy', openingBalance: 0 });
    }
    expect(rows.map((w) => w.currencyCode)).toEqual(['SYP', 'USD', 'SYP', 'USD', 'USDT']);
    expect(logAudit).toHaveBeenCalledTimes(5);
    expect(logAudit.mock.calls[0][0]).toMatchObject({ action: 'WALLET_CREATED', entity: 'Wallet', companyId: 'co' });
  });

  it('runs twice and still leaves five — the second run adds nothing and audits nothing', async () => {
    const { db, rows } = fake([STORE]);
    await applyWallets({ db, log }, { apply: true });
    logAudit.mockClear();
    const again = await applyWallets({ db, log }, { apply: true });
    expect(rows).toHaveLength(5);
    expect(again.created).toEqual([]);
    expect(again.kept).toHaveLength(5);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('a wallet that already exists under another currency is left alone and reported', async () => {
    const { db, rows } = fake([STORE], [{ id: 'old', storeId: 's1', name: 'كاش دولار', currencyCode: 'EUR' }]);
    const r = await applyWallets({ db, log }, { apply: true });
    expect(rows.find((w) => w.name === 'كاش دولار')?.currencyCode).toBe('EUR');
    expect(r.warnings).toHaveLength(1);
    expect(rows).toHaveLength(5);
  });

  it('NEGATIVE: no matching store, or two, stops before any write', async () => {
    for (const stores of [[], [STORE, { ...STORE, id: 's2', name: 'صحة بلس' }]]) {
      const { db, raw } = fake(stores);
      await expect(applyWallets({ db, log }, { apply: true })).rejects.toThrow(/بالضبط/);
      expect(raw.wallet.create).not.toHaveBeenCalled();
    }
  });
});
