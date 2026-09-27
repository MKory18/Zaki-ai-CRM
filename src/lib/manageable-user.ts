import type { SessionUser } from '@/types/auth';

/**
 * WHICH USER MAY THIS ADMIN SEE — asked once, answered once.
 *
 * «الموظف غير موجود» has been reported four times, each time on a different
 * screen, each time fixed on that screen. It kept coming back because there
 * was no one place to fix: four routes under `/api/users/:id` each wrote
 * their own answer to the same question, by hand, and they did not agree.
 *
 *   the page          `findUnique` plus fifteen lines of inline rules
 *   the profile       `OR: [{ companyId }, { companyId: null }]`
 *   the permissions   its own reading of a null-company target
 *   the geo access    `{ id, companyId }` — and this is the whole bug
 *
 * That last one cannot match a user whose `companyId` is null, and the
 * owner's own SUPER_ADMIN account is exactly such a user. So the countries
 * block on their page answered «المستخدم غير موجود» about the person
 * looking at it, and it will do so again on the fifth route somebody writes
 * from the same instinct.
 *
 * THE RULE, ONCE, IN WORDS.
 *
 *   A platform SUPER_ADMIN — no company of their own — manages anybody.
 *
 *   A company admin manages their own company's users, and SEES
 *   platform-level ones (`companyId: null`), because an unplaced account is
 *   what a new signup is before somebody adopts it, and a screen that
 *   cannot see it cannot adopt it.
 *
 *   Nobody manages a user of another company. Not «403», but «not found»:
 *   confirming that an id exists elsewhere is itself an answer.
 *
 * WHAT THIS IS NOT. It is not permission — `requirePermission` still
 * decides whether somebody may edit users at all, and the privilege
 * guards around SUPER_ADMIN targets still live where the action is. This
 * answers one question: is this row in front of this person.
 */

/** The where-clause that finds a user this admin is allowed to look at. */
export function manageableUserWhere(admin: Pick<SessionUser, 'role' | 'companyId'>, id: string) {
  const isPlatformSuper = admin.role === 'SUPER_ADMIN' && !admin.companyId;
  if (isPlatformSuper) return { id };

  // Their own company's people, plus the unplaced ones waiting to be
  // adopted. A company admin with no company of their own is a broken
  // session, and it resolves to nobody rather than to everybody.
  return admin.companyId
    ? { id, OR: [{ companyId: admin.companyId }, { companyId: null }] }
    : { id, companyId: '__none__' };
}

/**
 * THE SAME RULE, FOR A LIST.
 *
 * The users list wrote it out by hand too — a fifth copy, found by the
 * guard rather than by reading. And its version had the same latent fault
 * in the other direction: for a platform admin whose `companyId` is
 * undefined, `OR: [{ companyId }, { companyId: null }]` leans on Prisma
 * dropping an undefined key, which is a rule about the query builder
 * standing in for a rule about tenancy.
 */
export function manageableUsersWhere(admin: Pick<SessionUser, 'role' | 'companyId'>) {
  const isPlatformSuper = admin.role === 'SUPER_ADMIN' && !admin.companyId;
  if (isPlatformSuper) return {};
  return admin.companyId
    ? { OR: [{ companyId: admin.companyId }, { companyId: null }] }
    : { companyId: '__none__' };
}

/**
 * MAY THIS ADMIN ACT ON THIS USER, as opposed to merely see them?
 *
 * Seeing an unplaced account is how it gets adopted. Acting on one —
 * resetting its password, deleting it, forcing it out — is a platform
 * matter, because such an account belongs to no company yet and a company
 * admin reaching into it is reaching outside their tenancy.
 *
 * `adopting` is the one exception, and it is what adoption IS: assigning a
 * role to a pending account is the act that places it in a company.
 */
export function mayActOnUser(
  admin: Pick<SessionUser, 'role' | 'companyId'>,
  target: { companyId: string | null },
  opts: { adopting?: boolean } = {}
): boolean {
  if (admin.role === 'SUPER_ADMIN' && !admin.companyId) return true;
  if (!admin.companyId) return false;
  if (target.companyId === admin.companyId) return true;
  return target.companyId === null && opts.adopting === true;
}

/** The one sentence every one of these routes answers a stranger with. */
export const USER_NOT_FOUND = 'المستخدم غير موجود';
