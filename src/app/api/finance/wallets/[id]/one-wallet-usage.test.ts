import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A WALLET IS NOT UNTOUCHED BECAUSE THE FOUR TABLES WE REMEMBERED ARE EMPTY.
 *
 * `usageOf` decides whether a wallet is stopped or really deleted. It
 * counted movements, closings, receipts and transfers. The schema has
 * eight relations pointing at `Wallet`.
 *
 * Measured against the dev database, not read: a wallet with a single
 * expense paid from it and nothing else —
 *
 *   usageOf → {movements:0, closings:0, receipts:0, transfers:0}
 *   touched → false
 *   db.wallet.delete → P2003, expenses_wallet_id_fkey
 *
 * The money was never at risk: every relation is `onDelete: Restrict`, so
 * PostgreSQL refused. The defect is the answer the person got — a 500
 * where the route had «أُوقِفت … مرتبطة بـ١ مصروف» ready to say.
 *
 * SO THE SCHEMA IS THE LIST, NOT A MEMORY OF IT. The first test below
 * reads `schema.prisma` and fails the day a ninth table takes a walletId.
 */

const root = process.cwd();
const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8');
const route = readFileSync(join(root, 'src/app/api/finance/wallets/[id]/route.ts'), 'utf8');

/**
 * Every model that names a wallet — BY RELATION OR BY BARE COLUMN.
 *
 * Reading only `@relation(… references: [id])` finds seven and misses
 * `WalletTransfer`, which carries `fromWalletId` and `toWalletId` as plain
 * strings with no foreign key. A column that holds a wallet's id is a
 * reference whether or not the database was told so — and the one without
 * the constraint is the one nothing else will catch.
 */
function modelsPointingAtWallet(): string[] {
  const found = new Set<string>();
  for (const block of schema.split(/^model /m).slice(1)) {
    const name = block.slice(0, block.search(/\s/));
    if (name === 'Wallet') continue;
    const declared = /^\s+\w+\s+Wallet\??\s+@relation\(/m.test(block);
    const column = /^\s+\w*[Ww]alletId\s+String/m.test(block);
    if (declared || column) found.add(name);
  }
  return [...found].sort();
}

describe('the wallet asks every table that knows it', () => {
  const models = modelsPointingAtWallet();

  it('found the relations — a sweep over nothing proves nothing', () => {
    expect(models.length).toBeGreaterThanOrEqual(8);
    expect(models).toContain('Expense');
    expect(models).toContain('WalletMovement');
  });

  it('and the delete route counts every one of them', () => {
    const uncounted = models.filter((m) => {
      const prop = m[0].toLowerCase() + m.slice(1);
      return !route.includes(`db.${prop}.count(`);
    });
    expect(
      uncounted,
      `جداولُ تُشير إلى المحفظة ولا يعدّها usageOf:\n${uncounted.join('\n')}`
    ).toEqual([]);
  });
});

/**
 * AND THE BEHAVIOUR ITSELF — the route, asked to delete the wallet the
 * probe built.
 */
const { requireContext, requirePermission, logAudit } = vi.hoisted(() => ({
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  logAudit: vi.fn(),
}));

const counts: Record<string, number> = {};
const walletUpdate = vi.fn();
const walletDelete = vi.fn();

vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/db', () => {
  const counter = (key: string) => ({ count: vi.fn(async () => counts[key] ?? 0) });
  return {
    db: {
      wallet: {
        findFirst: vi.fn(async () => ({ id: 'w1', name: 'الصندوق النقدي', openingBalance: 0 })),
        update: walletUpdate,
        delete: walletDelete,
      },
      walletMovement: counter('movements'),
      dailyClosing: counter('closings'),
      statementReceipt: counter('receipts'),
      walletTransfer: counter('transfers'),
      expense: counter('expenses'),
      payslip: counter('payslips'),
      commissionPayout: counter('commissionPayouts'),
      walletOpeningCount: counter('openingCount'),
    },
  };
});

const { DELETE } = await import('./route');

const remove = async () => {
  const res = await DELETE(new Request('http://localhost/api/finance/wallets/w1', { method: 'DELETE' }), {
    params: Promise.resolve({ id: 'w1' }),
  });
  return { status: res.status, body: await res.json() };
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(counts)) delete counts[k];
  requireContext.mockResolvedValue({ companyId: 'c1', user: { id: 'u1', name: 'كامل' } });
  requirePermission.mockResolvedValue({});
  walletUpdate.mockResolvedValue({});
  walletDelete.mockResolvedValue({});
});

describe('a wallet that paid for something', () => {
  it('is stopped, not deleted, when an expense came out of it', async () => {
    counts.expenses = 1;
    const { body } = await remove();
    expect(walletDelete, 'حُذفت محفظةٌ خرج منها مصروف').not.toHaveBeenCalled();
    expect(body.stopped).toBe(true);
    expect(body.message).toContain('مصروف');
  });

  for (const [key, word] of [
    ['payslips', 'كشف راتب'],
    ['commissionPayouts', 'صرف عمولة'],
    ['openingCount', 'جرد افتتاحي'],
    ['movements', 'حركة'],
  ] as const) {
    it(`is stopped when the only thing against it is ${key}`, async () => {
      counts[key] = 2;
      const { body } = await remove();
      expect(walletDelete).not.toHaveBeenCalled();
      expect(body.stopped).toBe(true);
      expect(body.message).toContain(word);
    });
  }
});

describe('a wallet nothing ever touched', () => {
  it('is really deleted — that is what the delete is for', async () => {
    const { body } = await remove();
    expect(walletDelete).toHaveBeenCalledWith({ where: { id: 'w1' } });
    expect(body.deleted).toBe(true);
  });
});
