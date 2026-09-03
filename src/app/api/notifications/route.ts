import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';

export async function GET() {
  try {
    const { companyId, user } = await requireCompanyTenant();

    const notifications = await db.notification.findMany({
      where: {
        companyId,
        OR: [{ userId: null }, { userId: user.id }],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const unreadCount = notifications.filter((n) => !n.isRead).length;

    return NextResponse.json({ notifications, unreadCount });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { companyId, user } = await requireCompanyTenant();
    const body = await req.json();
    const { notificationId, markAllRead } = body;

    if (markAllRead) {
      await db.notification.updateMany({
        where: {
          companyId,
          OR: [{ userId: null }, { userId: user.id }],
        },
        data: { isRead: true },
      });
      return NextResponse.json({ success: true });
    }

    if (notificationId) {
      await db.notification.update({
        where: { id: notificationId },
        data: { isRead: true },
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
