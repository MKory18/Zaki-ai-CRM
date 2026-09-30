import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { ORDER_ACCESS_STATUS, assertOrderReadable } from '@/lib/rbac';
import { apiErrorResponse } from '@/lib/api-error';
import { orderTimeline } from '@/lib/order-timeline';
import { deriveCoreState, getZone, type StateSource } from '@/lib/order-state';

/**
 * GET /api/orders/:id/timeline — the merged history of one order, plus its
 * derived state, so a screen can never show a status that disagrees with
 * the events below it.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId, storeId } = await requireContext();

    const access = await assertOrderReadable(id, user, { companyId, storeId }, 'orders.view');
    if (!access.allowed) {
      return NextResponse.json({ error: 'Order not found' }, { status: ORDER_ACCESS_STATUS[access.reason] });
    }
    const order = access.order as StateSource & { orderNumber: string };

    const events = await orderTimeline(db, id);
    const state = deriveCoreState(order);

    return NextResponse.json({
      orderNumber: order.orderNumber,
      state,
      zone: getZone(state),
      count: events.length,
      events,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
