import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { can, requirePermission } from '@/lib/authorization';
import { redactCustomerForWarehouse } from '@/lib/operations';
import { apiErrorResponse } from '@/lib/api-error';
import { signLabelBatch } from '@/lib/labels';

/**
 * Labels.
 *
 *   GET  /api/ops/labels?from&to&courier&region&printed=  candidates
 *   POST /api/ops/labels  { orderIds, width, height }     -> batch token
 *
 * The print URL carries the returned token, never a list of ids, and the
 * print route re-checks every order against the session's store.
 */

const tokenSchema = z.object({
  orderIds: z.array(z.string().uuid()).min(1).max(200),
  width: z.number().int().min(40).max(300).default(100),
  height: z.number().int().min(40).max(300).default(150),
  // The paper. Omitted means the page is the label — a thermal roll.
  sheetWidth: z.number().int().min(40).max(500).optional(),
  sheetHeight: z.number().int().min(40).max(500).optional(),
});

export async function GET(req: Request) {
  try {
    const { user, companyId, storeId } = await requireContext();
    await requirePermission('ops.labels');
    // Warehouse users hold ops.labels but not customers.view: their list
    // payload must not carry phone or address.
    const maySeeContact = can(user, 'customers.view');

    const q = new URL(req.url).searchParams;
    const from = q.get('from') ? new Date(q.get('from')!) : null;
    const to = q.get('to') ? new Date(q.get('to')!) : null;
    const courier = q.get('courier');
    const regionId = q.get('region');
    const printed = q.get('printed'); // 'yes' | 'no' | null

    const orders = await db.order.findMany({
      where: {
        companyId,
        storeId,
        shippingStatus: { in: ['READY_FOR_PICKUP', 'READY_FOR_SHIPPING', 'SHIPPED', 'OUT_FOR_DELIVERY'] },
        ...(courier ? { deliveryProviderId: courier } : {}),
        ...(regionId ? { regionId } : {}),
        ...(printed === 'yes' ? { labelPrintedAt: { not: null } } : {}),
        ...(printed === 'no' ? { labelPrintedAt: null } : {}),
        ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 300,
      select: {
        id: true, orderNumber: true, merchantRef: true, trackingNumber: true, totalAmount: true,
        currency: true, labelPrintedAt: true, shippingStatus: true,
        customer: { select: { fullName: true, phone: true, city: true, address: true } },
        region: { select: { name: true } },
        deliveryProvider: { select: { name: true, code: true } },
      },
    });

    return NextResponse.json({
      count: orders.length,
      orders: orders.map((o) => ({ ...o, customer: redactCustomerForWarehouse(o.customer, maySeeContact) })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { companyId, storeId } = await requireContext();
    await requirePermission('ops.labels');

    const parsed = tokenSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' }, { status: 400 });
    }

    // Only ids that really belong to this store may enter the token.
    const owned = await db.order.findMany({
      where: { id: { in: parsed.data.orderIds }, companyId, storeId },
      select: { id: true },
    });
    if (owned.length === 0) return NextResponse.json({ error: 'لا توجد طلبات صالحة' }, { status: 404 });

    const token = await signLabelBatch({
      storeId,
      orderIds: owned.map((o) => o.id),
      width: parsed.data.width,
      height: parsed.data.height,
      sheetWidth: parsed.data.sheetWidth,
      sheetHeight: parsed.data.sheetHeight,
    });

    return NextResponse.json({ token, count: owned.length, printPath: `/api/ops/labels/print?t=${token}` });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
