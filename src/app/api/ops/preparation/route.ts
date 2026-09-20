import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { preparationGroups } from '@/lib/operations';

/**
 * GET /api/ops/preparation — confirmed orders grouped BY PRODUCT with
 * orders / required / available / shortage per product, and the lines under
 * it. Availability honours the country's allow_negative_stock flag, which is
 * returned so the screen can say which shortages block shipment.
 */
export async function GET() {
  try {
    const { companyId, storeId, country } = await requireContext();
    await requirePermission('ops.prepare');

    const groups = await preparationGroups(db, { companyId, storeId });

    return NextResponse.json({
      allowNegativeStock: country.allowNegativeStock,
      totals: {
        products: groups.length,
        orders: new Set(groups.flatMap((g) => g.lines.map((l) => l.orderId))).size,
        shortages: groups.filter((g) => g.shortage > 0).length,
      },
      groups,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
