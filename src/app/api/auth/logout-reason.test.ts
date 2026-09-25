import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WHY A SESSION ENDED.
 *
 * A person signing out and a phone left on a counter are the same action
 * and a very different fact. The second one, seen four times in a week for
 * the same account, is the thing a manager wants to notice.
 *
 * The reason arrives from a browser, so it is not believed. It is a word
 * chosen from two, and anything else is recorded as unknown rather than
 * written into the audit trail as whatever the caller said — an audit log
 * that repeats attacker-chosen strings is a place to hide a sentence.
 */

const { db, getCurrentUser, logAudit } = vi.hoisted(() => ({
  db: { user: { update: vi.fn() } },
  getCurrentUser: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/auth', () => ({
  COOKIE_NAME: 'salesflow_session',
  getCurrentUser: (...a: unknown[]) => getCurrentUser(...a),
}));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

import { POST } from './logout/route';

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'u1', email: 'a@b.c', companyId: 'c1' });
  db.user.update.mockResolvedValue({});
});

const post = (body?: unknown) =>
  POST(
    new Request('http://localhost/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  );

const reasonOf = () => logAudit.mock.calls[0][0].newData.reason;

describe('the session ends the same way whatever the reason', () => {
  it('bumps the token version — the cookie somebody copied dies too', async () => {
    await post({ reason: 'idle' });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { tokenVersion: { increment: 1 } },
    });
  });

  it('and clears the cookie', async () => {
    const res = await post({ reason: 'manual' });
    expect(res.headers.get('set-cookie')).toContain('salesflow_session=');
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});

describe('what the trail is allowed to say', () => {
  it('records a person leaving', async () => {
    await post({ reason: 'manual' });
    expect(reasonOf()).toBe('manual');
  });

  it('records a phone left alone', async () => {
    await post({ reason: 'idle' });
    expect(reasonOf()).toBe('idle');
  });

  it('records the older callers, who send no body, as manual', async () => {
    await post();
    expect(reasonOf()).toBe('manual');
  });

  // The negatives. A field from a browser is an untrusted string.
  it('does not repeat back a word it was not expecting', async () => {
    await post({ reason: 'ADMIN APPROVED THIS' });
    expect(reasonOf()).toBe('unknown');
  });

  it('nor a whole essay, nor an object, nor a number', async () => {
    await post({ reason: 'x'.repeat(5000) });
    expect(reasonOf()).toBe('unknown');
    logAudit.mockClear();

    await post({ reason: { toString: 'idle' } });
    expect(reasonOf()).toBe('unknown');
    logAudit.mockClear();

    await post({ reason: 42 });
    expect(reasonOf()).toBe('unknown');
  });

  it('and signs the person out anyway — a strange reason is not a reason to stay in', async () => {
    const res = await post({ reason: 'nonsense' });
    expect(res.status).toBe(200);
    expect(db.user.update).toHaveBeenCalled();
  });
});
