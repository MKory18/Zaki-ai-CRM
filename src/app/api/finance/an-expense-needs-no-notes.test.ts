import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * «سجل مصروف» with the notes box left empty — which the form allows — failed outright: the expense's own notes are
 * optional, but the wallet movement written beside it carries a NOT NULL note, and it was handed `null`. These hold
 * the two rows the door writes, as they reach the database.
 */

const { db, requireContext, requirePermission, logAudit } = vi.hoisted(() => {
  const db = {
    wallet: { findFirst: vi.fn() },
    expense: { create: vi.fn(), update: vi.fn() },
    walletMovement: { create: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
  };
  return { db, requireContext: vi.fn(), requirePermission: vi.fn(), logAudit: vi.fn() };
});

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

import { POST } from './route';

const post = (body: Record<string, unknown>) =>
  POST(new Request('http://localhost/api/finance', { method: 'POST', body: JSON.stringify(body) }));
const movementNote = () => db.walletMovement.create.mock.calls[0]?.[0].data.note;

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({ user: { id: 'u1' }, companyId: 'c1', storeId: 's1' });
  requirePermission.mockResolvedValue({});
  db.wallet.findFirst.mockResolvedValue({ id: 'w1', name: 'الصندوق', currencyCode: 'JOD' });
  db.expense.create.mockResolvedValue({ id: 'e1' });
  db.walletMovement.create.mockResolvedValue({ id: 'm1' });
  db.expense.update.mockResolvedValue({ id: 'e1', movementId: 'm1' });
});

describe('an expense with no notes', () => {
  it('is recorded — and the money leaving says what it left for', async () => {
    const res = await post({ title: 'إيجار المستودع', category: 'OFFICE', amount: 100, walletId: 'w1' });
    expect(res.status).toBe(200);
    expect(db.expense.create.mock.calls[0][0].data.notes).toBeNull();
    expect(movementNote()).toBe('مصروف: إيجار المستودع');
  });

  it('blank notes are no notes', async () => {
    await post({ title: 'إيجار', category: 'OFFICE', amount: 100, walletId: 'w1', notes: '   ' });
    expect(movementNote()).toBe('مصروف: إيجار');
  });

  it('notes the seller wrote are the movement’s note, as before', async () => {
    await post({ title: 'إيجار', category: 'OFFICE', amount: 100, walletId: 'w1', notes: ' شهر تشرين ' });
    expect(movementNote()).toBe('شهر تشرين');
  });

  it('NEGATIVE: the movement is never handed an empty note', async () => {
    for (const notes of [undefined, null, '', ' ']) {
      vi.clearAllMocks();
      db.wallet.findFirst.mockResolvedValue({ id: 'w1', name: 'الصندوق', currencyCode: 'JOD' });
      db.expense.create.mockResolvedValue({ id: 'e1' });
      db.walletMovement.create.mockResolvedValue({ id: 'm1' });
      db.expense.update.mockResolvedValue({ id: 'e1' });
      await post({ title: 'شحن', category: 'OTHER', amount: 5, walletId: 'w1', notes });
      expect(String(movementNote() ?? '').trim()).not.toBe('');
    }
  });
});
