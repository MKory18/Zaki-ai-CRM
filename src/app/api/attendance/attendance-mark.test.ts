import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, requireContext } = vi.hoisted(() => ({
  db: { attendanceMark: { findFirst: vi.fn(), create: vi.fn() } },
  requireContext: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));

import { POST } from './mark/route';

/**
 * The fingerprint button. An attendance system has exactly one thing it
 * must never allow: marking somebody else's arrival.
 */

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/attendance/mark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({
    user: { id: 'me', name: 'سارة', role: 'CONFIRMATION_AGENT' },
    companyId: 'c1',
    storeId: 's1',
    country: { timezone: 'Asia/Amman', workHoursStart: '09:00', workHoursEnd: '17:00' },
  });
  db.attendanceMark.findFirst.mockResolvedValue(null);
  db.attendanceMark.create.mockResolvedValue({ at: new Date('2026-09-21T06:00:00Z') });
});

describe('marking attendance', () => {
  it('writes the mark for whoever holds the session', async () => {
    const res = await post({ kind: 'CHECK_IN' });
    expect(res.status).toBe(200);
    expect(db.attendanceMark.create.mock.calls[0][0].data).toMatchObject({
      userId: 'me',
      kind: 'CHECK_IN',
      source: 'MANUAL',
    });
  });

  it('cannot be aimed at another employee', async () => {
    // There is no userId to forge: a body that names somebody else still
    // writes the mark for the person signed in.
    await post({ kind: 'CHECK_IN', userId: 'somebody-else' });
    expect(db.attendanceMark.create.mock.calls[0][0].data.userId).toBe('me');
  });

  it('refuses a kind that is not arriving or leaving', async () => {
    // LOGIN is the system's to write, never a button's.
    const res = await post({ kind: 'LOGIN' });
    expect(res.status).toBe(400);
    expect(db.attendanceMark.create).not.toHaveBeenCalled();
  });

  it('treats a double tap as one arrival', async () => {
    // A day must not gain minutes because somebody pressed twice.
    db.attendanceMark.findFirst.mockResolvedValue({ id: 'm1', at: new Date('2026-09-21T06:00:00Z') });
    const res = await post({ kind: 'CHECK_IN' });
    expect((await res.json()).duplicate).toBe(true);
    expect(db.attendanceMark.create).not.toHaveBeenCalled();
  });

  it('lets a check-out through right after a check-in', async () => {
    // The duplicate guard is per kind: leaving is not a repeat of arriving.
    db.attendanceMark.findFirst.mockResolvedValue(null);
    await post({ kind: 'CHECK_OUT' });
    expect(db.attendanceMark.findFirst.mock.calls[0][0].where.kind).toBe('CHECK_OUT');
    expect(db.attendanceMark.create).toHaveBeenCalled();
  });
});
