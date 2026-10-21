import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { logAudit } from '@/lib/audit';
import { apiErrorResponse } from '@/lib/api-error';
import { blockersSentence, regionBlockers, regionUse } from '@/lib/geo-removal';

/**
 * DELETE /api/geo/countries/:id/regions/:regionId (geo.manage)
 *
 * The owner's «بدي زر لحذف المدن اذا ما كان مربوط فيها ولا طلب». A city is
 * deleted only while NOTHING names it: no order (the database refuses that one
 * on its own) and no courier fee for it — which the database would NOT refuse,
 * it would delete the fee along with the city, and a fee is a price somebody
 * typed. Both are counted again here, inside the transaction that deletes, at
 * the strictest isolation, so a fee set a moment after the screen drew its
 * button makes this fail instead of vanishing.
 *
 * The same `regionUse` / `regionBlockers` the list's GET answers with, so the
 * button cannot be live for a city this refuses.
 *
 * A customer's address that spells the city's name is not a link — it is
 * text, and stays text.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; regionId: string }> }) {
  try {
    const { id, regionId } = await params;
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('geo.manage');

    // The city must belong to THIS country, and the country to this company.
    const region = await db.region.findFirst({
      where: { id: regionId, countryId: id, country: { companyId } },
    });
    if (!region) return NextResponse.json({ error: 'المحافظة غير موجودة' }, { status: 404 });

    const refused = await db.$transaction(
      async (tx) => {
        const why = regionBlockers((await regionUse(tx, [regionId])).get(regionId));
        if (why.length > 0) return why;
        await tx.region.delete({ where: { id: regionId } });
        return null;
      },
      { isolationLevel: 'Serializable', timeout: 20_000 }
    );
    if (refused) {
      return NextResponse.json(
        { error: blockersSentence('المحافظة', refused), code: 'REGION_IN_USE', blockers: refused },
        { status: 409 }
      );
    }

    await logAudit({
      companyId,
      userId: user.id,
      action: 'REGION_DELETED',
      entity: 'Region',
      entityId: regionId,
      previousData: region,
      newData: null,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
