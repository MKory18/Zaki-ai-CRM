import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';
import { apiErrorResponse } from '@/lib/api-error';
import { CHANNEL_KINDS } from '../route';
import { zodMessage } from '@/lib/zod-message';

/**
 * PATCH  /api/settings/channels/:id   rename, re-classify, retire
 * DELETE /api/settings/channels/:id   only while nothing came through it
 *
 * A channel that has orders is never deleted — the orders counted under it
 * would lose where they came from. It is deactivated instead: gone from the
 * lists people pick from, still there in the numbers.
 */

const patchSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    kind: z.enum(CHANNEL_KINDS),
    isActive: z.boolean(),
    sortOrder: z.coerce.number().int().min(0).max(999),
  })
  .partial();

async function ours(id: string, companyId: string) {
  return db.orderChannel.findFirst({ where: { id, companyId } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('settings.edit');

    const channel = await ours(id, companyId);
    if (!channel) return NextResponse.json({ error: 'القناة غير موجودة' }, { status: 404 });

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }

    if (parsed.data.name && parsed.data.name !== channel.name) {
      const clash = await db.orderChannel.findFirst({
        where: { companyId, name: parsed.data.name, id: { not: id } },
        select: { id: true },
      });
      if (clash) return NextResponse.json({ error: 'توجد قناة بنفس الاسم' }, { status: 409 });
    }

    const updated = await db.orderChannel.update({ where: { id }, data: parsed.data });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'ORDER_CHANNEL_UPDATED',
      entity: 'OrderChannel',
      entityId: id,
      previousData: { name: channel.name, kind: channel.kind, isActive: channel.isActive },
      newData: { name: updated.name, kind: updated.kind, isActive: updated.isActive },
    });

    return NextResponse.json({ channel: updated });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('settings.edit');

    const channel = await ours(id, companyId);
    if (!channel) return NextResponse.json({ error: 'القناة غير موجودة' }, { status: 404 });

    const used = await db.order.count({ where: { channelId: id } });
    if (used > 0) {
      return NextResponse.json(
        {
          error: `هذه القناة عليها ${used} طلب — أوقفها بدل حذفها كي تبقى في الإحصاءات`,
          code: 'CHANNEL_IN_USE',
          orders: used,
        },
        { status: 409 }
      );
    }

    await db.orderChannel.delete({ where: { id } });
    await logAudit({
      companyId,
      userId: user.id,
      action: 'ORDER_CHANNEL_DELETED',
      entity: 'OrderChannel',
      entityId: id,
      previousData: { name: channel.name, kind: channel.kind },
      newData: null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
