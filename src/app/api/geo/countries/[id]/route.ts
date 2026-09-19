import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';
import { apiErrorResponse } from '@/lib/api-error';
import { countryUpdateSchema, firstIssue } from '@/lib/geo-schemas';

/** PATCH /api/geo/countries/:id (geo.manage). No DELETE — deactivate instead. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('geo.manage');

    const parsed = countryUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });

    const before = await db.country.findFirst({ where: { id, companyId } });
    if (!before) return NextResponse.json({ error: 'البلد غير موجود' }, { status: 404 });

    if (parsed.data.code && parsed.data.code !== before.code) {
      const clash = await db.country.findFirst({ where: { companyId, code: parsed.data.code }, select: { id: true } });
      if (clash) return NextResponse.json({ error: 'هذا البلد مضاف مسبقًا' }, { status: 409 });
    }

    const country = await db.country.update({ where: { id }, data: parsed.data });
    await logAudit({
      companyId,
      userId: user.id,
      action: 'COUNTRY_UPDATED',
      entity: 'Country',
      entityId: id,
      previousData: before,
      newData: country,
    });
    return NextResponse.json({ country });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
