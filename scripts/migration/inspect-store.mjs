#!/usr/bin/env node
// READ-ONLY: what a store already holds before an import is applied — its
// couriers (and who else in the company uses the LEG-* codes), its opening
// count, its stock ledger, its products with on-hand and reserved units,
// and its orders by source and status. Writes nothing.
//
//   node scripts/migration/inspect-store.mjs --store-id <uuid>

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const i = process.argv.indexOf('--store-id');
const storeId = i !== -1 ? process.argv[i + 1] : null;
const log = (...a) => console.log(...a);

async function main() {
  if (!storeId) throw new Error('--store-id <uuid> is required');
  const store = await prisma.store.findUnique({ where: { id: storeId }, include: { country: true } });
  if (!store) throw new Error(`no store ${storeId}`);
  const companyId = store.companyId;
  const stores = await prisma.store.findMany({ where: { companyId }, select: { id: true, name: true, slug: true } });
  const storeName = new Map(stores.map((s) => [s.id, `${s.name} (${s.slug})`]));
  log(`STORE ${store.name} (${store.slug}) ${store.id} · country ${store.country?.code} · priceIncludesDelivery=${store.priceIncludesDelivery}`);

  log('\n== couriers in the company ==');
  const providers = await prisma.deliveryProvider.findMany({ where: { companyId }, orderBy: { code: 'asc' } });
  for (const p of providers) {
    const [orders, fees] = await Promise.all([
      prisma.order.count({ where: { deliveryProviderId: p.id } }),
      prisma.deliveryFee.count({ where: { deliveryProviderId: p.id } }),
    ]);
    const where = p.storeId === storeId ? 'THIS store' : p.storeId ? `other: ${storeName.get(p.storeId) ?? p.storeId}` : 'all stores';
    log(`  ${p.code.padEnd(14)} «${p.name}» · ${where} · ${p.kind} · active=${p.isActive} · orders=${orders} · fees=${fees}`);
  }

  log('\n== opening count ==');
  const count = await prisma.stockOpeningCount.findUnique({ where: { storeId } });
  if (count) {
    const batches = await prisma.productionBatch.count({ where: { openingCountId: count.id } });
    log(`  «${count.countedByName}» · counted ${count.countedAt.toISOString()} · entered ${count.createdAt.toISOString()} · batches=${batches} · note: ${count.note ?? '-'}`);
  } else log('  none');

  log('\n== stock movements in this store ==');
  const mv = await prisma.inventoryMovement.groupBy({ by: ['type'], where: { companyId, storeId }, _count: { _all: true }, _sum: { quantity: true } });
  for (const m of mv) log(`  ${m.type.padEnd(20)} rows=${m._count._all} · units=${m._sum.quantity}`);
  if (!mv.length) log('  none');

  log('\n== products in this store ==');
  const products = await prisma.product.findMany({ where: { companyId, storeId }, select: { id: true, sku: true, name: true, basePrice: true, status: true }, orderBy: { sku: 'asc' } });
  for (const p of products) {
    const [onHand, reserved, orders] = await Promise.all([
      prisma.productionBatch.aggregate({ where: { companyId, storeId, productId: p.id }, _sum: { quantityRemaining: true } }),
      prisma.orderItem.aggregate({ where: { companyId, productId: p.id, reservedQty: { gt: 0 } }, _sum: { reservedQty: true } }),
      prisma.orderItem.count({ where: { productId: p.id } }),
    ]);
    log(`  ${p.sku.padEnd(10)} ${String(p.basePrice).padStart(6)}  on-hand=${String(onHand._sum.quantityRemaining ?? 0).padStart(7)}  reserved=${reserved._sum.reservedQty ?? 0}  lines=${orders}  ${p.status}  «${p.name}»`);
  }

  log('\n== orders in this store ==');
  const bySource = await prisma.order.groupBy({ by: ['source'], where: { companyId, storeId }, _count: { _all: true } });
  for (const g of bySource) log(`  source «${g.source}»: ${g._count._all}`);
  const orders = await prisma.order.findMany({
    where: { companyId, storeId },
    select: { orderNumber: true, source: true, confirmationStatus: true, shippingStatus: true, settlementStatus: true, totalAmount: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 15,
  });
  for (const o of orders) log(`  ${o.orderNumber.padEnd(16)} ${o.createdAt.toISOString().slice(0, 10)} ${o.confirmationStatus}/${o.shippingStatus}/${o.settlementStatus} total=${o.totalAmount} «${o.source}»`);

  log(`\ncustomers in this store: ${await prisma.customer.count({ where: { companyId, storeId } })}`);
  log(`customers in the company with no store: ${await prisma.customer.count({ where: { companyId, storeId: null } })}`);
  log('\nREAD-ONLY — nothing was written.');
}

main()
  .catch((e) => { console.error(e.message || e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
