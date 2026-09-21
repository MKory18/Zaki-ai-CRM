import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { orderRefFields } from '@/lib/order-ref';
import { planTransfer, TransferRefused, type TransferParty } from '@/lib/courier-transfer';
import { zodMessage } from '@/lib/zod-message';

/**
 * POST /api/ops/tracking/transfer — move a parcel to another courier.
 *
 * The rules live in src/lib/courier-transfer.ts. Away from a مندوب it is one
 * move; away from a company the parcel is taken back and a REPLACEMENT order
 * is raised, because the original is physically with that company under
 * their barcode and will appear in their statement. Overwriting the provider
 * would quietly detach the order from the shipment that still holds it.
 */

const schema = z.object({
  orderId: z.string().uuid(),
  toProviderId: z.string().uuid(),
  note: z.string().trim().max(300).optional(),
});

export async function POST(req: Request) {
  try {
    const { user, companyId, storeId, country } = await requireContext();
    await requirePermission('ops.track');

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }

    const order = await db.order.findFirst({
      where: { id: parsed.data.orderId, companyId, storeId },
      include: {
        deliveryProvider: { select: { id: true, name: true, kind: true } },
        replacedBy: { select: { id: true, orderNumber: true } },
      },
    });
    if (!order) return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 });
    if (order.replacedBy) {
      return NextResponse.json(
        {
          error: `صدر لهذا الطلب بديل مسبقاً (${order.replacedBy.orderNumber})`,
          code: 'ALREADY_REPLACED',
        },
        { status: 409 }
      );
    }

    const to = await db.deliveryProvider.findFirst({
      where: { id: parsed.data.toProviderId, companyId, isActive: true },
      select: { id: true, name: true, kind: true },
    });
    if (!to) return NextResponse.json({ error: 'الجهة غير موجودة' }, { status: 404 });

    const from: TransferParty | null = order.deliveryProvider
      ? {
          id: order.deliveryProvider.id,
          name: order.deliveryProvider.name,
          kind: order.deliveryProvider.kind === 'AGENT' ? 'AGENT' : 'COMPANY',
        }
      : null;
    const target: TransferParty = { id: to.id, name: to.name, kind: to.kind === 'AGENT' ? 'AGENT' : 'COMPANY' };

    let plan;
    try {
      plan = planTransfer({ from, to: target, shippingStatus: order.shippingStatus });
    } catch (e) {
      if (e instanceof TransferRefused) {
        return NextResponse.json({ error: e.message, code: e.code }, { status: 409 });
      }
      throw e;
    }

    const runTransfer = (attempt: number) =>
      db.$transaction(async (tx) => {
      if (plan.mode === 'DIRECT') {
        // The مندوب is immediate: handing the parcel on IS getting it back.
        const updated = await tx.order.update({
          where: { id: order.id },
          data: {
            deliveryProviderId: to.id,
            shippingStatus: plan.nextStatus,
            trackingNumber: null, // the old courier's barcode is not ours to carry over
            shippedAt: null,
            version: { increment: 1 },
          },
        });
        await tx.orderActivity.create({
          data: {
            companyId, orderId: order.id, userId: user.id,
            action: 'COURIER_TRANSFERRED',
            newStatus: plan.nextStatus,
            metadata: JSON.stringify({ mode: plan.mode, from: from?.name, to: to.name, note: parsed.data.note ?? null }),
          },
        });
        return { mode: plan.mode, order: updated, replacement: null };
      }

      // REPLACE: close the company's leg, raise a fresh order for the new one.
      await tx.order.update({
        where: { id: order.id },
        data: {
          shippingStatus: plan.originalStatus,
          returnReason: plan.reason,
          version: { increment: 1 },
        },
      });

      // The number is taken BEFORE the insert and any clash retries the whole
      // transaction from outside: on Postgres a failed statement aborts the
      // transaction, so a retry within it cannot run.
      const refs = await orderRefFields(tx, companyId, country.orderPrefix, attempt);
      const replacement = await tx.order.create({
            data: {
              companyId,
              countryId: order.countryId,
              storeId: order.storeId,
              regionId: order.regionId,
              ...refs,
              replacesOrderId: order.id,
              customerId: order.customerId,
              productId: order.productId,
              offerId: order.offerId,
              quantity: order.quantity,
              freeQuantity: order.freeQuantity,
              sellingPrice: order.sellingPrice,
              discountAmount: order.discountAmount,
              shippingCost: 0,
              totalAmount: order.totalAmount,
              currency: order.currency,
              priceIncludesDelivery: order.priceIncludesDelivery,
              productNameSnapshot: order.productNameSnapshot,
              productImageSnapshot: order.productImageSnapshot,
              moderatorId: order.moderatorId,
              moderatorCommission: 0,
              estimatedCostOfGoods: order.estimatedCostOfGoods,
              // Already confirmed once — it re-enters at preparation, not intake.
              status: 'CONFIRMED',
              confirmationStatus: 'CONFIRMED',
              shippingStatus: plan.nextStatus,
              settlementStatus: 'NOT_APPLICABLE',
              // Assigned from scratch on the shipment screen.
              deliveryProviderId: null,
              source: order.source,
              customerNotes: order.customerNotes,
              internalNotes: `بديل عن ${order.orderNumber}: ${plan.reason}`,
              version: 1,
            },
      });

      // Carry the lines over, so preparation and stock see the same goods.
      const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
      for (const item of items) {
        await tx.orderItem.create({
          data: {
            companyId,
            orderId: replacement.id,
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            freeQuantity: item.freeQuantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
            discountShare: item.discountShare,
            addedStage: 'INTAKE',
          },
        });
      }

      for (const [orderId, note] of [
        [order.id, `سُحب من ${from?.name} — صدر البديل ${replacement.orderNumber}`],
        [replacement.id, `بديل عن ${order.orderNumber} — ليُسنَد إلى ${to.name}`],
      ] as const) {
        await tx.orderActivity.create({
          data: {
            companyId, orderId, userId: user.id,
            action: 'COURIER_TRANSFERRED',
            metadata: JSON.stringify({ mode: plan.mode, from: from?.name, to: to.name, note }),
          },
        });
      }

      return { mode: plan.mode, order, replacement };
      });

    // A duplicate order number means someone else took it between reading the
    // highest and inserting; step the number on and run the whole thing again.
    let result: Awaited<ReturnType<typeof runTransfer>> | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        result = await runTransfer(attempt);
        break;
      } catch (e: any) {
        if (e?.code === 'P2002' && attempt < 4) continue;
        throw e;
      }
    }
    if (!result) throw new Error('Failed to generate a unique order number');

    await logAudit({
      companyId, userId: user.id, action: 'COURIER_TRANSFERRED',
      entity: 'Order', entityId: order.id,
      previousData: { provider: from?.name, shippingStatus: order.shippingStatus },
      newData: {
        mode: plan.mode,
        to: to.name,
        replacement: result.replacement?.orderNumber ?? null,
        note: parsed.data.note ?? null,
      },
    });

    return NextResponse.json({
      mode: result.mode,
      orderNumber: order.orderNumber,
      replacement: result.replacement
        ? { id: result.replacement.id, orderNumber: result.replacement.orderNumber }
        : null,
      message:
        result.mode === 'DIRECT'
          ? `استُلمت الشحنة من ${from?.name} وأُسنِدت إلى ${to.name}`
          : `سُحبت الشحنة من ${from?.name} وصدر الطلب البديل ${result.replacement?.orderNumber} — يدخل تجهيز الشحنة`,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
