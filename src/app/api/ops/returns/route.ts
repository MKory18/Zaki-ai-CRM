import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { can, requirePermission } from '@/lib/authorization';
import { redactCustomerForWarehouse } from '@/lib/operations';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { resolveDeliveryFee } from '@/lib/delivery-fees';
import { roundMinor } from '@/lib/money';

/**
 * Return receiving.
 *
 *   GET  /api/ops/returns?q=          returns announced but not yet received
 *   POST /api/ops/returns             record one physical receipt
 *
 * Nothing re-enters stock before the count-and-inspect acknowledgement: the
 * acknowledgement is required by the schema, and the stock movement is
 * written in the same transaction as the receipt. Missing units are computed
 * (expected - received - damaged), never typed by the receiver.
 */

const receiveSchema = z.object({
  orderId: z.string().uuid(),
  receivedQty: z.number().int().min(0).max(10_000),
  damagedQty: z.number().int().min(0).max(10_000).default(0),
  /** Must be true: the receiver states they counted and inspected the goods. */
  countedAndInspected: z.literal(true, { message: 'يلزم إقرار العد والفحص قبل الاستلام' }),
  chargeCourierFee: z.boolean().default(false),
  note: z.string().trim().max(500).optional(),
});

export async function GET(req: Request) {
  try {
    const { user, companyId, storeId } = await requireContext();
    await requirePermission('ops.returns');
    const maySeeContact = can(user, 'customers.view');

    const term = new URL(req.url).searchParams.get('q')?.trim();

    const orders = await db.order.findMany({
      where: {
        companyId,
        storeId,
        shippingStatus: { in: ['RETURN_REQUESTED', 'RETURNED', 'FAILED_DELIVERY'] },
        returnReceipt: null,
        ...(term
          ? { OR: [{ orderNumber: { contains: term } }, { merchantRef: { contains: term } }, { trackingNumber: { contains: term } }] }
          : {}),
      },
      orderBy: { returnedAt: 'asc' },
      take: 200,
      select: {
        id: true, orderNumber: true, merchantRef: true, trackingNumber: true,
        shippingStatus: true, returnReason: true, returnedAt: true, regionId: true, deliveryProviderId: true,
        customer: { select: { fullName: true, phone: true } },
        region: { select: { id: true, name: true } },
        deliveryProvider: { select: { id: true, name: true } },
        items: { select: { productName: true, quantity: true, freeQuantity: true, productId: true } },
      },
    });

    return NextResponse.json({
      count: orders.length,
      orders: orders.map((o) => ({
        ...o,
        customer: redactCustomerForWarehouse(o.customer, maySeeContact),
        expectedQty: o.items.reduce((s, i) => s + i.quantity + i.freeQuantity, 0),
      })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId, storeId, country } = await requireContext();
    await requirePermission('ops.returns');

    const parsed = receiveSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' }, { status: 400 });
    }
    const input = parsed.data;

    const order = await db.order.findFirst({
      where: { id: input.orderId, companyId, storeId },
      select: {
        id: true, orderNumber: true, shippingStatus: true, regionId: true, deliveryProviderId: true,
        returnReceipt: { select: { id: true } },
        items: { select: { id: true, productId: true, productName: true, quantity: true, freeQuantity: true } },
      },
    });
    if (!order) return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 });
    if (order.returnReceipt) {
      return NextResponse.json({ error: 'تم استلام هذا المرتجع مسبقاً', code: 'ALREADY_RECEIVED' }, { status: 409 });
    }

    const expectedQty = order.items.reduce((s, i) => s + i.quantity + i.freeQuantity, 0);
    if (input.receivedQty + input.damagedQty > expectedQty) {
      return NextResponse.json(
        { error: `الكمية المستلمة أكبر من المشحونة (${expectedQty})`, code: 'OVER_RECEIVED' },
        { status: 400 }
      );
    }
    const missingQty = expectedQty - input.receivedQty - input.damagedQty;

    // The courier's return fee comes from the fee table of this region and
    // courier — it is never typed in by the receiver.
    let courierFeeAmount = 0;
    if (input.chargeCourierFee && order.deliveryProviderId) {
      const fee = await resolveDeliveryFee(db, {
        deliveryProviderId: order.deliveryProviderId,
        regionId: order.regionId,
        minorUnit: country.minorUnit,
      });
      courierFeeAmount = roundMinor(fee.returnFee || fee.fee, country.minorUnit);
    }

    const receipt = await db.$transaction(async (tx) => {
      const created = await tx.returnReceipt.create({
        data: {
          companyId,
          orderId: order.id,
          expectedQty,
          receivedQty: input.receivedQty,
          damagedQty: input.damagedQty,
          missingQty,
          courierFeeCharged: input.chargeCourierFee,
          courierFeeAmount,
          inspectedById: user.id,
          note: input.note ?? null,
          // Only sound units go back on the shelf.
          stockRestored: input.receivedQty > 0,
        },
      });

      // Stock re-entry happens HERE, after the acknowledgement, never before.
      if (input.receivedQty > 0) {
        let remaining = input.receivedQty;
        for (const line of order.items) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, line.quantity + line.freeQuantity);
          remaining -= take;

          const balance = await tx.inventoryMovement.findFirst({
            where: { companyId, productId: line.productId },
            orderBy: { createdAt: 'desc' },
            select: { balanceAfter: true },
          });
          await tx.inventoryMovement.create({
            data: {
              companyId,
              productId: line.productId,
              type: 'RETURN',
              quantity: take,
              balanceAfter: (balance?.balanceAfter ?? 0) + take,
              referenceId: order.id,
              reason: `مرتجع ${order.orderNumber} — بعد العد والفحص`,
              createdById: user.id,
            },
          });
        }
      }

      await tx.orderItem.updateMany({ where: { orderId: order.id, reservedQty: { gt: 0 } }, data: { reservedQty: 0 } });
      await tx.order.update({
        where: { id: order.id },
        data: {
          shippingStatus: 'RETURNED',
          status: 'RETURNED',
          returnedAt: new Date(),
          settlementStatus: 'NOT_APPLICABLE',
          moderatorCommission: 0, // a returned order generates no commission
          version: { increment: 1 },
        },
      });
      await tx.orderNote.create({
        data: {
          companyId,
          orderId: order.id,
          authorId: user.id,
          kind: 'return',
          body:
            `استلام مرتجع: وصل ${input.receivedQty}، تالف ${input.damagedQty}، ناقص ${missingQty}` +
            (input.chargeCourierFee ? ` — أجرة إرجاع ${courierFeeAmount}` : '') +
            (input.note ? ` — ${input.note}` : ''),
        },
      });
      return created;
    });

    await logAudit({
      companyId, userId: user.id, action: 'RETURN_RECEIVED',
      entity: 'Order', entityId: order.id,
      newData: { receiptId: receipt.id, expectedQty, received: input.receivedQty, damaged: input.damagedQty, missingQty, courierFeeAmount },
    });

    return NextResponse.json({ receipt, missingQty, courierFeeAmount }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
