#!/usr/bin/env node
// Orders the owner hands over as a sheet — already confirmed and already with
// the courier — into an existing store, the way this system would hold them
// had they been confirmed and shipped here.
//
// The first use: «طلبات سوريا 19-10 / 20-10» (301 orders), shipped after the
// opening count was taken, so they come in HOLDING their reservation and the
// delivery takes their units out of that count. (The legacy orders that left
// BEFORE the count are the opposite case — see outsideTheCount in
// src/lib/stock-consumption.ts.)
//
// Safety rules, the same as run.mjs:
//  - DRY-RUN by default. Nothing is written unless --apply is passed.
//  - Idempotent: the sheet's order number is the order number and the
//    merchant reference, and an order that exists is skipped.
//  - The store is named explicitly; nothing is guessed. A courier, region or
//    product the sheet names that the store does not have STOPS the run.
//  - The sheet itself (customer data) is never committed: it is converted to
//    JSON on the owner's machine and handed to --file.
//
// Usage:
//   node scripts/migration/import-sheet-orders.mjs --store-id <uuid> --file <orders.json>          # dry-run
//   node scripts/migration/import-sheet-orders.mjs --store-id <uuid> --file <orders.json> --apply  # writes!
//
// JSON: [{ orderNumber, date: "YYYY-MM-DD", customerName, phone, address,
//          region, shippingCompany, total, lines: [{ product, quantity }] }]
// `total` is what the customer pays at the door, delivery INCLUDED.

import fs from 'fs';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { normPhone, priceLines } from './lib/legacy-map.mjs';

const prisma = new PrismaClient();
const DRY_RUN = !process.argv.includes('--apply');
const SOURCE = 'Sheet import';
// the same aliases run.mjs links legacy couriers by
const PROVIDER_ALIASES = { 'الباشا': 'BASHA' };

function argVal(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : null;
}
const log = (...a) => console.log(...a);
const problems = [];
const warnings = [];
const stop = (msg) => { problems.push(msg); log('  ❌', msg); };
const warn = (msg) => { warnings.push(msg); log('  ⚠', msg); };

