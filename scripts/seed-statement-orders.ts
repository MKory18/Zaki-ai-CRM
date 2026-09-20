/**
 * Builds the صحة بلس orders that the courier statement refers to, so the
 * matching screen can be exercised against the real file.
 *
 * Each order carries the statement's own reference as its merchantRef —
 * which is exactly the real situation: these shipments were created in the
 * courier's system under those numbers, and that is the key matching uses.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { readXlsxRows } from '../src/lib/xlsx-reader';
import { matchRegion } from '../src/lib/regions';
import { refFromNotes } from '../src/lib/settlement';

const db = new PrismaClient();
const FILE = process.argv[2];

const rows = readXlsxRows(readFileSync(FILE));
const header = rows[0];
const col = (n: string) => header.indexOf(n);
const idx = {
  barcode: col('باركود الشحنة'),
  notes: col('الملاحظات'),
  receiver: col('اسم المستلم'),
  phone: col('هاتف المستلم'),
  address: col('عنوان المستلم'),
  region: col('منطقة المستلم'),
  collected: col('التحصيل'),
  fee: col('السعر'),
  status: col('الحالة'),
  contents: col('محتوى الطرد'),
  delivered: col('تاريخ التوصيل'),
};

const data = rows.slice(1).filter((r) => r[idx.barcode]);
console.log(`سطور الكشف: ${data.length}`);

const store = await db.store.findFirst({ where: { slug: 'sehha-plus' }, include: { country: true } });
if (!store) throw new Error('store not found');
const companyId = store.companyId;
const regions = await db.region.findMany({ where: { countryId: store.countryId }, select: { id: true, name: true } });
const moderator = await db.user.findFirst({ where: { companyId, role: 'MODERATOR' } });

// ── products named in the statement ──
const productNames = [...new Set(data.map((r) => String(r[idx.contents] ?? '').replace(/\s*\(الكمية:.*$/, '').trim()).filter(Boolean))];
const productByName = new Map<string, string>();
for (const name of productNames) {
  const existing = await db.product.findFirst({ where: { companyId, name } });
  const p = existing ?? (await db.product.create({
    data: { companyId, name, sku: `SY-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, basePrice: 0, status: 'ACTIVE' },
  }));
  productByName.set(name, p.id);
  // stock, so these can be shipped/prepared like any other order
  const onHand = await db.productionBatch.aggregate({ where: { companyId, productId: p.id }, _sum: { quantityRemaining: true } });
  if ((onHand._sum.quantityRemaining ?? 0) <= 0) {
    await db.productionBatch.create({
      data: {
        companyId, productId: p.id, batchNumber: `SEED-${p.id.slice(0, 8)}`,
        quantityProduced: 500, quantityRemaining: 500, quantitySold: 0,
        costPerUnit: 0, totalProductionCost: 0, status: 'COMPLETED',
      },
    });
  }
}
console.log(`منتجات: ${productByName.size}`);

let created = 0, skipped = 0, seq = 0;
const unmatchedRegions = new Set<string>();

for (const r of data) {
  const ref = refFromNotes(String(r[idx.notes] ?? ''));
  if (!ref) { skipped++; continue; }
  if (await db.order.findFirst({ where: { companyId, merchantRef: ref }, select: { id: true } })) { skipped++; continue; }

  const rawName = String(r[idx.contents] ?? '');
  const productName = rawName.replace(/\s*\(الكمية:.*$/, '').trim();
  const qty = Number(/الكمية:\s*(\d+)/.exec(rawName)?.[1] ?? 1);
  const productId = productByName.get(productName);
  if (!productId) { skipped++; continue; }

  const collected = Number(r[idx.collected] ?? 0);
  const fee = Number(r[idx.fee] ?? 0);
  const statusText = String(r[idx.status] ?? '');
  const isReturned = statusText.includes('إرجاع');

  const regionText = String(r[idx.region] ?? '');
  const region = matchRegion(regions, regionText);
  if (!region) unmatchedRegions.add(regionText);

  const phone = String(r[idx.phone] ?? '').replace(/\D/g, '') || `000${ref}`;
  let customer = await db.customer.findUnique({ where: { companyId_phone: { companyId, phone } } });
  if (!customer) {
    customer = await db.customer.create({
      data: {
        companyId,
        fullName: String(r[idx.receiver] ?? 'عميل').trim() || 'عميل',
        phone, rawPhone: String(r[idx.phone] ?? ''),
        address: String(r[idx.address] ?? '').trim(),
        city: region?.name ?? regionText,
      },
    });
  }

  seq++;
  const orderNumber = `SY-2026-${String(seq).padStart(4, '0')}`;
  const deliveredAt = r[idx.delivered] ? new Date(2026, 8, 16) : null;

  const order = await db.order.create({
    data: {
      companyId, countryId: store.countryId, storeId: store.id, regionId: region?.id ?? null,
      orderNumber,
      merchantRef: ref,                       // the courier's own reference
      trackingNumber: String(r[idx.barcode]), // their barcode
      customerId: customer.id, productId,
      quantity: qty, freeQuantity: 0,
      sellingPrice: collected, totalAmount: collected, deliveryFee: fee,
      shippingCost: fee, currency: 'USD', priceIncludesDelivery: true,
      productNameSnapshot: productName,
      moderatorId: moderator?.id ?? null, moderatorCommission: 0,
      estimatedCostOfGoods: 0,
      status: isReturned ? 'RETURNED' : 'DELIVERED',
      confirmationStatus: 'CONFIRMED',
      shippingStatus: isReturned ? 'RETURNED' : 'DELIVERED',
      settlementStatus: 'PENDING_COLLECTION',
      deliveryProviderId: (await db.deliveryProvider.findFirst({ where: { companyId, code: 'BASHA' } }))?.id ?? null,
      source: 'الشيت',
      shippedAt: new Date(2026, 8, 15),
      deliveredAt: isReturned ? null : deliveredAt,
      returnedAt: isReturned ? new Date(2026, 8, 16) : null,
      returnReason: isReturned ? String(r[idx.notes] ?? '').slice(0, 200) : null,
      version: 1,
    },
  });

  await db.orderItem.create({
    data: {
      companyId, orderId: order.id, productId, productName,
      quantity: qty, freeQuantity: 0,
      unitPrice: qty > 0 ? collected / qty : collected,
      lineTotal: collected, addedStage: 'INTAKE',
    },
  });
  created++;
}

console.log(`طلبات أُنشئت: ${created} | تُخطّيت: ${skipped}`);
if (unmatchedRegions.size) console.log('محافظات بلا مطابقة:', [...unmatchedRegions]);
await db.$disconnect();
