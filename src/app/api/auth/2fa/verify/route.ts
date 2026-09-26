import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readChallenge } from '@/lib/two-factor-challenge';
import { TwoFactorRefused, checkSecondFactor } from '@/lib/two-factor';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { issueSession } from '@/lib/sign-in';
import { logAudit } from '@/lib/audit';
import type { UserStatus } from '@/types/auth';

/**
 * POST /api/auth/2fa/verify — the second factor, and then the session.
 *
 * SIX DIGITS ARE A MILLION GUESSES, AND A MILLION IS NOT MANY. A code lives
 * ninety seconds across the accepted window, so an unthrottled endpoint is a
 * few hours of traffic away from being opened by a script. The limit is per
 * user AND per address: per address alone lets a botnet spread the guessing,
 * and per user alone lets one address grind through every account.
 *
 * The session is issued by `issueSession`, the same function the plain login
 * uses — including the `tokenVersion` bump that makes an account work on one
 * device at a time. A second copy of that here is where the bump would one
 * day go missing.
 */
export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const { challenge, code } = await req.json().catch(() => ({}));

    const ticket = await readChallenge(challenge, 'verify');
    if (!ticket) {
      return NextResponse.json({ error: 'انتهت صلاحية الطلب — سجّل الدخول من جديد' }, { status: 401 });
    }

    const rlUser = rateLimit(`2fa:verify:user:${ticket.userId}`, 6, 5 * 60 * 1000);
    const rlIp = rateLimit(`2fa:verify:ip:${ip}`, 30, 5 * 60 * 1000);
    if (!rlUser.allowed || !rlIp.allowed) {
      return NextResponse.json(
        { error: `محاولات كثيرة. أعد المحاولة بعد ${Math.max(rlUser.retryAfterSec, rlIp.retryAfterSec)} ثانية` },
        { status: 429 }
      );
    }

    if (typeof code !== 'string' || code.trim() === '') {
      return NextResponse.json({ error: 'الرمز مطلوب' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { id: ticket.userId },
      include: { company: true },
    });
    if (!user) return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 });

    // Re-checked here, not trusted from the login: a ticket is ten minutes
    // long, and an account suspended inside them must not still open.
    const status = user.status as UserStatus;
    if (status === 'SUSPENDED' || status === 'DISABLED') {
      return NextResponse.json({ error: 'الحساب موقوف', status }, { status: 403 });
    }

    let result: { usedRecovery: boolean; recoveryLeft: number };
    try {
      result = await db.$transaction((tx) => checkSecondFactor(tx, { userId: ticket.userId, code }));
    } catch (e: unknown) {
      if (e instanceof TwoFactorRefused) {
        await logAudit({
          companyId: user.companyId || 'platform',
          userId: user.id,
          action: 'TWO_FACTOR_FAILED',
          entity: 'User',
          entityId: user.id,
          newData: { ip, reason: e.code },
        });
        return NextResponse.json({ error: e.message, code: e.code }, { status: 401 });
      }
      throw e;
    }

    const response = await issueSession({
      user,
      remember: ticket.remember,
      ip,
      factor: result.usedRecovery ? 'password+recovery' : 'password+totp',
    });

    if (result.usedRecovery) {
      // Spending a recovery code is a fact worth its own row: it means the
      // authenticator was not to hand, and a run of them is a story.
      await logAudit({
        companyId: user.companyId || 'platform',
        userId: user.id,
        action: 'TWO_FACTOR_RECOVERY_USED',
        entity: 'User',
        entityId: user.id,
        newData: { ip, remaining: result.recoveryLeft },
      });
    }

    return response;
  } catch {
    return NextResponse.json({ error: 'حدث خطأ داخلي' }, { status: 500 });
  }
}
