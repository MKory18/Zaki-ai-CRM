import { beforeEach, describe, expect, it, vi } from 'vitest';

const { can } = vi.hoisted(() => ({ can: vi.fn() }));
vi.mock('./authorization', () => ({ can: (...a: unknown[]) => can(...a) }));

import { deciderFor, mayDecide } from './change-request-routing';
import type { SessionUser } from '@/types/auth';

/**
 * Who answers "can this still be changed?".
 *
 * Only the person currently holding the order can, and that person moves as
 * the order travels. Route it to the wrong one and you either add a wait
 * for an answer the waiter cannot give, or you let somebody promise a
 * change to a customer whose parcel is already on a van.
 */

const SARA = 'user-sara';
const user = (id: string, role: string) => ({ id, role, permissions: [] }) as unknown as SessionUser;

const onHerDesk = { confirmationStatus: 'IN_PROGRESS', claimedById: SARA };
const inOperations = { confirmationStatus: 'CONFIRMED', claimedById: SARA };
const unclaimed = { confirmationStatus: 'NEW', claimedById: null };

beforeEach(() => {
  vi.clearAllMocks();
  can.mockReturnValue(false);
});

describe('who the decider is', () => {
  it('is the agent holding an order that is not confirmed yet', () => {
    expect(deciderFor(onHerDesk)).toEqual({ kind: 'HOLDING_AGENT', userId: SARA });
  });

  it('is the supervisor once the order is confirmed and into operations', () => {
    expect(deciderFor(inOperations)).toEqual({ kind: 'SUPERVISOR' });
  });

  it('is the supervisor when nobody is holding it', () => {
    // An unclaimed order has no informed opinion to ask.
    expect(deciderFor(unclaimed)).toEqual({ kind: 'SUPERVISOR' });
  });

  it('stays with the supervisor for every stage past confirmation', () => {
    for (const status of ['CONFIRMED', 'REJECTED', 'CANCELLED']) {
      expect(deciderFor({ confirmationStatus: status, claimedById: SARA }).kind).toBe('SUPERVISOR');
    }
  });

  it('keeps it with the agent through every stage of her own work', () => {
    for (const status of ['NEW', 'IN_PROGRESS', 'NO_ANSWER', 'FOLLOW_UP_REQUIRED', 'POSTPONED']) {
      expect(deciderFor({ confirmationStatus: status, claimedById: SARA }).kind).toBe('HOLDING_AGENT');
    }
  });
});

describe('who may decide', () => {
  it('lets the holding agent decide her own order', () => {
    expect(mayDecide(user(SARA, 'CONFIRMATION_AGENT'), onHerDesk).allowed).toBe(true);
  });

  it('refuses another agent who happens to be logged in', () => {
    const verdict = mayDecide(user('someone-else', 'CONFIRMATION_AGENT'), onHerDesk);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain('موظف التأكيد');
  });

  it('refuses the agent once the order has moved into operations', () => {
    // Whether the courier can still be reached was never her authority.
    const verdict = mayDecide(user(SARA, 'CONFIRMATION_AGENT'), inOperations);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain('مرحلة التشغيل');
  });

  it('lets a supervisor decide at either stage', () => {
    // An escalation path that stops working because one person went home is
    // not a path.
    const sup = user('sup', 'CONFIRMATION_SUPERVISOR');
    expect(mayDecide(sup, onHerDesk).allowed).toBe(true);
    expect(mayDecide(sup, inOperations).allowed).toBe(true);
  });

  it('treats the permission as the authority, not the job title', () => {
    can.mockReturnValue(true);
    expect(mayDecide(user('whoever', 'SETTLEMENT_OFFICER'), inOperations).allowed).toBe(true);
    expect(can).toHaveBeenCalledWith(expect.anything(), 'control.change_requests');
  });

  it('lets the owner decide anything', () => {
    expect(mayDecide(user('owner', 'SUPER_ADMIN'), inOperations).allowed).toBe(true);
  });

  it('reports the decider even when refusing, so the UI can name them', () => {
    const verdict = mayDecide(user('other', 'MODERATOR'), onHerDesk);
    expect(verdict.allowed).toBe(false);
    expect(verdict.decider).toEqual({ kind: 'HOLDING_AGENT', userId: SARA });
  });
});
