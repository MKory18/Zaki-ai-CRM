import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';
import { apiErrorResponse } from '@/lib/api-error';
import { firstIssue, storeCreateSchema } from '@/lib/geo-schemas';
import { seedPagesFor } from '@/lib/store-pages';

/**
 *   GET  /api/geo/stores?countryId=  (geo.view)
 *   POST /api/geo/stores             (geo.manage)
 *
 * A store cannot exist outside a country: countryId is required and must
 * belong to the session company. There is no DELETE — status=PAUSED.
 */

export async function GET(req: Request) {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('geo.view');

    const countryId = new URL(req.url).searchParams.get('countryId');
    const stores = await db.store.findMany({
      where: { companyId, ...(countryId ? { countryId } : {}) },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ stores });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('geo.manage');

    const parsed = storeCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });

    const country = await db.country.findFirst({
      where: { id: parsed.data.countryId, companyId },
      select: { id: true },
    });
    if (!country) return NextResponse.json({ error: 'البلد غير موجود' }, { status: 404 });

    // /s/<slug> is one public space for every company — a store's address
    // must not answer with another company's shop.
    const clash = await db.store.findFirst({ where: { slug: parsed.data.slug }, select: { id: true } });
    if (clash) return NextResponse.json({ error: 'هذا المعرّف مستخدم لمتجر آخر' }, { status: 409 });

    // The store and its three legal pages are one act. A seller who finds
    // out on the morning of a campaign that the shop has no privacy policy
    // has lost the morning — an ad platform's review asks for it. They are
    // created as DRAFTS with the shop's name in a skeleton text: publishing
    // a policy the seller has not read would be putting words in their
    // mouth, and the pages screen says which are still drafts.
    const store = await db.$transaction(async (tx) => {
      const created = await tx.store.create({ data: { companyId, ...parsed.data } });
      await tx.storePage.createMany({
        data: seedPagesFor(created.name).map((seed) => ({ ...seed, companyId, storeId: created.id })),
        skipDuplicates: true,
      });
      return created;
    });
    await logAudit({ companyId, userId: user.id, action: 'STORE_CREATED', entity: 'Store', entityId: store.id, newData: store });
    return NextResponse.json({ store }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
