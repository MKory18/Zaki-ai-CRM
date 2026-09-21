import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import QRCode from 'qrcode';
import { code128Bars, verifyLabelBatch } from '@/lib/labels';

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

function esc(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Code 128 barcode as an inline SVG (module width 1, height in mm). */
function barcodeSvg(value: string, widthMm: number, heightMm: number) {
  const bars = code128Bars(value);
  const total = bars.reduce((a, b) => a + b, 0);
  let x = 0;
  let dark = true;
  const rects: string[] = [];
  for (const w of bars) {
    if (dark) rects.push(`<rect x="${x}" y="0" width="${w}" height="10" fill="#000"/>`);
    x += w;
    dark = !dark;
  }
  return `<svg viewBox="0 0 ${total} 10" preserveAspectRatio="none" width="${widthMm}mm" height="${heightMm}mm">${rects.join('')}</svg>`;
}

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

    const labels = (
      await Promise.all(
        orders.map(async (o) => {
          const ref = o.merchantRef ?? o.orderNumber;
          const courierCode = o.trackingNumber || ref;
          // The courier's barcode AND a QR of our own reference, per contract.
          const qr = await qrSvg(ref, Math.max(18, Math.round(batch.width / 4)));
          return `
      <section class="label">
        <div class="head">
          <strong>${esc(o.deliveryProvider?.name ?? 'شركة الشحن')}</strong>
          <span dir="ltr">${esc(ref)}</span>
        </div>
        <div class="who">
          <p class="name">${esc(o.customer.fullName)}</p>
          <p dir="ltr">${esc(o.customer.rawPhone || o.customer.phone)}</p>
          <p>${esc(o.region?.name ?? o.customer.city)} — ${esc(o.customer.address)}</p>
        </div>
        <ul class="items">
          ${o.items.map((i) => `<li>${esc(i.productName)} × ${i.quantity + i.freeQuantity}</li>`).join('')}
        </ul>
        <div class="cod"><span>المبلغ عند الاستلام</span><strong dir="ltr">${o.totalAmount} ${esc(o.currency)}</strong></div>
        <div class="codes">
          <figure class="barcode">${barcodeSvg(courierCode, batch.width - 32, 14)}<figcaption dir="ltr">${esc(courierCode)}</figcaption></figure>
          <figure class="qr">${qr}<figcaption dir="ltr">${esc(ref)}</figcaption></figure>
        </div>
      </section>`;
        })
      )
    ).join('');

    await db.order.updateMany({ where: { id: { in: orders.map((o) => o.id) } }, data: { labelPrintedAt: new Date() } });

    // How many labels the chosen paper holds, and therefore where the page
    // breaks. A sheet that fits none of them still gets one per page rather
    // than clipping it.
    const pageW = batch.sheetWidth ?? batch.width;
    const pageH = batch.sheetHeight ?? batch.height;
    const across = Math.max(1, Math.floor(pageW / batch.width));
    const down = Math.max(1, Math.floor(pageH / batch.height));
    const perPage = Math.max(1, across * down);

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>بوالص الشحن</title>
<style>
  @page { size: ${pageW}mm ${pageH}mm; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Tahoma, Arial, sans-serif; color: #121926;
         display: flex; flex-wrap: wrap; align-content: flex-start; width: ${pageW}mm; }
  /* On a thermal roll the page IS the label. On office paper as many fit as
     fit, and only the last one on a sheet breaks the page — a run of thirty
     orders used to eat thirty sheets for a quarter of their area each. */
  .label { width: ${batch.width}mm; height: ${batch.height}mm; padding: 4mm;
           display: flex; flex-direction: column; gap: 2mm; border: 1px dashed #ccc; }
  .label:nth-child(${perPage}n) { page-break-after: always; }
  .head { display: flex; justify-content: space-between; align-items: center; font-size: 10pt; border-bottom: 1px solid #000; padding-bottom: 1mm; }
  .who .name { font-size: 12pt; font-weight: bold; margin: 0 0 1mm; }
  .who p { margin: 0; font-size: 9pt; }
  .items { margin: 0; padding: 0 4mm 0 0; font-size: 8pt; }
  .cod { margin-top: auto; display: flex; justify-content: space-between; font-size: 11pt; border-top: 1px solid #000; padding-top: 1mm; }
  .codes { display: flex; gap: 2mm; align-items: flex-end; justify-content: space-between; }
  .codes .barcode { flex: 1; }
  figure { margin: 0; text-align: center; }
  figcaption { font-size: 7pt; letter-spacing: 1px; }
  @media print { .label { border-bottom: none; } }
</style></head>
<body onload="window.print()">${labels}</body></html>`;

    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
