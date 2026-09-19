import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';
import { apiErrorResponse } from '@/lib/api-error';
import { countryCreateSchema, firstIssue } from '@/lib/geo-schemas';

/**
 *   GET  /api/geo/countries  (geo.view)   every country of the company, with stores
 *   POST /api/geo/countries  (geo.manage) create a country
 *
 * There is no DELETE: a country is deactivated with isActive=false.
 * Default-wallet provisioning on create arrives with the wallets stage.
 */

export async function GET() {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('geo.view');

    const countries = await db.country.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
      include: {
        stores: { orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true, logo: true, status: true, type: true } },
        _count: { select: { regions: true } },
      },
    });
    return NextResponse.json({ countries });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('geo.manage');

    const parsed = countryCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });

    const clash = await db.country.findFirst({ where: { companyId, code: parsed.data.code }, select: { id: true } });
    if (clash) return NextResponse.json({ error: 'هذا البلد مضاف مسبقًا' }, { status: 409 });

    const country = await db.country.create({ data: { companyId, ...parsed.data } });

    await logAudit({
      companyId,
      userId: user.id,
      action: 'COUNTRY_CREATED',
      entity: 'Country',
      entityId: country.id,
      newData: country,
    });
    return NextResponse.json({ country }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
