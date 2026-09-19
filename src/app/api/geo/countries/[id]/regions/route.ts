import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';
import { apiErrorResponse } from '@/lib/api-error';
import { firstIssue, regionCreateSchema } from '@/lib/geo-schemas';

/**
 *   GET  /api/geo/countries/:id/regions  (geo.view)
 *   POST /api/geo/countries/:id/regions  (geo.manage)
 */

async function companyCountry(id: string, companyId: string) {
  return db.country.findFirst({ where: { id, companyId }, select: { id: true } });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { companyId } = await requireCompanyTenant();
    await requirePermission('geo.view');
    if (!(await companyCountry(id, companyId))) return NextResponse.json({ error: 'البلد غير موجود' }, { status: 404 });

    const regions = await db.region.findMany({
      where: { countryId: id },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return NextResponse.json({ regions });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('geo.manage');
    if (!(await companyCountry(id, companyId))) return NextResponse.json({ error: 'البلد غير موجود' }, { status: 404 });

    const parsed = regionCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });

    const clash = await db.region.findFirst({ where: { countryId: id, name: parsed.data.name }, select: { id: true } });
    if (clash) return NextResponse.json({ error: 'هذه المنطقة مضافة مسبقًا' }, { status: 409 });

    const region = await db.region.create({ data: { countryId: id, ...parsed.data } });
    await logAudit({ companyId, userId: user.id, action: 'REGION_CREATED', entity: 'Region', entityId: region.id, newData: region });
    return NextResponse.json({ region }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
