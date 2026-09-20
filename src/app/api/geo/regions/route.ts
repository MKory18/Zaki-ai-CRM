import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { apiErrorResponse } from '@/lib/api-error';

/**
 * GET /api/geo/regions — the governorates of the SELECTED country.
 *
 * Reference data for every order form. Before this, the order screens read a
 * hard-coded Syrian list, so a Jordanian store offered Syrian governorates
 * and no order could be priced against the fee table.
 *
 * Any user with a country + store context may read it: it is a list of
 * place names, and every screen that creates an order needs it.
 */
export async function GET() {
  try {
    const { countryId, country } = await requireContext();

    const regions = await db.region.findMany({
      where: { countryId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    });

    return NextResponse.json({
      country: { id: country.id, code: country.code, name: country.name },
      regions,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
