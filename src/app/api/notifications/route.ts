import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const { companyId, user } = await requireCompanyTenant();

    // Lightweight polling mode: ?countOnly=1 returns only the unread count
    // (single COUNT query, no rows fetched).
    const { searchParams } = new URL(req.url);
    if (searchParams.get('countOnly') === '1') {
      const unreadCount = await db.notification.count({
        where: {
          companyId,
          isRead: false,
          OR: [{ userId: null }, { userId: user.id }],
        },
      });
      return NextResponse.json({ unreadCount });
    }

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
    return apiErrorResponse(error);
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
      // Phase S: tenant-scoped update — notification must belong to this company
      // and be visible to this user (or broadcast)
      const updated = await db.notification.updateMany({
        where: {
          id: notificationId,
          companyId,
          OR: [{ userId: null }, { userId: user.id }],
        },
        data: { isRead: true },
      });
      if (updated.count === 0) {
        return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
