import type { SessionUser } from '@/types/auth';

/**
 * WHO MAY STRIP SOMEBODY ELSE'S SECOND FACTOR.
 *
 * «زر لـ reset الـ 2FA للموظفين، بس للمالك حصراً» — and the «حصراً» is the
 * whole rule, not decoration.
 *
 * Every other administrative act in this system is granted by permission,
 * because permissions are how a growing company delegates. This one is
 * granted by ROLE, and deliberately: a permission can be handed to a new
 * manager by another manager, and the set of people who may weaken an
 * account's login would widen without anybody deciding that it should.
 *
 * Pure, so the rule can be read and tested without a request.
 */

/** The owner, and nobody else. */
export const TWO_FACTOR_RESET_ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN'] as const;

export type ResetVerdict =
  | { ok: true }
  | { ok: false; status: number; code: string; error: string };

export function mayResetTwoFactor(user: SessionUser, targetUserId: string): ResetVerdict {
  if (!(TWO_FACTOR_RESET_ROLES as readonly string[]).includes(user.role)) {
    return {
      ok: false,
      status: 403,
      code: 'OWNER_ONLY',
      error: 'إعادة ضبط التحقّق بخطوتين للمالك وحده.',
    };
  }

  /**
   * AND NEVER YOUR OWN.
   *
   * An owner resetting themselves proves nothing — the session doing it is
   * already past the factor — but it is exactly the move a stolen session
   * makes to shed the one thing it could not pass. Re-enrolling your own
   * phone happens on your own security screen, with the current code.
   */
  if (user.id === targetUserId) {
    return {
      ok: false,
      status: 403,
      code: 'NOT_YOURSELF',
      error: 'لا تُعيد ضبط تحقّقك أنت من هنا — أعِد تسجيله من شاشة أمانك بالرمز الحالي.',
    };
  }

  return { ok: true };
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * AND WHO MAY SET SOMEBODY ELSE'S PASSWORD.
 *
 * The same two roles, for the same reason, and that is why it lives here
 * rather than in a file of its own: both acts hand somebody a way into an
 * account that is not theirs. `users.edit` is not enough — it is held by
 * MANAGER, and a manager who may edit a profile must not be able to set
 * the password on the account above them.
 *
 * NEVER YOUR OWN, either. An owner changing their own password does it on
 * their own security screen, where the CURRENT one is asked for first;
 * this door never asks for it, because it is for the person who has lost
 * theirs. A stolen session must not be able to lock the real owner out.
 */
export function maySetPassword(user: SessionUser, targetUserId: string): ResetVerdict {
  if (!(TWO_FACTOR_RESET_ROLES as readonly string[]).includes(user.role)) {
    return {
      ok: false,
      status: 403,
      code: 'OWNER_ONLY',
      error: 'تغيير كلمة سرّ موظّف للمالك وحده.',
    };
  }
  if (user.id === targetUserId) {
    return {
      ok: false,
      status: 403,
      code: 'NOT_YOURSELF',
      error: 'غيّر كلمة سرّك أنت من شاشة أمانك — هناك تُسألُ عن الحاليّة أوّلاً.',
    };
  }
  return { ok: true };
}

/**
 * A PASSWORD NOBODY CHOSE, FOR WHEN THE OWNER WANTS ONE GENERATED.
 *
 * Satisfies `PASSWORD_RULES` by construction rather than by luck: one
 * character from each required class, then randomness, then shuffled so
 * the shape is not predictable. The caller shows it once and never stores
 * it anywhere but the hash.
 */
export function generatePassword(randomInt: (max: number) => number): string {
  const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const LOWER = 'abcdefghijkmnopqrstuvwxyz';
  const DIGIT = '23456789';
  const ALL = UPPER + LOWER + DIGIT;
  const pick = (set: string) => set[randomInt(set.length)];
  const chars = [pick(UPPER), pick(LOWER), pick(DIGIT)];
  while (chars.length < 14) chars.push(pick(ALL));
  // Fisher-Yates, so the first three positions are not always the classes.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