async function main() {
  const storeId = argVal('--store-id');
  const file = argVal('--file');
  if (!storeId || !file) throw new Error('--store-id <uuid> and --file <orders.json> are both required');
  log(`=== sheet orders — ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY (writes!)'} ===`);

  const sheet = JSON.parse(fs.readFileSync(file, 'utf8'));
  const store = await prisma.store.findUnique({ where: { id: storeId }, include: { country: true } });
  if (!store) throw new Error(`no store with id ${storeId} — refusing to import into a guess`);
  const companyId = store.companyId;
  const minorUnit = store.country?.minorUnit ?? 2;
  log(`store «${store.name}» (${store.id}) · country ${store.country?.code} · ${sheet.length} orders in ${file}`);

  // ── what the sheet names, resolved against THIS store ──
  const providers = await prisma.deliveryProvider.findMany({ where: { companyId, OR: [{ storeId }, { storeId: null }] } });
  const providerFor = new Map();
  for (const name of new Set(sheet.map((o) => o.shippingCompany))) {
    const p = providers.find((x) => x.name === name) || providers.find((x) => x.code === PROVIDER_ALIASES[name]);
    if (p) { providerFor.set(name, p); log(`  courier «${name}» → «${p.name}» (${p.code})`); } else stop(`courier «${name}» is not a courier of this store`);
  }
  const regions = await prisma.region.findMany({ where: { countryId: store.countryId } });
  const regionFor = new Map(regions.map((r) => [r.name, r]));
  for (const name of new Set(sheet.map((o) => o.region))) if (!regionFor.has(name)) stop(`region «${name}» is not a region of ${store.country?.code}`);
  const products = await prisma.product.findMany({ where: { companyId, storeId }, select: { id: true, name: true, basePrice: true } });
  const productFor = new Map(products.map((p) => [p.name.trim(), p]));
  for (const name of new Set(sheet.flatMap((o) => o.lines.map((l) => l.product)))) if (!productFor.has(name)) stop(`product «${name}» is not a product of this store`);
  const fees = await prisma.deliveryFee.findMany({ where: { companyId, deliveryProviderId: { in: providers.map((p) => p.id) } } });
  const feeFor = new Map(fees.map((f) => [`${f.deliveryProviderId}|${f.regionId}`, Number(f.fee)]));

  // ── every order, checked before anything is written ──
  const seenNumbers = new Set();
  for (const o of sheet) {
    if (seenNumbers.has(o.orderNumber)) stop(`order number ${o.orderNumber} appears twice`);
    seenNumbers.add(o.orderNumber);
    if (!normPhone(o.phone)) stop(`${o.orderNumber}: no usable phone`);
    if (!(o.total > 0)) stop(`${o.orderNumber}: total ${o.total} is not a positive amount`);
    if (!o.lines.length || o.lines.some((l) => !(l.quantity > 0))) stop(`${o.orderNumber}: a line without a quantity`);
    if (Number.isNaN(new Date(`${o.date}T00:00:00Z`).getTime())) stop(`${o.orderNumber}: date ${o.date} is not a date`);
  }
  const existing = new Set((await prisma.order.findMany({ where: { companyId, orderNumber: { in: [...seenNumbers] } }, select: { orderNumber: true } })).map((o) => o.orderNumber));
  const refTaken = new Set((await prisma.order.findMany({ where: { companyId, merchantRef: { in: [...seenNumbers] } }, select: { merchantRef: true } })).map((o) => o.merchantRef));
  const fresh = sheet.filter((o) => !existing.has(o.orderNumber));
  for (const o of fresh) if (refTaken.has(o.orderNumber)) stop(`${o.orderNumber}: another order already carries this merchant reference`);

  // ── what the reservation will hold, against what is on the shelf ──
  const units = new Map();
  for (const o of fresh) for (const l of o.lines) units.set(l.product, (units.get(l.product) || 0) + l.quantity);
  log('reservation these orders would hold (units):');
  for (const [name, q] of units) {
    const p = productFor.get(name);
    const onHand = p ? Number((await prisma.productionBatch.aggregate({ where: { companyId, storeId, productId: p.id }, _sum: { quantityRemaining: true } }))._sum.quantityRemaining || 0) : 0;
    log(`  ${name.padEnd(40)} ${String(q).padStart(5)}  · on the shelf now ${onHand}`);
    if (p && onHand > 0 && q > onHand) warn(`${name}: ${q} reserved against ${onHand} on the shelf`);
  }
  const noFee = fresh.filter((o) => {
    const p = providerFor.get(o.shippingCompany); const r = regionFor.get(o.region);
    return p && r && !feeFor.has(`${p.id}|${r.id}`);
  });
  if (noFee.length) warn(`${noFee.length} order(s) whose courier has no fee for the region — delivery fee left empty: ${noFee.map((o) => `${o.orderNumber} (${o.shippingCompany}/${o.region})`).join(', ')}`);
  const byCourier = {};
  for (const o of fresh) byCourier[o.shippingCompany] = (byCourier[o.shippingCompany] || 0) + 1;
  log(`orders: ${sheet.length} in the sheet · ${existing.size} already here (skipped) · ${fresh.length} to create · by courier ${JSON.stringify(byCourier)}`);
  log(`money: ${fresh.reduce((s, o) => s + o.total, 0).toFixed(2)} ${store.country?.currencyCode ?? ''} at the door, delivery included`);

  if (problems.length) throw new Error(`${problems.length} problem(s) — nothing written`);
  if (DRY_RUN) { log('\n[dry] nothing written. Run again with --apply to create them.'); return; }

  // ── write ──
  const custRows = await prisma.customer.findMany({ where: { companyId, storeId }, select: { id: true, phone: true } });
  const customerFor = new Map(custRows.map((c) => [c.phone, c.id]));
  let created = 0, newCustomers = 0;
  for (const o of fresh) {
    const phone = normPhone(o.phone);
    const region = regionFor.get(o.region);
    const provider = providerFor.get(o.shippingCompany);
    const at = new Date(`${o.date}T09:00:00Z`);
    const fee = feeFor.get(`${provider.id}|${region.id}`) ?? null;
    const lines = priceLines(o.total, o.lines.map((l) => {
      const p = productFor.get(l.product);
      return { productId: p.id, productName: p.name, basePrice: Number(p.basePrice) || 0, quantity: l.quantity };
    }), minorUnit);

    await prisma.$transaction(async (tx) => {
      let customerId = customerFor.get(phone);
      if (!customerId) {
        const c = await tx.customer.create({ data: { companyId, storeId, fullName: o.customerName || phone, phone, rawPhone: o.phone, address: o.address || '', city: o.region, country: store.country?.code ?? 'SY' } });
        customerId = c.id; customerFor.set(phone, c.id); newCustomers++;
      }
      await tx.order.create({
        data: {
          id: crypto.randomUUID(), companyId, storeId, countryId: store.countryId,
          orderNumber: o.orderNumber, merchantRef: o.orderNumber,
          customerId, productId: lines[0].productId, productNameSnapshot: lines[0].productName,
          quantity: lines.reduce((s, l) => s + l.quantity, 0),
          // delivery-inclusive, as the manual door writes it: the lines ARE
          // the price, COD is their sum, and the courier's fee comes out of
          // the revenue rather than on top of the parcel
          sellingPrice: o.total, totalAmount: o.total, shippingCost: fee ?? 0, deliveryFee: fee,
          priceIncludesDelivery: true, currency: store.country?.currencyCode ?? 'USD',
          status: 'SHIPPED', confirmationStatus: 'CONFIRMED', shippingStatus: 'SHIPPED', settlementStatus: 'PENDING',
          confirmedAt: at, shippedAt: at,
          deliveryProviderId: provider.id, regionId: region.id, deliveryAddress: o.address || null,
          source: SOURCE, signatureStatus: 'UNSIGNED', version: 1,
          createdAt: at, updatedAt: at,
          items: {
            create: lines.map((l) => ({
              id: crypto.randomUUID(), companyId, productId: l.productId, productName: l.productName,
              quantity: l.quantity, unitPrice: l.unitPrice, discountShare: 0, lineTotal: l.lineTotal,
              // shipped after the opening count: the units are the count's,
              // held for this parcel until the door takes them
              reservedQty: l.quantity,
              createdAt: at,
            })),
          },
        },
      });
    });
    created++;
  }
  log(`orders created: ${created} | new customers: ${newCustomers}`);

  // ── verify: the rows this run is answerable for ──
  const mine = await prisma.order.findMany({ where: { companyId, storeId, orderNumber: { in: [...seenNumbers] } }, select: { totalAmount: true, shippingStatus: true, items: { select: { quantity: true, reservedQty: true, lineTotal: true } } } });
  const sumTotal = mine.reduce((s, o) => s + Number(o.totalAmount), 0);
  const sumLines = mine.reduce((s, o) => s + o.items.reduce((t, i) => t + Number(i.lineTotal), 0), 0);
  const unreserved = mine.flatMap((o) => o.items).filter((i) => i.reservedQty !== i.quantity).length;
  const sheetTotal = sheet.reduce((s, o) => s + o.total, 0);
  const ok = mine.length === sheet.length && Math.abs(sumTotal - sheetTotal) < 0.01 && Math.abs(sumLines - sheetTotal) < 0.01 && unreserved === 0;
  log(`verify: ${mine.length}/${sheet.length} orders · totals ${sumTotal.toFixed(2)} / sheet ${sheetTotal.toFixed(2)} · lines ${sumLines.toFixed(2)} · unreserved lines ${unreserved}`);
  if (!ok) throw new Error('verification FAILED — counts, money or reservations disagree');
  log('✅ verification passed');
}

main()
  .catch((e) => { console.error(e.message || e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
