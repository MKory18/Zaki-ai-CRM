import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';
import { apiErrorResponse } from '@/lib/api-error';
import { manageableUserWhere, USER_NOT_FOUND } from '@/lib/manageable-user';
import type { SessionUser } from '@/types/auth';
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

/**
 * WHO THIS ADMIN MAY LOOK AT — from the one place that answers it.
 *
 * This read `{ id, companyId }`, which cannot match a user whose company
 * is null — and the owner's own SUPER_ADMIN account is exactly that. So
 * the countries block on their page said «المستخدم غير موجود» about the
 * person reading it. That was the fourth report of the same sentence on a
 * different screen, and the reason it kept coming back is that each of
 * these routes wrote its own answer.
 */
async function manageable(admin: SessionUser, id: string) {
  return db.user.findFirst({ where: manageableUserWhere(admin, id), select: { id: true } });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user: admin } = await requireCompanyTenant();
    await requirePermission('geo.manage');
    if (!(await manageable(admin, id))) return NextResponse.json({ error: USER_NOT_FOUND }, { status: 404 });
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
    if (!(await manageable(user, id))) return NextResponse.json({ error: USER_NOT_FOUND }, { status: 404 });

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
