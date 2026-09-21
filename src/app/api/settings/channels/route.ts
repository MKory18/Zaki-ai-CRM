import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { can, requirePermission } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';
import { apiErrorResponse } from '@/lib/api-error';
import { zodMessage } from '@/lib/zod-message';

/**
 * ORDER CHANNELS — where the shop's orders come from.
 *
 *   GET    /api/settings/channels          anyone who may create an order
 *   POST   /api/settings/channels          settings.edit
 *
 * Reading is deliberately open to order-takers: every intake form has to
 * offer the list, and a channel is a name, not a secret. Changing the list
 * is a settings decision, because the numbers are counted per channel and
 * renaming one silently moves history between rows.
 */

export const CHANNEL_KINDS = [
  'LANDING_PAGE', 'FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'WHATSAPP',
  'TELEGRAM', 'PHONE', 'SHEET', 'WEBSITE', 'OTHER',
] as const;

export const CHANNEL_KIND_AR: Record<string, string> = {
  LANDING_PAGE: 'صفحة هبوط',
  FACEBOOK: 'فيسبوك',
  INSTAGRAM: 'إنستغرام',
  TIKTOK: 'تيكتوك',
  WHATSAPP: 'واتساب',
  TELEGRAM: 'تلجرام',
  PHONE: 'هاتف',
  SHEET: 'شيت',
  WEBSITE: 'الموقع',
  OTHER: 'أخرى',
};

const createSchema = z.object({
  name: z.string().trim().min(2, 'اسم القناة حرفان على الأقل').max(60),
  kind: z.enum(CHANNEL_KINDS).default('OTHER'),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export async function GET() {
  try {
    const { user, companyId } = await requireCompanyTenant();
    if (!can(user, 'orders.create') && !can(user, 'orders.view') && !can(user, 'settings.view')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const channels = await db.orderChannel.findMany({
      where: { companyId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { orders: true } } },
    });

    return NextResponse.json({
      channels: channels.map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        isActive: c.isActive,
        sortOrder: c.sortOrder,
        orders: c._count.orders,
      })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('settings.edit');

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }

    const existing = await db.orderChannel.findFirst({
      where: { companyId, name: parsed.data.name },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ error: 'توجد قناة بنفس الاسم' }, { status: 409 });
    }

    const channel = await db.orderChannel.create({
      data: { companyId, ...parsed.data },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'ORDER_CHANNEL_CREATED',
      entity: 'OrderChannel',
      entityId: channel.id,
      newData: { name: channel.name, kind: channel.kind },
    });

    return NextResponse.json({ channel }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
