import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { maskPixelId, TRACKING_PLATFORMS, TRACKING_SCOPES } from '@/lib/tracking/tracking-types';
import { pixelIdHint, validateTrackingPixelId } from '@/lib/tracking/tracking-validation';

/**
 * PATCH  /api/settings/tracking-pixels/[id] — update / enable / disable
 * DELETE /api/settings/tracking-pixels/[id] — delete
 *
 * Company-scoped (findFirst { id, companyId }) → cross-tenant access is a
 * 404. companyId / platform changes from the body are rejected outright;
 * platform is immutable to prevent enum spoofing after creation.
 */

const updateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  pixelId: z.string().trim().min(4).max(64).optional(),
  scope: z.enum(TRACKING_SCOPES).optional(),
  enabled: z.boolean().optional(),
  platform: z.enum(TRACKING_PLATFORMS).optional(), // accepted but must match (immutable)
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('settings.edit');

    const pixel = await db.trackingPixel.findFirst({ where: { id, companyId } });
    if (!pixel) return NextResponse.json({ error: 'Pixel not found' }, { status: 404 });

    const parsed = updateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' },
        { status: 400 }
      );
    }
    const { name, pixelId: rawPixelId, scope, enabled, platform } = parsed.data;

    // platform spoofing guard: the platform of an existing pixel is immutable
    if (platform !== undefined && platform !== pixel.platform) {
      return NextResponse.json({ error: 'لا يمكن تغيير منصة البكسل — احذفه وأضف بكسل جديد' }, { status: 400 });
    }
    // companyId spoofing guard: never accepted from the body (schema has no such field)

    let nextPixelId: string | undefined;
    if (rawPixelId !== undefined && rawPixelId !== pixel.pixelId) {
      const validated = validateTrackingPixelId(pixel.platform, rawPixelId);
      if (!validated) {
        return NextResponse.json({ error: pixelIdHint(pixel.platform) }, { status: 400 });
      }
      const clash = await db.trackingPixel.findFirst({
        where: { companyId, platform: pixel.platform, pixelId: validated, id: { not: id } },
      });
      if (clash) {
        return NextResponse.json({ error: 'هذا البكسل مسجل مسبقًا لنفس المنصة' }, { status: 409 });
      }
      nextPixelId = validated;
    }

    const updated = await db.trackingPixel.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(nextPixelId !== undefined ? { pixelId: nextPixelId } : {}),
        ...(scope !== undefined ? { scope } : {}),
        ...(enabled !== undefined ? { enabled } : {}),
      },
    });

    const toggled = enabled !== undefined && enabled !== pixel.enabled;
    await logAudit({
      companyId,
      userId: user.id,
      action: toggled
        ? enabled ? 'TRACKING_PIXEL_ENABLED' : 'TRACKING_PIXEL_DISABLED'
        : 'TRACKING_PIXEL_UPDATED',
      entity: 'TrackingPixel',
      entityId: id,
      previousData: { name: pixel.name, scope: pixel.scope, enabled: pixel.enabled },
      newData: {
        name: updated.name,
        scope: updated.scope,
        enabled: updated.enabled,
        pixelId: maskPixelId(updated.pixelId),
        by: user.name,
      },
    });

    return NextResponse.json({ success: true, pixel: updated });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('settings.edit');

    const pixel = await db.trackingPixel.findFirst({ where: { id, companyId } });
    if (!pixel) return NextResponse.json({ error: 'Pixel not found' }, { status: 404 });

    await db.trackingPixel.delete({ where: { id } });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'TRACKING_PIXEL_DELETED',
      entity: 'TrackingPixel',
      entityId: id,
      newData: { platform: pixel.platform, name: pixel.name, pixelId: maskPixelId(pixel.pixelId), by: user.name },
    });

    return NextResponse.json({ success: true, deleted: true });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
