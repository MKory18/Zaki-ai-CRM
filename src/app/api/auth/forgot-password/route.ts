import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimit(`forgot:${ip}`, 5, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ error: `محاولات كثيرة. أعد المحاولة بعد ${rl.retryAfterSec} ثانية` }, { status: 429 });
    }

    const { email } = await req.json().catch(() => ({}));
    if (!email) {
      return NextResponse.json({ error: 'البريد الإلكتروني مطلوب' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { email: String(email).toLowerCase().trim() },
    });

    // Always return success to avoid account enumeration
    if (!user) {
      return NextResponse.json({
        success: true,
        message: 'إذا كان البريد مسجلاً لدينا فستصلك رسالة إعادة التعيين',
      });
    }

    const token = crypto.randomBytes(32).toString('hex');
    await db.user.update({
      where: { id: user.id },
      data: {
        resetToken: token,
        // Token expires in 1 hour
        resetTokenExpires: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    // In production: send via email provider. Here: surfaced to admin/dev safely.
    console.log(`[PASSWORD RESET] Token for ${user.email}: ${token}`);

    await (await import('@/lib/audit')).logAudit({
      companyId: user.companyId || 'platform',
      userId: user.id,
      action: 'PASSWORD_RESET_REQUESTED',
      entity: 'User',
      entityId: user.id,
      newData: { email: user.email, ip, expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
    });

    return NextResponse.json({
      success: true,
      message: 'إذا كان البريد مسجلاً لدينا فستصلك رسالة إعادة التعيين',
      // Dev-mode only convenience (never exposed when NODE_ENV=production)
      devToken: process.env.NODE_ENV === 'production' ? undefined : token,
    });
  } catch (e: any) {
    console.error('Forgot password error:', e);
    return NextResponse.json({ error: 'حدث خطأ داخلي' }, { status: 500 });
  }
}
