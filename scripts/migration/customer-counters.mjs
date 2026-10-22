#!/usr/bin/env node
// After an import: every customer of the store who has an imported order gets
// their counters recomputed from their orders (lib/customer-counters.mjs), and
// the customers the legacy import brought in WITHOUT a single order are
// removed — the owner's ruling (22/10): the customer list is people who
// ordered, one row each, with how many times they ordered.
//
// A customer is removed only when ALL hold: no order, no WhatsApp
// conversation, no note, and their phone is one the legacy dump holds (so
// nobody this shop added by hand is ever touched).
//
// DRY-RUN by default; --apply writes.
//   LEGACY_DUMP=<dump.sql> node scripts/migration/customer-counters.mjs --store-id <uuid> [--apply]

import { PrismaClient } from '@prisma/client';
import { loadDump, tuples } from './lib/dump.mjs';
import { normPhone } from './lib/legacy-map.mjs';
import { countersFromOrders } from './lib/customer-counters.mjs';

const prisma = new PrismaClient();
const DRY_RUN = !process.argv.includes('--apply');
const IMPORTED = ['Legacy import', 'Sheet import'];
const log = (...a) => console.log(...a);
const i = process.argv.indexOf('--store-id');
const storeId = i !== -1 ? process.argv[i + 1] : null;

async function main() {
  if (!storeId) throw new Error('--store-id <uuid> is required');
  if (!process.env.LEGACY_DUMP) throw new Error('LEGACY_DUMP is required (the legacy phones decide who may be removed)');
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw new Error(`no store ${storeId}`);
  const companyId = store.companyId;
  log(`=== customer counters — ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY (writes!)'} ===`);
  log(`store «${store.name}» (${store.id})`);

  // ── 1. counters for every customer with an imported order ──
  const orders = await prisma.order.findMany({
    where: { companyId, storeId, customer: { orders: { some: { source: { in: IMPORTED } } } } },
    select: { customerId: true, confirmationStatus: true, shippingStatus: true, totalAmount: true, collectedAmount: true, createdAt: true },
  });
  const byCustomer = new Map();
  for (const o of orders) (byCustomer.get(o.customerId) || byCustomer.set(o.customerId, []).get(o.customerId)).push(o);
  const dist = {};
  for (const list of byCustomer.values()) { const k = list.length >= 5 ? '5+' : String(list.length); dist[k] = (dist[k] || 0) + 1; }
  log(`customers with imported orders: ${byCustomer.size} · orders: ${orders.length} · orders per customer: ${JSON.stringify(dist)}`);

  // ── 2. legacy customers with nothing at all ──
  const dump = loadDump(process.env.LEGACY_DUMP);
  const legacyPhones = new Set();
  for (const a of tuples(dump, 'addresses')) { const p = normPhone(a.phone); if (p) legacyPhones.add(p); }
  for (const u of tuples(dump, 'users')) { const p = normPhone(u.phone); if (p) legacyPhones.add(p); }
  const empty = await prisma.customer.findMany({
    where: { companyId, storeId, orders: { none: {} }, whatsappConversations: { none: {} }, notes: null },
    select: { id: true, phone: true },
  });
  const removable = empty.filter((c) => legacyPhones.has(c.phone));
  log(`customers with no order, no conversation, no note: ${empty.length} · of them from the legacy dump (would be removed): ${removable.length} · kept (added here): ${empty.length - removable.length}`);
  const before = await prisma.customer.count({ where: { companyId, storeId } });
  log(`customers now: ${before} · after: ${before - removable.length}`);

  if (DRY_RUN) { log('\n[dry] nothing written. Run again with --apply.'); return; }

  let updated = 0;
  for (const [customerId, list] of byCustomer) {
    await prisma.customer.update({ where: { id: customerId }, data: countersFromOrders(list) });
    updated++;
    if (updated % 2000 === 0) log(`  … ${updated} customers`);
  }
  log(`counters written: ${updated}`);

  let removed = 0;
  for (let k = 0; k < removable.length; k += 500) {
    const ids = removable.slice(k, k + 500).map((c) => c.id);
    // the same three conditions again, inside the delete itself
    const r = await prisma.customer.deleteMany({ where: { id: { in: ids }, orders: { none: {} }, whatsappConversations: { none: {} }, notes: null } });
    removed += r.count;
  }
  log(`customers removed: ${removed}`);

  // ── verify ──
  const after = await prisma.customer.count({ where: { companyId, storeId } });
  const stale = await prisma.customer.count({ where: { companyId, storeId, totalOrders: 0, orders: { some: {} } } });
  const withOrders = await prisma.customer.count({ where: { companyId, storeId, orders: { some: {} } } });
  log(`verify: customers ${after} (with orders ${withOrders}) · customers with orders but a zero counter: ${stale}`);
  if (stale > 0 || after !== before - removed) throw new Error('verification FAILED');
  log('✅ verification passed');
}

main()
  .catch((e) => { console.error(e.message || e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
