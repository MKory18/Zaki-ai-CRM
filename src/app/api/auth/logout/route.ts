import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { COOKIE_NAME } from '@/lib/auth';

export async function POST() {
  try {
    // Invalidate the current session server-side via tokenVersion bump
    const { getCurrentUser } = await import('@/lib/auth');
    const user = await getCurrentUser();
    if (user) {
      await db.user.update({
        where: { id: user.id },
        data: { tokenVersion: { increment: 1 } },
      });
      await (await import('@/lib/audit')).logAudit({
        companyId: user.companyId || 'platform',
        userId: user.id,
        action: 'USER_LOGGED_OUT',
        entity: 'User',
        entityId: user.id,
        newData: { email: user.email },
      });
    }
  } catch (e) {
    console.error('Logout error:', e);
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: COOKIE_NAME,
    value: '',
    httpOnly: true,
    path: '/',
    maxAge: 0,
  });
  return response;
}
