import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * LOOKING IS NOT DECIDING.
 *
 * Reading a list of who was late is supervision. Taking money off somebody
 * is not, and one permission for both would hand the second to everybody
 * who legitimately needed the first — which is how a deduction ends up
 * applied by whoever happened to have the screen open.
 */

const { db, requireContext, requirePermission, applyPenalty, waivePenalty, reversePenalty, logAudit, PenaltyRefused } =
  vi.hoisted(() => ({
    db: { penalty: { findMany: vi.fn(), findFirst: vi.fn() }, $transaction: vi.fn() },
    requireContext: vi.fn(),
    requirePermission: vi.fn(),
    applyPenalty: vi.fn(),
    waivePenalty: vi.fn(),
    reversePenalty: vi.fn(),
    logAudit: vi.fn(),
    PenaltyRefused: class PenaltyRefused extends Error {
      constructor(public reason: string) {
        super(reason);
      }
    },
  }));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/penalty-service', () => ({
  applyPenalty: (...a: unknown[]) => applyPenalty(...a),
  waivePenalty: (...a: unknown[]) => waivePenalty(...a),
  reversePenalty: (...a: unknown[]) => reversePenalty(...a),
  PenaltyRefused,
}));

import { GET, POST } from './route';

const ID = '11111111-1111-4111-8111-111111111111';

const list = (qs = '') => GET(new Request(`http://localhost/api/team/penalties${qs}`));
const post = (body: unknown) =>
  POST(new Request('http://localhost/api/team/penalties', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  vi.resetAllMocks();
  requireContext.mockResolvedValue({ user: { id: 'boss' }, companyId: 'c1', storeId: 's1' });
  requirePermission.mockResolvedValue(undefined);
  db.penalty.findMany.mockResolvedValue([]);
  db.penalty.findFirst.mockResolvedValue({
    id: ID, userId: 'u1', kind: 'LATE', amount: 60, currencyCode: 'SYP', status: 'PROPOSED',
  });
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
});

describe('looking', () => {
  it('needs the viewing key', async () => {
    await list();
    expect(requirePermission).toHaveBeenCalledWith('penalties.view');
  });

  it('is refused without it', async () => {
    requirePermission.mockRejectedValue(new Error('Forbidden: missing required permission penalties.view'));
    expect((await list()).status).toBe(403);
    expect(db.penalty.findMany).not.toHaveBeenCalled();
  });

  it('and shows this store only', async () => {
    await list();
    expect(db.penalty.findMany.mock.calls[0][0].where).toMatchObject({ companyId: 'c1', storeId: 's1' });
  });

  it('ignores a status this build does not know, rather than returning nothing', async () => {
    await list('?status=INVENTED');
    expect(db.penalty.findMany.mock.calls[0][0].where.status).toBeUndefined();
  });
});

describe('deciding', () => {
  it('needs its OWN key, not the viewing one', async () => {
    await post({ penaltyId: ID, action: 'apply' });
    expect(requirePermission).toHaveBeenCalledWith('penalties.decide');
  });

  it('is refused without it — and nothing is even read', async () => {
    requirePermission.mockRejectedValue(new Error('Forbidden: missing required permission penalties.decide'));
    expect((await post({ penaltyId: ID, action: 'apply' })).status).toBe(403);
    expect(db.penalty.findFirst).not.toHaveBeenCalled();
    expect(applyPenalty).not.toHaveBeenCalled();
  });

  it('stamps the decider — money never moves anonymously', async () => {
    await post({ penaltyId: ID, action: 'apply' });
    expect(applyPenalty.mock.calls[0][1]).toMatchObject({ penaltyId: ID, decidedById: 'boss' });
  });

  it('and writes it to the audit, with the amount and the reason', async () => {
    await post({ penaltyId: ID, action: 'waive', note: 'كان في عزاء' });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PENALTY_WAIVE',
        newData: expect.objectContaining({ employeeId: 'u1', amount: 60, reason: 'كان في عزاء' }),
      })
    );
  });

  it('a deduction of another store is not found — an id is not an authority', async () => {
    db.penalty.findFirst.mockResolvedValue(null);
    expect((await post({ penaltyId: ID, action: 'apply' })).status).toBe(404);
    expect(applyPenalty).not.toHaveBeenCalled();
  });

  it('an action this build does not have is refused', async () => {
    expect((await post({ penaltyId: ID, action: 'delete' })).status).toBe(400);
    expect(db.penalty.findFirst).not.toHaveBeenCalled();
  });

  it('and a refusal from the service comes back as one, in Arabic', async () => {
    waivePenalty.mockRejectedValue(new PenaltyRefused('REASON_REQUIRED'));
    const res = await post({ penaltyId: ID, action: 'waive' });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('REASON_REQUIRED');
    expect(body.error).toContain('السبب');
    expect(logAudit).not.toHaveBeenCalled();
  });
});
