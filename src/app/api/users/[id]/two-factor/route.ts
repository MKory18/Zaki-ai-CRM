import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { manageableUserWhere } from '@/lib/manageable-user';
import { mayResetTwoFactor, TWO_FACTOR_RESET_ROLES } from '@/lib/two-factor-reset';

/**
 * DELETE /api/users/:id/two-factor — the owner unlocks a locked-out employee.
 *
 * «زر لـ reset الـ 2FA للموظفين، بس للمالك حصراً».
 *
 * A phone is lost, or replaced, or wiped. The employee still knows their
 * password and still works here, and the authenticator that proves it is
 * gone. Without this the only cure was a developer with a database client,
 * which is not a cure — it is an outage with a person's name on it.
 *
 * WHAT IT DOES NOT DO is let anybody in. It clears the enrolment, so the
 * NEXT login walks that person through enrolling again on their new phone,
 * with a fresh secret and fresh recovery codes. A reset account is not an
 * account without a second factor; it is an account that has to set one up.
 *
 * WHO. The owner alone — `TWO_FACTOR_RESET_ROLES`. Not «anyone who can edit
 * users»: stripping a second factor is the one administrative act that
 * weakens somebody else's account, and the person who may do it should be
 * the smallest possible set.
 *
 * AND NEVER YOUR OWN. An owner resetting themselves proves nothing — the
 * session doing it is already authenticated — but it is exactly the move a
 * stolen session makes to shed the factor it could not pass. Re-enrolling
 * yourself is done from your own security screen, with the current code.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireContext();

    const verdict = mayResetTwoFactor(user, id);
    if (!verdict.ok) {
      return NextResponse.json({ error: verdict.error, code: verdict.code }, { status: verdict.status });
    }

    /**
     * WHOSE PERSON THIS IS — from the one helper, not written again here.
     *
     * `manageableUserWhere` owns that question for every route under
     * /api/users. Its own comment records why: the reasoning was written
     * by hand four times and one of the four was wrong, in a way that told
     * an owner «المستخدم غير موجود» about themselves. A repo guard refuses
     * a hand-written `{ id, companyId }` here, and it caught this route.
     */
    const target = await db.user.findFirst({
      where: manageableUserWhere(user, id),
      select: { id: true, name: true, email: true, role: true, totpEnabledAt: true },
    });
    if (!target) return NextResponse.json({ error: 'الموظف غير موجود' }, { status: 404 });

    if (!target.totpEnabledAt) {
      return NextResponse.json(
        { error: 'لا تحقّق بخطوتين مفعّلاً على هذا الحساب — لا شيء ليُعاد ضبطه', code: 'NOT_ENROLLED' },
        { status: 409 }
      );
    }

    /**
     * The enrolment and its recovery codes go together, in one transaction.
     *
     * Clearing the secret while leaving the recovery codes alive would
     * leave the old phone's escape hatch working for an account whose
     * owner has just been told it was reset.
     */
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: target.id },
        data: { totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null },
      });
      await tx.twoFactorRecoveryCode.deleteMany({ where: { userId: target.id } });
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'TWO_FACTOR_RESET',
      entity: 'User',
      entityId: target.id,
      previousData: { totpEnabledAt: target.totpEnabledAt },
      // The person, the role and who did it — never the secret, which is
      // gone, and was encrypted while it existed.
      newData: { employee: target.name, role: target.role, by: user.name ?? user.id },
    });

    return NextResponse.json({
      ok: true,
      employee: target.name,
      message: `أُعيد ضبط التحقّق بخطوتين لـ${target.name} — سيُطلب منه تسجيله من جديد عند الدخول القادم.`,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
