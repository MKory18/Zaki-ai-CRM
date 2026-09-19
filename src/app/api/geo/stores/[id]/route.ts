import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';
import { apiErrorResponse } from '@/lib/api-error';
import { firstIssue, storeUpdateSchema } from '@/lib/geo-schemas';

/** PATCH /api/geo/stores/:id (geo.manage). countryId is immutable; no DELETE. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('geo.manage');

    const parsed = storeUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });

    const before = await db.store.findFirst({ where: { id, companyId } });
    if (!before) return NextResponse.json({ error: 'المتجر غير موجود' }, { status: 404 });

    if (parsed.data.slug && parsed.data.slug !== before.slug) {
      const clash = await db.store.findFirst({ where: { companyId, slug: parsed.data.slug }, select: { id: true } });
      if (clash) return NextResponse.json({ error: 'هذا المعرّف مستخدم لمتجر آخر' }, { status: 409 });
    }

    const store = await db.store.update({ where: { id }, data: parsed.data });
    await logAudit({
      companyId,
      userId: user.id,
      action: 'STORE_UPDATED',
      entity: 'Store',
      entityId: id,
      previousData: before,
      newData: store,
    });
    return NextResponse.json({ store });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
