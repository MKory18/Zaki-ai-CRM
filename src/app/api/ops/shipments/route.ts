import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { shipmentBlocks } from '@/lib/operations';
import { codForOrder, resolveDeliveryFee } from '@/lib/delivery-fees';
import { assertReadyToShip, type StateSource } from '@/lib/order-state';
import { zodMessage } from '@/lib/zod-message';

/**
 * Shipment creation.
 *
 *   GET  /api/ops/shipments?from&to&courier&region&product
 *        Candidate orders with their COD breakdown and blocking warnings.
 *   POST /api/ops/shipments
 *        { deliveryProviderId, orderIds, acknowledgedOrderIds[] }
 *
 * Soft warnings (duplicate in batch, previous shipment in transit, recent
 * return) must be acknowledged per order. Hard blocks (missing region or fee
 * row, stock shortage when negative stock is disallowed) create no shipment
 * row at all — those orders come back in an exceptions list.
 */

const createSchema = z.object({
  deliveryProviderId: z.string().uuid(),
  orderIds: z.array(z.string().uuid()).min(1).max(200),
  acknowledgedOrderIds: z.array(z.string().uuid()).default([]),
  notes: z.string().trim().max(300).optional(),
});

export async function GET(req: Request) {
  try {
    const { companyId, storeId, country } = await requireContext();
    await requirePermission('ops.ship');

    const q = new URL(req.url).searchParams;
    const from = q.get('from') ? new Date(q.get('from')!) : null;
    const to = q.get('to') ? new Date(q.get('to')!) : null;
    // The courier is the TARGET of this shipment, used to price each row —
    // not a filter: orders waiting for a courier have none assigned yet.
    const providerId = q.get('courier');
    const regionId = q.get('region');
    const productId = q.get('product');

    const orders = await db.order.findMany({
      where: {
        companyId,
        storeId,
        confirmationStatus: 'CONFIRMED',
        shippingStatus: { in: ['NOT_READY', 'PACKING', 'READY_FOR_SHIPPING'] },
        ...(regionId ? { regionId } : {}),
        ...(productId ? { items: { some: { productId } } } : {}),
        ...(from || to
          ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 300,
      select: {
        id: true, orderNumber: true, merchantRef: true, createdAt: true, currency: true,
        priceIncludesDelivery: true, deliveryFee: true, regionId: true, deliveryProviderId: true,
        customerId: true, companyId: true, confirmationStatus: true, shippingStatus: true, shippedAt: true,
        customer: { select: { id: true, fullName: true, phone: true, city: true, totalOrders: true } },
        region: { select: { id: true, name: true } },
        items: { select: { productName: true, quantity: true, freeQuantity: true, unitPrice: true, discountShare: true, reservedQty: true } },
      },
    });

    const rows = [];
    for (const order of orders) {
      const provider = providerId ?? order.deliveryProviderId;
      const fee = provider
        ? await resolveDeliveryFee(db, { deliveryProviderId: provider, regionId: order.regionId, minorUnit: country.minorUnit })
        : { fee: 0, lateThresholdDays: 0, returnFee: 0, source: 'NONE' as const };

      const money = codForOrder({
        lines: order.items,
        deliveryFee: fee.fee,
        priceIncludesDelivery: order.priceIncludesDelivery,
        minorUnit: country.minorUnit,
      });

      const blocks = await shipmentBlocks(
        db,
        { id: order.id, companyId: order.companyId, customerId: order.customerId, regionId: order.regionId, deliveryProviderId: provider },
        { allowNegativeStock: country.allowNegativeStock, batchOrderIds: orders.map((o) => o.id) }
      );

      rows.push({
        id: order.id,
        orderNumber: order.orderNumber,
        merchantRef: order.merchantRef,
        createdAt: order.createdAt,
        customer: order.customer,
        previousOrders: Math.max(0, (order.customer.totalOrders ?? 1) - 1),
        region: order.region,
        items: order.items.map((i) => ({ productName: i.productName, quantity: i.quantity, freeQuantity: i.freeQuantity })),
        cod: { ...money, currency: order.currency, feeSource: fee.source },
        blocks,
        // Select-all skips anything blocked; soft blocks need an acknowledgement.
        selectable: blocks.length === 0,
        hardBlocked: blocks.some((b) => b.hard),
      });
    }

    return NextResponse.json({ count: rows.length, allowNegativeStock: country.allowNegativeStock, orders: rows });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId, storeId, country } = await requireContext();
    await requirePermission('ops.ship');

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }
    const { deliveryProviderId, orderIds, acknowledgedOrderIds, notes } = parsed.data;

    const provider = await db.deliveryProvider.findFirst({ where: { id: deliveryProviderId, companyId } });
    if (!provider) return NextResponse.json({ error: 'شركة الشحن غير موجودة' }, { status: 404 });

    const orders = await db.order.findMany({
      where: { id: { in: orderIds }, companyId, storeId },
      select: {
        id: true, orderNumber: true, companyId: true, customerId: true, regionId: true,
        confirmationStatus: true, shippingStatus: true, shippedAt: true, priceIncludesDelivery: true,
        deliveryProviderId: true, version: true,
        items: { select: { quantity: true, freeQuantity: true, reservedQty: true, unitPrice: true, discountShare: true } },
      },
    });

    const exceptions: { orderId: string; orderNumber: string; reasons: string[] }[] = [];
    const shippable: typeof orders = [];

    for (const order of orders) {
      const reasons: string[] = [];

      const ready = assertReadyToShip(order as StateSource, order.items);
      if (!ready.allowed) reasons.push(ready.message ?? 'غير جاهز للشحن');

      const blocks = await shipmentBlocks(
        db,
        { id: order.id, companyId: order.companyId, customerId: order.customerId, regionId: order.regionId, deliveryProviderId },
        { allowNegativeStock: country.allowNegativeStock, batchOrderIds: orderIds }
      );
      for (const block of blocks) {
        // Soft blocks pass only with an explicit acknowledgement for THIS order.
        if (block.hard || !acknowledgedOrderIds.includes(order.id)) reasons.push(block.message);
      }

      if (reasons.length > 0) exceptions.push({ orderId: order.id, orderNumber: order.orderNumber, reasons });
      else shippable.push(order);
    }

    if (shippable.length === 0) {
      return NextResponse.json(
        { error: 'لا يوجد طلب صالح للشحن ضمن الاختيار', code: 'ALL_BLOCKED', exceptions },
        { status: 409 }
      );
    }

    const batch = await db.$transaction(async (tx) => {
      const count = await tx.shippingBatch.count({ where: { companyId } });
      const created = await tx.shippingBatch.create({
        data: {
          companyId,
          storeId,
          batchNumber: `BATCH-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`,
          deliveryProviderId,
          createdById: user.id,
          notes: notes ?? null,
          status: 'READY',
        },
      });

      for (const order of shippable) {
        const fee = await resolveDeliveryFee(tx, {
          deliveryProviderId,
          regionId: order.regionId,
          minorUnit: country.minorUnit,
        });
        const money = codForOrder({
          lines: order.items,
          deliveryFee: fee.fee,
          priceIncludesDelivery: order.priceIncludesDelivery,
          minorUnit: country.minorUnit,
        });

        await tx.order.update({
          where: { id: order.id },
          data: {
            shippingBatchId: created.id,
            deliveryProviderId,
            deliveryAssignedAt: new Date(),
            deliveryAssignedById: user.id,
            // Fee and COD are snapshots taken now; a later table change never
            // rewrites this order.
            deliveryFee: fee.fee,
            totalAmount: money.cod,
            shippingStatus: 'READY_FOR_PICKUP',
            settlementStatus: 'PENDING_COLLECTION',
            version: { increment: 1 },
          },
        });
        await tx.orderStatusLog.create({
          data: {
            companyId, orderId: order.id, statusType: 'SHIPPING',
            previousValue: order.shippingStatus, newValue: 'READY_FOR_PICKUP',
            changedById: user.id, changedByRole: user.role,
            note: `batch ${created.batchNumber}`,
          },
        });
      }
      return created;
    });

    await logAudit({
      companyId, userId: user.id, action: 'SHIPMENT_BATCH_CREATED',
      entity: 'ShippingBatch', entityId: batch.id,
      newData: { batchNumber: batch.batchNumber, orders: shippable.length, exceptions: exceptions.length },
    });

    return NextResponse.json({ batch, shipped: shippable.length, exceptions }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
