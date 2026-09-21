import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { maskPixelId, TRACKING_PLATFORMS, TRACKING_SCOPES } from '@/lib/tracking/tracking-types';
import { pixelIdHint, validateTrackingPixelId } from '@/lib/tracking/tracking-validation';
import { zodMessage } from '@/lib/zod-message';

/**
 * Global tracking pixels — settings-scoped resource.
 *   GET  /api/settings/tracking-pixels   (settings.view)
 *   POST /api/settings/tracking-pixels   (settings.edit)
 *
 * Security: companyId is ALWAYS derived from the session (never from the
 * body); platform/scope are allowlisted enums; the Pixel ID is validated
 * per platform server-side and fails closed. The stored value is a bare
 * ID — no script/HTML/tokens can ever be stored here.
 */

const createSchema = z.object({
  platform: z.enum(TRACKING_PLATFORMS),
  name: z.string().trim().min(2).max(80),
  pixelId: z.string().trim().min(4).max(64),
  scope: z.enum(TRACKING_SCOPES).default('GLOBAL'),
  enabled: z.boolean().default(true),
});

export async function GET() {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('settings.view');

    const pixels = await db.trackingPixel.findMany({
      where: { companyId },
      orderBy: [{ platform: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, platform: true, name: true, pixelId: true, enabled: true, scope: true, createdAt: true },
    });
    return NextResponse.json({ pixels });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('settings.edit');

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: zodMessage(parsed.error) },
        { status: 400 }
      );
    }
    const { platform, name, scope, enabled } = parsed.data;

    // Server-side Pixel ID validation — fail closed (no storage, no injection).
    const pixelId = validateTrackingPixelId(platform, parsed.data.pixelId);
    if (!pixelId) {
      return NextResponse.json({ error: pixelIdHint(platform) }, { status: 400 });
    }

    const clash = await db.trackingPixel.findFirst({ where: { companyId, platform, pixelId } });
    if (clash) {
      return NextResponse.json({ error: 'هذا البكسل مسجل مسبقًا لنفس المنصة' }, { status: 409 });
    }

    const pixel = await db.trackingPixel.create({
      data: { companyId, platform, name, pixelId, scope, enabled },
    });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'TRACKING_PIXEL_CREATED',
      entity: 'TrackingPixel',
      entityId: pixel.id,
      // Masked ID in audit — the platform/name/action stay readable.
      newData: { platform, name, scope, enabled, pixelId: maskPixelId(pixelId), by: user.name },
    });

    return NextResponse.json({ success: true, pixel });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
