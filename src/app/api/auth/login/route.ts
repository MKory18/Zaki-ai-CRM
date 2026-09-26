import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { UserStatus } from '@/types/auth';
import { issueSession } from '@/lib/sign-in';
import { issueChallenge } from '@/lib/two-factor-challenge';
import { stepFor } from '@/lib/two-factor';

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const { email: rawEmail, password, remember } = await req.json().catch(() => ({}));

    if (!rawEmail || !password) {
      return NextResponse.json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان' }, { status: 400 });
    }

    const email = String(rawEmail).toLowerCase().trim();

    // Brute-force protection: 8 attempts / 5 min per IP+email, 20 per IP
    const rlUser = rateLimit(`login:user:${ip}:${email}`, 8, 5 * 60 * 1000);
    const rlIp = rateLimit(`login:ip:${ip}`, 20, 5 * 60 * 1000);
    if (!rlUser.allowed || !rlIp.allowed) {
      return NextResponse.json(
        { error: `محاولات دخول كثيرة. أعد المحاولة بعد ${Math.max(rlUser.retryAfterSec, rlIp.retryAfterSec)} ثانية` },
        { status: 429 }
      );
    }

    const user = await db.user.findUnique({
      where: { email },
      include: { company: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' }, { status: 401 });
    }

    const isMatch = await verifyPassword(password, user.passwordHash);
    if (!isMatch) {
      return NextResponse.json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' }, { status: 401 });
    }

    const status = user.status as UserStatus;

    if (status === 'SUSPENDED' || status === 'DISABLED') {
      return NextResponse.json(
        {
          error:
            status === 'SUSPENDED'
              ? 'تم إيقاف حسابك مؤقتاً. تواصل مع المدير'
              : 'تم تعطيل حسابك. تواصل مع المدير',
          status,
        },
        { status: 403 }
      );
    }

    /**
     * THE PASSWORD IS THE FIRST FACTOR. FOR FIVE ROLES IT IS NO LONGER THE LAST.
     *
     * Nothing is issued and NOTHING IS CHANGED here — no session, and in
     * particular no `tokenVersion` bump. Bumping it now would mean a stolen
     * password alone could sign an owner out of the device they are working
     * on, repeatedly, without ever getting in.
     *
     * A protected role that has not enrolled yet is not turned away either:
     * on the morning this ships nobody is enrolled, and an owner locked out
     * of their own business is how a second factor gets switched off for
     * everyone. They get an enrolment challenge instead, which grants
     * nothing but the two endpoints that set it up.
     */
    const step = stepFor({ role: user.role, totpEnabledAt: user.totpEnabledAt });
    if (step !== 'none') {
      const challenge = await issueChallenge({ userId: user.id, purpose: step, remember: !!remember });
      return NextResponse.json({
        twoFactor: step,
        challenge,
        email: user.email,
      });
    }

    return issueSession({ user, remember: !!remember, ip, factor: 'password' });
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'حدث خطأ داخلي. حاول مرة أخرى' }, { status: 500 });
  }
}
