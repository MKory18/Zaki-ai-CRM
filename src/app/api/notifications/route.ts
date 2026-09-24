import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { ContextError, requireContext, seesAllCountries } from '@/lib/geo-context';
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
 * have selected, or about no store.
 *
 * ROWS FROM BEFORE STAGE 17 are history, and are treated as history. They
 * have no recipient and no store, and a single read flag every reader
 * shared. So they are never counted, never marked, and shown already read;
 * and only to someone who can see every store AND holds the permission
 * that kind of news belongs to — a store-limited supervisor must not read
 * another store's closing problems just because the old row carried no
 * store. Deleting them would lose the only record of what was announced.
 */

/** Rows addressed to this person, about the selected store or about none. The only rows anyone may count or mark. */
function mineIn(user: SessionUser, companyId: string, storeId: string): Prisma.NotificationWhereInput {
  return { companyId, userId: user.id, OR: [{ storeId }, { storeId: null }] };
}

/**
 * Which pre-stage-17 shared rows this person may still read, by type.
 *
 * The permission is the one the same news is sent by today, so the old row
 * and its modern counterpart reach the same kind of person.
 */
const LEGACY_TYPE_PERMISSION: Record<string, string> = {
  ORDER_NEW: 'confirmation.supervise',
  SYSTEM_ALERT: 'confirmation.supervise',
  POSTPONED_DUE: 'confirmation.supervise',
  FOLLOW_UP: 'confirmation.supervise',
  HIGH_REJECTION: 'confirmation.supervise',
  PERFORMANCE: 'confirmation.supervise',
  CLOSING_DUE: 'finance.cashbox',
  RETURNS_NOT_RECEIVED: 'ops.returns',
  LOW_STOCK: 'inventory.adjust',
};

function legacyFor(user: SessionUser, companyId: string): Prisma.NotificationWhereInput | null {
  // A shared row carries no store, so it could be about any of them.
  if (!seesAllCountries(user)) return null;
  const types = Object.entries(LEGACY_TYPE_PERMISSION)
    .filter(([, permission]) => can(user, permission))
    .map(([type]) => type);
  return types.length ? { companyId, userId: null, storeId: null, type: { in: types } } : null;
}

/**
 * The context, or null when no store is selected.
 *
 * The bell polls in the background. A missing store — cleared in another
 * tab through the shared cookie — is "nothing to show", not an error: the
 * client answers that error by sending the whole tab to the store picker,
 * which a poll must never do.
 */
async function contextOrNull() {
  try {
    return await requireContext();
  } catch (e) {
    if (e instanceof ContextError) return null;
    throw e;
  }
}

export async function GET(req: Request) {
  try {
    const ctx = await contextOrNull();
    const { searchParams } = new URL(req.url);
    const countOnly = searchParams.get('countOnly') === '1';
    if (!ctx) return NextResponse.json(countOnly ? { unreadCount: 0 } : { notifications: [], unreadCount: 0 });

    const { companyId, storeId, user } = ctx;
    const mine = mineIn(user, companyId, storeId);

    // The unread count is always the person's OWN rows, the same query for
    // the poll and the panel — counting the 50 listed rows gave a smaller
    // number than the badge, and opening the panel overwrote it.
    const unread = () => db.notification.count({ where: { ...mine, isRead: false } });
    if (countOnly) return NextResponse.json({ unreadCount: await unread() });

    const legacy = legacyFor(user, companyId);
    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({
        where: legacy ? { OR: [mine, legacy] } : mine,
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      unread(),
    ]);

    // History reads as read: its one shared flag was never this person's.
    const shown = notifications.map((n) => (n.userId === null ? { ...n, isRead: true } : n));
    return NextResponse.json({ notifications: shown, unreadCount });
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
    // Only the person's own rows: history is read-only, and marking a shared
    // row read marked it read for everybody — the bug this stage removes.
    const where = mineIn(user, companyId, storeId);

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
