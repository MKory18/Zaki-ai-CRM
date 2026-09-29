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
