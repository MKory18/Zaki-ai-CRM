import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Reversing a wallet movement — the only correction this system has.
 *
 * The handler checks that the WALLET in the path belongs to the current store,
 * and then takes a `movementId` out of the request body. If it does not carry
 * the wallet through to the lookup, the check is on nothing: naming one of your
 * own wallets in the path reverses a movement sitting in another store's.
 */

const { db, requireContext, requirePermission, logAudit, reverseMovement, walletBalance } = vi.hoisted(() => ({
  db: {
    wallet: { findFirst: vi.fn() },
  },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  logAudit: vi.fn(),
  reverseMovement: vi.fn(),
  walletBalance: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a), can: () => true }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/wallets', async (orig) => ({
  ...(await orig<typeof import('@/lib/wallets')>()),
  reverseMovement: (...a: unknown[]) => reverseMovement(...a),
  walletBalance: (...a: unknown[]) => walletBalance(...a),
}));

import { PATCH } from './route';

const WALLET = '22222222-2222-4222-8222-222222222222';
const MOVEMENT = '33333333-3333-4333-8333-333333333333';
const params = { params: Promise.resolve({ id: WALLET }) };
const body = (b: unknown) =>
  new Request('http://localhost/x', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({
    user: { id: 'u1', name: 'Accountant' },
    companyId: 'c1',
    storeId: 's1',
    country: { minorUnit: 3, currencyCode: 'JOD' },
  });
  requirePermission.mockResolvedValue({});
  db.wallet.findFirst.mockResolvedValue({ id: WALLET, name: 'الصندوق', isActive: true, country: { minorUnit: 3 } });
  reverseMovement.mockResolvedValue({ id: 'rev1' });
  walletBalance.mockResolvedValue({ balance: 0 });
});

describe('reversing a movement', () => {
  it('reverses it, and says which wallet it was authorised for', async () => {
    const res = await PATCH(body({ movementId: MOVEMENT, reason: 'سُجِّل المبلغ مرتين' }), params);
    expect(res.status).toBe(201);
    expect(reverseMovement).toHaveBeenCalledTimes(1);
    expect(reverseMovement.mock.calls[0][1]).toMatchObject({
      companyId: 'c1',
      // THE GUARD: the wallet from the PATH, which was checked against the
      // store — never one implied by the movement the body names.
      walletId: WALLET,
      movementId: MOVEMENT,
    });
  });

  it('refuses when the wallet in the path is not this store’s', async () => {
    db.wallet.findFirst.mockResolvedValue(null);
    const res = await PATCH(body({ movementId: MOVEMENT, reason: 'سُجِّل المبلغ مرتين' }), params);
    expect(res.status).toBe(404);
    expect(reverseMovement).not.toHaveBeenCalled();
  });

  it('refuses a reversal with no written reason', async () => {
    const res = await PATCH(body({ movementId: MOVEMENT, reason: 'قصير' }), params);
    expect(res.status).toBe(400);
    expect(reverseMovement).not.toHaveBeenCalled();
  });

  it('answers 409 rather than 500 when the service refuses', async () => {
    reverseMovement.mockRejectedValue(new Error('Movement not found'));
    const res = await PATCH(body({ movementId: MOVEMENT, reason: 'سُجِّل المبلغ مرتين' }), params);
    expect(res.status).toBe(409);
  });
});
