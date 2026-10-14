import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PASSWORD_MAX, checkPassword } from '@/lib/password-rules';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';

const registerSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(3, 'الاسم يجب أن يكون 3 أحرف على الأقل')
      .max(80, 'الاسم طويل جداً'),
    email: z.string().trim().toLowerCase().email('صيغة البريد الإلكتروني غير صحيحة'),
    password: z.string().max(PASSWORD_MAX).superRefine(checkPassword),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'كلمتا المرور غير متطابقتين',
    path: ['confirmPassword'],
  });

export async function POST(req: Request) {
  try {
    // Rate limiting: 5 registrations per IP per hour (brute-force / spam protection)
    const ip = getClientIp(req);
    const rl = rateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `محاولات كثيرة. أعد المحاولة بعد ${rl.retryAfterSec} ثانية` },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
    }

    // Server-side Zod validation — role/status are NEVER accepted from the client
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json({ error: first?.message || 'بيانات غير صالحة' }, { status: 400 });
    }

    const { fullName, email, password } = parsed.data;

    // Unique email check (DB also enforces a unique constraint)
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: 'هذا البريد الإلكتروني مسجل مسبقاً' },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);

    // Secure bootstrap: environment-designated first Super Admin
    const initialSuperAdminEmail = (process.env.INITIAL_SUPER_ADMIN_EMAIL || '')
      .trim()
      .toLowerCase();
    const isInitialSuperAdmin =
      initialSuperAdminEmail !== '' && email === initialSuperAdminEmail;

    const user = await db.user.create({
      data: {
        email,
        name: fullName,
        passwordHash,
        // Default: no permissions, no company, awaiting admin approval.
        // A client can never reach this endpoint and self-assign a role.
        role: isInitialSuperAdmin ? 'SUPER_ADMIN' : 'PENDING_USER',
        status: isInitialSuperAdmin ? 'ACTIVE' : 'PENDING',
      },
    });

    await logAudit({
      companyId: user.companyId || 'platform',
      userId: user.id,
      action: isInitialSuperAdmin ? 'INITIAL_SUPER_ADMIN_CREATED' : 'USER_REGISTERED',
      entity: 'User',
      entityId: user.id,
      newData: {
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
      },
    });

    /*
     * ── NO SESSION IS CREATED HERE EITHER ──
     *
     * Registering used to sign a token and set the cookie. That is a way
     * into the system that never passes `stepFor`, and now that every
     * account carries a second factor it would be the way around it: a
     * brand-new account is precisely one with `totpEnabledAt` null, which
     * is what `enrol` exists for.
     *
     * The very first SUPER_ADMIN matters most here, not least: the account
     * that can do everything must not be the one account that got in
     * without enrolling.
     */
    return NextResponse.json({
      success: true,
      status: user.status,
      role: user.role,
      signIn: true,
      message: isInitialSuperAdmin
        ? 'تم إنشاء حساب المدير الأعلى بنجاح — سجّل دخولك الآن'
        : 'تم إنشاء حسابك بنجاح وهو الآن بانتظار موافقة المدير',
    });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'هذا البريد الإلكتروني مسجل مسبقاً' }, { status: 409 });
    }
    console.error('Register error:', error);
    return NextResponse.json({ error: 'حدث خطأ داخلي. حاول مرة أخرى' }, { status: 500 });
  }
}
