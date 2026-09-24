import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { inStore } from '@/lib/store-filter';
import { requireContext } from '@/lib/geo-context';
import { can } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { customerRisk } from '@/lib/customer-risk';
import { deriveCoreState, type StateSource } from '@/lib/order-state';

/**
 * GET /api/customers/:id/history?exclude=<orderId>
 *
 * Everything the agent needs to know before calling: did this person order
 * before, what happened to those orders, and what their risk tier is. The
 * customer is company-wide (one phone, one person, one history), so the
 * list is NOT scoped to the selected store — an order returned in another
 * store is still a returned order.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, companyId, storeId } = await requireContext();

    if (!can(user, 'customers.view') && !can(user, 'customers.view_basic') && !can(user, 'orders.view')) {
      return NextResponse.json({ error: 'Forbidden: cannot read customer history' }, { status: 403 });
    }

    const customer = await db.customer.findFirst({
      where: { id, ...inStore(companyId, storeId) },
      select: {
        id: true, fullName: true, phone: true, rawPhone: true, city: true,
        totalOrders: true, deliveredOrders: true, cancelledOrders: true,
        firstOrderDate: true, lastOrderDate: true,
      },
    });
    if (!customer) return NextResponse.json({ error: 'العميل غير موجود' }, { status: 404 });

    const exclude = new URL(req.url).searchParams.get('exclude');
    const orders = await db.order.findMany({
      // The customer is this store's; their orders must be too. A
      // customer who bought from two stores has two histories, and neither
      // store is entitled to the other's.
      where: { ...inStore(companyId, storeId), customerId: id, ...(exclude ? { id: { not: exclude } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true, orderNumber: true, merchantRef: true, createdAt: true, deliveredAt: true, returnedAt: true,
        confirmationStatus: true, shippingStatus: true, claimedById: true, shippedAt: true,
        totalAmount: true, currency: true, rejectionReason: true, returnReason: true,
        store: { select: { name: true } },
        items: { select: { productName: true, quantity: true, freeQuantity: true } },
      },
    });

    const risk = await customerRisk(db, companyId, id);

    return NextResponse.json({
      customer,
      risk,
      count: orders.length,
      orders: orders.map((o) => ({
        ...o,
        // The same derived state the order screens show — never the legacy field.
        state: deriveCoreState(o as StateSource),
      })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
