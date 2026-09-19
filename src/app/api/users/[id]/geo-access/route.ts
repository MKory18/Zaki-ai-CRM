import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';
import { apiErrorResponse } from '@/lib/api-error';
import { firstIssue, geoAccessSchema } from '@/lib/geo-schemas';

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

async function currentAccess(userId: string) {
  const [countries, stores] = await Promise.all([
    db.userCountryAccess.findMany({ where: { userId }, select: { countryId: true } }),
    db.userStoreAccess.findMany({ where: { userId }, select: { storeId: true } }),
  ]);
  return { countryIds: countries.map((c) => c.countryId), storeIds: stores.map((s) => s.storeId) };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { companyId } = await requireCompanyTenant();
    await requirePermission('geo.manage');
    if (!(await companyUser(id, companyId))) return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 });
    return NextResponse.json(await currentAccess(id));
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

    const validCountries = await db.country.count({ where: { companyId, id: { in: countryIds } } });
    if (validCountries !== countryIds.length) {
      return NextResponse.json({ error: 'بلد غير موجود' }, { status: 400 });
    }
    const validStores = await db.store.count({ where: { companyId, id: { in: storeIds }, countryId: { in: countryIds } } });
    if (validStores !== storeIds.length) {
      return NextResponse.json({ error: 'كل متجر يجب أن يكون ضمن بلد مُسند للمستخدم' }, { status: 400 });
    }

    const before = await currentAccess(id);
    await db.$transaction([
      db.userCountryAccess.deleteMany({ where: { userId: id } }),
      db.userStoreAccess.deleteMany({ where: { userId: id } }),
      db.userCountryAccess.createMany({ data: countryIds.map((countryId) => ({ userId: id, countryId })) }),
      db.userStoreAccess.createMany({ data: storeIds.map((storeId) => ({ userId: id, storeId })) }),
    ]);

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
