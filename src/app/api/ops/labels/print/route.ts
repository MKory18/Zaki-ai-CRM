import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import QRCode from 'qrcode';
import { verifyLabelBatch } from '@/lib/labels';
import { renderLabelSheet, type LabelView } from '@/lib/label-sheet';

/**
 * GET /api/ops/labels/print?t=<batch token>[&format=csv]
 *
 * Renders the labels as a print-ready HTML page (the browser's own print
 * dialog produces the PDF — no third-party PDF service ever sees customer
 * addresses), or as CSV for the courier's bulk upload.
 *
 * Authorization is per order, not per token: the session must hold
 * ops.labels, and every order in the token is re-checked against the
 * session's company and store before it is rendered.
 */

/**
 * QR of OUR order reference, inline. Generated here, so no image host and
 * no external request ever learns a customer's order number.
 */
async function qrSvg(value: string, sizeMm: number) {
  const svg = await QRCode.toString(value, { type: 'svg', errorCorrectionLevel: 'M', margin: 0, width: 256 });
  // The library emits a viewBox; force a millimetre size for print.
  return svg.replace('<svg ', `<svg width="${sizeMm}mm" height="${sizeMm}mm" `);
}

export async function GET(req: Request) {
  try {
    const { companyId, storeId } = await requireContext();
    await requirePermission('ops.labels');

    const url = new URL(req.url);
    const token = url.searchParams.get('t');
    const batch = token ? await verifyLabelBatch(token) : null;
    if (!batch) return NextResponse.json({ error: 'رابط الطباعة غير صالح أو منتهٍ' }, { status: 400 });
    if (batch.storeId !== storeId) {
      return NextResponse.json({ error: 'رابط الطباعة يخص متجراً آخر' }, { status: 403 });
    }

    const orders = await db.order.findMany({
      // Per-order authorization: the token alone is never enough.
      where: { id: { in: batch.orderIds }, companyId, storeId },
      select: {
        id: true, orderNumber: true, merchantRef: true, trackingNumber: true,
        totalAmount: true, currency: true,
        customer: { select: { fullName: true, phone: true, rawPhone: true, city: true, address: true } },
        region: { select: { name: true } },
        deliveryProvider: { select: { name: true } },
        items: { select: { productName: true, quantity: true, freeQuantity: true } },
      },
    });
    if (orders.length === 0) return NextResponse.json({ error: 'لا توجد طلبات' }, { status: 404 });

    if (url.searchParams.get('format') === 'csv') {
      const header = ['merchant_ref', 'courier_barcode', 'customer', 'phone', 'region', 'address', 'cod', 'currency', 'items'];
      const lines = orders.map((o) =>
        [
          o.merchantRef ?? o.orderNumber,
          o.trackingNumber ?? '',
          o.customer.fullName,
          o.customer.rawPhone || o.customer.phone,
          o.region?.name ?? o.customer.city,
          o.customer.address,
          String(o.totalAmount),
          o.currency,
          o.items.map((i) => `${i.productName} x${i.quantity + i.freeQuantity}`).join(' | '),
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      );
      await db.order.updateMany({ where: { id: { in: orders.map((o) => o.id) } }, data: { labelPrintedAt: new Date() } });
      return new NextResponse(`﻿${[header.join(','), ...lines].join('\r\n')}`, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="labels-${Date.now()}.csv"`,
        },
      });
    }

    const labels: LabelView[] = await Promise.all(
      orders.map(async (o) => {
        const ref = o.merchantRef ?? o.orderNumber;
        return {
          courier: o.deliveryProvider?.name ?? 'شركة الشحن',
          ref,
          // The courier's barcode AND a QR of our own reference, per contract.
          courierCode: o.trackingNumber || ref,
          name: o.customer.fullName,
          phone: o.customer.rawPhone || o.customer.phone,
          place: `${o.region?.name ?? o.customer.city} — ${o.customer.address}`,
          items: o.items.map((i) => `${i.productName} × ${i.quantity + i.freeQuantity}`),
          cod: `${o.totalAmount} ${o.currency}`,
          qrSvg: await qrSvg(ref, Math.max(18, Math.round(batch.width / 4))),
        };
      })
    );

    await db.order.updateMany({ where: { id: { in: orders.map((o) => o.id) } }, data: { labelPrintedAt: new Date() } });

    const html = renderLabelSheet(labels, batch);
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
