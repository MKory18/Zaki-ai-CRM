import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { getPermissionScope } from '@/lib/authorization';
import { apiError } from '@/lib/api-error';

/**
 * GET /api/orders/sources — the channels this store's orders actually came
 * through.
 *
 * The filter used to offer a list written into the screen — Manual,
 * Messenger, WhatsApp — while the orders in front of it carried "الشيت" and
 * "اسرار الجمال". Every option missed, and every real channel was
 * unfilterable. Read from the orders, the list is whatever is true today.
 */
export async function GET() {
  try {
    const { user, companyId, storeId } = await requireContext();
    if (!getPermissionScope(user, 'orders.view')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const rows = await db.order.groupBy({
      by: ['source'],
      where: { companyId, storeId },
      _count: { _all: true },
    });

    const sources = rows
      .filter((r) => r.source)
      .map((r) => ({ name: r.source as string, count: r._count._all }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ sources });
  } catch (error) {
    const { body, status } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
