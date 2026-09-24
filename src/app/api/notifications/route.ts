import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { can } from '@/lib/authorization';
import type { SessionUser } from '@/types/auth';

/**
 * THE BELL'S ENDPOINT — your own notifications, in the store you are in.
 *
 *   GET   /api/notifications              the latest 50 + the unread count
 *   GET   /api/notifications?countOnly=1  the unread count alone (polling)
 *   PATCH /api/notifications              mark one, or all, as read
 *
 * What you see is exactly what you may mark, and both are one clause
 * (visibleTo). It used to be "every row with no recipient, plus mine" for
 * every role: a moderator read every confirmation in the company, and
 * pressing "mark all read" marked the company's news read for everybody.
 *
 * Now a row is yours if it is addressed to you and is about the store you
 * have selected, or about no store. Rows written before stage 17 have no
 * recipient and no store; they were meant for managers ("null for all
 * managers/admins"), so only confirmation.supervise holders still see —
 * and may mark — them. Nobody else ever did need them, and deleting them
 * would lose the only record of what was announced.
 */

/** The one definition of "notifications this person may see and mark". */
function visibleTo(user: SessionUser, companyId: string, storeId: string): Prisma.NotificationWhereInput {
  const mine: Prisma.NotificationWhereInput = { userId: user.id, OR: [{ storeId }, { storeId: null }] };
  const legacy: Prisma.NotificationWhereInput = { userId: null, storeId: null };
  return {
    companyId,
    OR: can(user, 'confirmation.supervise') ? [mine, legacy] : [mine],
  };
}

export async function GET(req: Request) {
  try {
    const { companyId, storeId, user } = await requireContext();
    const where = visibleTo(user, companyId, storeId);

    // Lightweight polling mode: ?countOnly=1 returns only the unread count
    // (single COUNT query, no rows fetched).
    const { searchParams } = new URL(req.url);
    if (searchParams.get('countOnly') === '1') {
      const unreadCount = await db.notification.count({ where: { ...where, isRead: false } });
      return NextResponse.json({ unreadCount });
    }

    // The count is its own query, the same one the poll runs: counting the
    // 50 rows listed gave a smaller number than the badge whenever there
    // were more, and opening the panel overwrote the badge with it.
    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 }),
      db.notification.count({ where: { ...where, isRead: false } }),
    ]);

    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

const patchSchema = z.union([
  z.object({ markAllRead: z.literal(true) }).strict(),
  z.object({ notificationId: z.string().trim().min(1).max(64) }).strict(),
]);

export async function PATCH(req: Request) {
  try {
    const { companyId, storeId, user } = await requireContext();
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'طلب غير صالح: حدّد إشعاراً واحداً أو «تعليم الكل كمقروء»' }, { status: 400 });
    }
    const where = visibleTo(user, companyId, storeId);

    if ('markAllRead' in parsed.data) {
      await db.notification.updateMany({ where: { ...where, isRead: false }, data: { isRead: true } });
      return NextResponse.json({ success: true });
    }

    // Same clause as the list: a row that is not yours reads as not found,
    // whoever's it is.
    const updated = await db.notification.updateMany({
      where: { AND: [where, { id: parsed.data.notificationId }] },
      data: { isRead: true },
    });
    if (updated.count === 0) {
      return NextResponse.json({ error: 'الإشعار غير موجود' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
