import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  verifyPassword,
  createSessionToken,
  sessionCookieOptions,
  COOKIE_NAME,
} from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { markLogin } from '@/lib/attendance';
import { UserRole, UserStatus, ROLE_PERMISSIONS } from '@/types/auth';

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

    // Update last login
    // ── One account, one device at a time ──
    //
    // Every session carries the tokenVersion it was signed with, and
    // verifySessionToken refuses a token whose version is no longer the
    // user's. Bumping it here means signing in anywhere signs out
    // everywhere else — the newest sign-in wins.
    //
    // This is what stops one account being shared by three people: not a
    // rule in a handbook, but a session that stops working the moment
    // somebody else uses the same login.
    const refreshed = await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), tokenVersion: { increment: 1 } },
      select: { tokenVersion: true },
    });

    // Signing in IS the fingerprint. There is no button to forget, and
    // since an account opens on one device at a time, it is a mark nobody
    // can press from somebody else's phone. It never blocks the login.
    await markLogin(user.companyId, user.id);

    await logAudit({
      companyId: user.companyId || 'platform',
      userId: user.id,
      action: 'USER_LOGGED_IN',
      entity: 'User',
      entityId: user.id,
      newData: { email: user.email, role: user.role, status: user.status, ip },
    });

    const role = user.role as UserRole;
    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      role,
      status,
      companyId: user.companyId,
      tv: refreshed.tokenVersion,
      remember: !!remember,
    });

    const response = NextResponse.json({
      success: true,
      status,
      role,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role,
        status,
        companyId: user.companyId,
        companyName: user.company?.name,
        commissionRate: user.commissionRate,
        permissions: ROLE_PERMISSIONS[role] || [],
      },
    });

    response.cookies.set({
      name: COOKIE_NAME,
      value: token,
      ...sessionCookieOptions(!!remember),
    });

    return response;
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'حدث خطأ داخلي. حاول مرة أخرى' }, { status: 500 });
  }
}
