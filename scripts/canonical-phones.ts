/**
 * Rewrites stored customer phones into the one canonical form.
 *
 *   npx tsx scripts/canonical-phones.ts            report only, changes nothing
 *   npx tsx scripts/canonical-phones.ts --apply    write it
 *
 * customers.phone was written by an Egypt-specific normaliser while the
 * blacklist matched on canonicalPhone. Two functions, two answers, one
 * number — so the same person could exist twice, and a blocked number could
 * be searched for in a form the customer table never used.
 *
 * Two customers can canonicalise onto one number. That is not a conflict to
 * resolve arbitrarily: it is the same person recorded twice, so their orders
 * are moved onto the older record and the newer shell is removed. The older
 * one is kept because it carries the customer's history — counters, first
 * order date — and the shell by definition does not.
 *
 * `rawPhone` is never touched: the number as the customer typed it is what
 * we show back to them, and it is also what makes this reversible.
 */
import { config } from 'dotenv';
config();

import { db } from '../src/lib/db';
import { canonicalPhone } from '../src/lib/phone-rules';

const apply = process.argv.includes('--apply');

async function main() {
  const customers = await db.customer.findMany({
    select: {
      id: true, companyId: true, fullName: true, phone: true, rawPhone: true,
      createdAt: true, totalOrders: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const groups = new Map<string, typeof customers>();
  for (const c of customers) {
    const canon = canonicalPhone(c.rawPhone || c.phone);
    if (!canon) continue;
    const key = `${c.companyId}|${canon}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }

  const rewrites = customers.filter((c) => canonicalPhone(c.rawPhone || c.phone) !== c.phone).length;
  const merges = [...groups.values()].filter((g) => g.length > 1);

  console.log(`عملاء: ${customers.length}`);
  console.log(`أرقام سيتغيّر تخزينها: ${rewrites}`);
  console.log(`مجموعات ستُدمج: ${merges.length}`);
  for (const group of merges) {
    const [keep, ...rest] = group;
    console.log(
      `   ${canonicalPhone(keep.rawPhone || keep.phone)} — يبقى «${keep.fullName}» ` +
        `ويُدمج فيه: ${rest.map((r) => `«${r.fullName}» (${r.phone})`).join(', ')}`
    );
  }

  if (!apply) {
    console.log('\nتقرير فقط — أعد التشغيل بـ --apply للكتابة.');
    await db.$disconnect();
    return;
  }

  let merged = 0;
  let written = 0;

  for (const [key, group] of groups) {
    const canon = key.split('|')[1];
    // Oldest first (the query is ordered), so the first carries the history.
    const [keep, ...duplicates] = group;

    for (const dup of duplicates) {
      await db.$transaction(async (tx) => {
        await tx.order.updateMany({ where: { customerId: dup.id }, data: { customerId: keep.id } });
        await tx.customer.delete({ where: { id: dup.id } });
      });
      merged++;
    }

    // Recount from the orders now attached, rather than adding two stale
    // counters together.
    const totalOrders = await db.order.count({ where: { customerId: keep.id } });
    const deliveredOrders = await db.order.count({
      where: { customerId: keep.id, shippingStatus: { in: ['DELIVERED', 'PARTIALLY_DELIVERED'] } },
    });
    const cancelledOrders = await db.order.count({
      where: { customerId: keep.id, confirmationStatus: { in: ['CANCELLED', 'REJECTED'] } },
    });

    if (keep.phone !== canon || duplicates.length > 0) {
      await db.customer.update({
        where: { id: keep.id },
        data: { phone: canon, totalOrders, deliveredOrders, cancelledOrders },
      });
      written++;
    }
  }

  console.log(`\nعملاء دُمجوا: ${merged}`);
  console.log(`سجلات كُتبت: ${written}`);
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error('فشل التحويل:', error);
  await db.$disconnect();
  process.exit(1);
});
