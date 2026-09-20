import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';
import { apiErrorResponse } from '@/lib/api-error';
import { firstIssue, geoAccessSchema } from '@/lib/geo-schemas';
import { currentGeoAccess, geoAccessError, replaceGeoAccess } from '@/lib/geo-access';

/**
 *   GET /api/users/:id/geo-access  (geo.manage)
 *   PUT /api/users/:id/geo-access  (geo.manage) { countryIds, storeIds }
 *
 * PUT replaces the user's country and store assignments. Every id must
 * belong to the session company, and every store must sit in one of the
 * assigned countries.
 */

async function companyUser(id: string, companyId: string) {
  return db.user.findFirst({ where: { id, companyId }, select: { id: true } });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { companyId } = await requireCompanyTenant();
    await requirePermission('geo.manage');
    if (!(await companyUser(id, companyId))) return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 });
    return NextResponse.json(await currentGeoAccess(id));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('geo.manage');
    if (!(await companyUser(id, companyId))) return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 });

    const parsed = geoAccessSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
    const countryIds = [...new Set(parsed.data.countryIds)];
    const storeIds = [...new Set(parsed.data.storeIds)];

    const invalid = await geoAccessError(companyId, countryIds, storeIds);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    const before = await currentGeoAccess(id);
    await db.$transaction(async (tx) => replaceGeoAccess(tx as never, id, countryIds, storeIds));

    const after = { countryIds, storeIds };
    await logAudit({
      companyId,
      userId: user.id,
      action: 'USER_GEO_ACCESS_UPDATED',
      entity: 'User',
      entityId: id,
      previousData: before,
      newData: after,
    });
    return NextResponse.json(after);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
