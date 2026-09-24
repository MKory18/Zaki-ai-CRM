import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PASSWORD_MAX, checkPassword } from '@/lib/password-rules';
import { db } from '@/lib/db';
import { hashPassword, sessionCookieOptions, COOKIE_NAME, createSessionToken } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { UserRole, UserStatus, ROLE_PERMISSIONS } from '@/types/auth';
import { zodMessage } from '@/lib/zod-message';

const resetSchema = z
  .object({
    token: z.string().min(10),
    password: z.string().max(PASSWORD_MAX).superRefine(checkPassword),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'كلمتا المرور غير متطابقتين',
    path: ['confirmPassword'],
  });

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimit(`reset:${ip}`, 8, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ error: `محاولات كثيرة. أعد المحاولة بعد ${rl.retryAfterSec} ثانية` }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    const parsed = resetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: zodMessage(parsed.error) },
        { status: 400 }
      );
    }

    const { token, password } = parsed.data;

    const user = await db.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpires: { gt: new Date() },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'رابط إعادة التعيين غير صالح أو منتهي الصلاحية' },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(password);

    // Bump tokenVersion: invalidates every existing session for this user
    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpires: null,
        tokenVersion: { increment: 1 },
      },
    });

    // Auto-login after successful reset
    const sessionToken = await createSessionToken({
      userId: updated.id,
      email: updated.email,
      role: updated.role as UserRole,
      status: updated.status as UserStatus,
      companyId: updated.companyId,
      tv: updated.tokenVersion,
    });

    await (await import('@/lib/audit')).logAudit({
      companyId: updated.companyId || 'platform',
      userId: updated.id,
      action: 'PASSWORD_RESET_COMPLETED',
      entity: 'User',
      entityId: updated.id,
      newData: { email: updated.email, allSessionsInvalidated: true },
    });

    const response = NextResponse.json({ success: true, status: updated.status });
    response.cookies.set({
      name: COOKIE_NAME,
      value: sessionToken,
      ...sessionCookieOptions(false),
    });
    return response;
  } catch (e: any) {
    console.error('Reset password error:', e);
    return NextResponse.json({ error: 'حدث خطأ داخلي' }, { status: 500 });
  }
}
