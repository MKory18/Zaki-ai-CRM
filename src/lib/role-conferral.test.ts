import { describe, expect, it } from 'vitest';
import { granterHoldsAll } from './user-permissions';
import type { SessionUser } from '@/types/auth';

/**
 * What you may hand to somebody else.
 *
 * The rule is "you cannot grant a power you do not hold", and it is the
 * thing standing between a manager and quietly promoting himself through a
 * role he creates. Every case below is an attempt to get around it, plus
 * the one case where the rule was wrong.
 */

/**
 * A user with exactly these grants. The engine reads `effectiveGrants`, so
 * a bare list of names would silently resolve to "holds nothing" and make
 * every case below pass for the wrong reason.
 */
const actor = (
  held: Array<string | [string, string]>,
  role = 'COMPANY_ADMIN'
): SessionUser =>
  ({
    id: 'a1',
    role,
    status: 'ACTIVE',
    effectiveGrants: {
      fullAccess: false,
      grants: Object.fromEntries(
        held.map((h) => (Array.isArray(h) ? [h[0], { scope: h[1] }] : [h, { scope: 'ALL_COMPANY' }]))
      ),
    },
  } as unknown as SessionUser);

const grant = (permission: string, scope = 'ALL_COMPANY') => ({ permission, scope });

describe('the granter-must-hold rule', () => {
  it('refuses a key the granter does not hold at all', () => {
    expect(granterHoldsAll(actor(['orders.view']), [grant('finance.cashbox')])).not.toBeNull();
  });

  it('refuses a wider scope than the granter holds', () => {
    // Somebody who may only edit their OWN orders must not hand out the
    // right to edit everybody's.
    const narrow = actor([['orders.update', 'OWN']], 'MODERATOR');
    expect(granterHoldsAll(narrow, [grant('orders.update', 'ALL_COMPANY')])).not.toBeNull();
  });

  it('allows a narrower scope than the granter holds', () => {
    // Handing out less than you hold is a downgrade, not an escalation.
    expect(granterHoldsAll(actor(['orders.update']), [grant('orders.update', 'ASSIGNED')])).toBeNull();
  });

  it('lets a broader view tier cover its narrower one', () => {
    expect(granterHoldsAll(actor(['customers.view']), [grant('customers.view_basic')])).toBeNull();
  });
});

describe('hiring somebody is not the same as doing their job', () => {
  // A company admin does not work the confirmation queue on purpose. The
  // rule used to read that as "so he may not hire anyone who does", which
  // produced an outcome nobody would defend: he could create another
  // company admin — a strictly more powerful account — but not an agent.
  const admin = actor(['users.create', 'orders.view', 'customers.view']);

  it('lets a company admin confer the confirmation work keys', () => {
    expect(
      granterHoldsAll(admin, [
        grant('confirmation.pull'),
        grant('confirmation.work'),
        grant('confirmation.issues'),
      ])
    ).toBeNull();
  });

  it('still refuses the authority keys in the same role', () => {
    // The exemption is for doing a shift's work, never for power over
    // other people's work.
    expect(granterHoldsAll(admin, [grant('confirmation.supervise')])).not.toBeNull();
  });

  it('does not become a hole for money or settings', () => {
    for (const key of ['finance.cashbox', 'settings.manage', 'users.manage_roles', 'settlement.review']) {
      expect(granterHoldsAll(admin, [grant(key)]), key).not.toBeNull();
    }
  });

  it('refuses the whole grant when one key in it is not allowed', () => {
    // An operational key alongside a forbidden one must not smuggle it in.
    expect(granterHoldsAll(admin, [grant('confirmation.work'), grant('finance.cashbox')])).not.toBeNull();
  });
});
