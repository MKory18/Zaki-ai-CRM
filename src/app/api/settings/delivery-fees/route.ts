import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { zodMessage } from '@/lib/zod-message';

/**
 * Delivery fee table: one row per courier per country per region.
 *
 *   GET  /api/settings/delivery-fees?courier=
 *   PUT  /api/settings/delivery-fees   upsert one row
 *
 * The table is the source for new shipments only. Orders keep the fee they
 * were shipped with — changing a row never rewrites a live order, and every
 * change is written to the audit log.
 */

const upsertSchema = z.object({
  deliveryProviderId: z.string().uuid(),
  regionId: z.string().uuid(),
  fee: z.number().min(0).max(1_000_000),
  lateThresholdDays: z.number().int().min(0).max(90),
  returnFee: z.number().min(0).max(1_000_000).default(0),
  isActive: z.boolean().default(true),
  /** Required when an existing fee changes — written to the audit log. */
  reason: z.string().trim().max(300).optional(),
});

export async function GET(req: Request) {
  try {
    const { companyId, countryId } = await requireContext();
    await requirePermission('settings.view');

    const courier = new URL(req.url).searchParams.get('courier');

    const [providers, regions, fees] = await Promise.all([
      db.deliveryProvider.findMany({ where: { companyId, isActive: true }, select: { id: true, name: true, code: true } }),
      db.region.findMany({ where: { countryId, isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      db.deliveryFee.findMany({
        where: { companyId, countryId, ...(courier ? { deliveryProviderId: courier } : {}) },
        select: { id: true, deliveryProviderId: true, regionId: true, fee: true, lateThresholdDays: true, returnFee: true, isActive: true, courierCityId: true },
      }),
    ]);

    return NextResponse.json({
      providers,
      regions,
      fees: fees.map((f) => ({ ...f, fee: Number(f.fee), returnFee: Number(f.returnFee) })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(req: Request) {
  try {
    const { user, companyId, countryId } = await requireContext();
    await requirePermission('settings.edit');

    const parsed = upsertSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }
    const input = parsed.data;

    const [provider, region] = await Promise.all([
      db.deliveryProvider.findFirst({ where: { id: input.deliveryProviderId, companyId }, select: { id: true, name: true } }),
      db.region.findFirst({ where: { id: input.regionId, countryId }, select: { id: true, name: true } }),
    ]);
    if (!provider) return NextResponse.json({ error: 'شركة الشحن غير موجودة' }, { status: 404 });
    if (!region) return NextResponse.json({ error: 'المحافظة غير موجودة في هذا البلد' }, { status: 404 });

    const existing = await db.deliveryFee.findFirst({
      where: { deliveryProviderId: input.deliveryProviderId, regionId: input.regionId },
    });

    // Changing an existing fee is an override: it needs a stated reason.
    if (existing && Number(existing.fee) !== input.fee && !input.reason) {
      return NextResponse.json(
        { error: 'تغيير أجرة قائمة يتطلب ذكر السبب', code: 'REASON_REQUIRED' },
        { status: 400 }
      );
    }

    const saved = existing
      ? await db.deliveryFee.update({
          where: { id: existing.id },
          data: {
            fee: input.fee,
            lateThresholdDays: input.lateThresholdDays,
            returnFee: input.returnFee,
            isActive: input.isActive,
          },
        })
      : await db.deliveryFee.create({
          data: {
            companyId,
            countryId,
            deliveryProviderId: input.deliveryProviderId,
            regionId: input.regionId,
            fee: input.fee,
            lateThresholdDays: input.lateThresholdDays,
            returnFee: input.returnFee,
            isActive: input.isActive,
          },
        });

    await logAudit({
      companyId,
      userId: user.id,
      action: existing ? 'DELIVERY_FEE_UPDATED' : 'DELIVERY_FEE_CREATED',
      entity: 'DeliveryFee',
      entityId: saved.id,
      previousData: existing
        ? { fee: Number(existing.fee), lateThresholdDays: existing.lateThresholdDays, returnFee: Number(existing.returnFee) }
        : undefined,
      newData: {
        courier: provider.name, region: region.name,
        fee: input.fee, lateThresholdDays: input.lateThresholdDays, returnFee: input.returnFee,
        reason: input.reason ?? null,
      },
    });

    return NextResponse.json({ fee: { ...saved, fee: Number(saved.fee), returnFee: Number(saved.returnFee) } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
