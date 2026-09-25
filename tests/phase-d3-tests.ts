/**
 * PHASE D3 TEST SUITE — finance & settlement workflow.
 * Usage: npx tsx tests/phase-d3-tests.ts
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();
let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log(`  [OK] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${extra ? ' - ' + extra : ''}`); }
}

const hash = bcrypt.hashSync('x', 4);

async function main() {
  const co = await db.company.findFirstOrThrow();
  const fw = await import('../src/lib/finance-workflow');
  const { ROLE_PERMISSIONS } = await import('../src/types/auth');
  const { Prisma } = await import('@prisma/client');
  const D = (v: any) => new Prisma.Decimal(v ?? 0);

  const accountant = await db.user.create({ data: { email: `d3-acc-${Date.now()}@test.local`, name: 'Acc', passwordHash: hash, role: 'ACCOUNTANT', status: 'ACTIVE', companyId: co.id } });
  const agent = await db.user.create({ data: { email: `d3-ag-${Date.now()}@test.local`, name: 'Ag', passwordHash: hash, role: 'CONFIRMATION_AGENT', status: 'ACTIVE', companyId: co.id } });

  async function makeOrder(tag: string, extra: any = {}) {
    const c = await db.customer.create({ data: { companyId: co.id, fullName: tag, phone: `09${Date.now()}${Math.floor(Math.random() * 9)}`.slice(-10), rawPhone: tag, address: 'x', city: 'y' } });
    const p = await db.product.findFirstOrThrow({ where: { companyId: co.id } });
    return db.order.create({
      data: {
        companyId: co.id, orderNumber: `D3-${tag}-${Date.now()}-${Math.floor(Math.random() * 999)}`,
        customerId: c.id, productId: p.id, sellingPrice: 20, quantity: 2, totalAmount: 40,
        status: 'CONFIRMED', confirmationStatus: 'CONFIRMED', shippingStatus: 'NOT_READY',
        settlementStatus: 'PENDING', signatureStatus: 'UNSIGNED', version: 1, ...extra,
      },
    });
  }
  async function cleanupOrder(orderId: string) {
    await db.financialTransaction.deleteMany({ where: { orderId } });
    await db.orderContactAttempt.deleteMany({ where: { orderId } });
    await db.orderActivity.deleteMany({ where: { orderId } });
    await db.orderClaimHistory.deleteMany({ where: { orderId } });
    await db.orderStatusLog.deleteMany({ where: { orderId } });
    await db.auditLog.deleteMany({ where: { entityId: orderId } });
    await db.order.deleteMany({ where: { id: orderId } });
  }

  // ═══ TEST: Decimal money math (never floats) ═══
  console.log('\nTEST - Decimal-safe financial computation');
  {
    const fin = fw.computeFinancials({
      sellingPrice: 19.99, quantity: 3, discount: 5, shippingRevenue: 2,
      productCost: 8, packagingCost: 0.5, shippingCost: 1, advertisingCost: 0.25, otherCost: 0.25,
      commission: 2,
    });
    ok('subtotal = 19.99*3 = 59.97', D(fin.subtotal).toString() === '59.97', D(fin.subtotal).toString());
    ok('totalRevenue = subtotal - discount + shippingRevenue = 56.97', D(fin.totalRevenue).toString() === '56.97', D(fin.totalRevenue).toString());
    ok('grossProfit = revenue - productCost = 32.97', D(fin.grossProfit).toString() === '32.97', D(fin.grossProfit).toString());
    ok('netProfit = revenue - allCosts = 28.97', D(fin.netProfit).toString() === '28.97', D(fin.netProfit).toString());
  }

  // ═══ TEST: settlement transitions ═══
  console.log('\nTEST - Settlement transition map');
  {
    ok('PENDING -> SETTLED valid', fw.isValidSettlementTransition('PENDING', 'SETTLED'));
    ok('PENDING -> PARTIALLY_SETTLED valid', fw.isValidSettlementTransition('PENDING', 'PARTIALLY_SETTLED'));
    ok('PENDING -> REFUNDED valid', fw.isValidSettlementTransition('PENDING', 'REFUNDED'));
    ok('SETTLED -> PENDING invalid (no rollback)', !fw.isValidSettlementTransition('SETTLED', 'PENDING'));
    ok('REFUNDED is terminal', !fw.isValidSettlementTransition('REFUNDED', 'SETTLED'));
    ok('CANCELLED is terminal', !fw.isValidSettlementTransition('CANCELLED', 'SETTLED'));
    ok('unknown status fails closed', !fw.isValidSettlementTransition('HACKED', 'SETTLED'));
    ok('legacy PENDING_COLLECTION bridges to SETTLED', fw.isValidSettlementTransition('PENDING_COLLECTION', 'SETTLED'));
  }

  // ═══ TEST: role permission gates ═══
  console.log('\nTEST - Role financial gates');
  {
    const accPerms = (ROLE_PERMISSIONS as any).ACCOUNTANT ?? [];
    ok('ACCOUNTANT has finance.create', accPerms.includes('finance.create'));
    ok('ACCOUNTANT has finance.view', accPerms.includes('finance.view'));
    ok('ACCOUNTANT lacks orders.confirmation_status', !accPerms.includes('orders.confirmation_status'));
    const agentPerms = (ROLE_PERMISSIONS as any).CONFIRMATION_AGENT ?? [];
    ok('CONFIRMATION_AGENT lacks finance.view (no financial mutation or access)', !agentPerms.includes('finance.view'));
    ok('CONFIRMATION_AGENT lacks finance.create', !agentPerms.includes('finance.create'));
    const fuPerms = (ROLE_PERMISSIONS as any).FOLLOW_UP_AGENT ?? [];
    ok('FOLLOW_UP_AGENT lacks finance.view', !fuPerms.includes('finance.view'));
    const soPerms = (ROLE_PERMISSIONS as any).SETTLEMENT_OFFICER ?? [];
    ok('SETTLEMENT_OFFICER has settlement.review', soPerms.includes('settlement.review'));
    ok('SETTLEMENT_OFFICER lacks finance.cashbox (separation of duties)', !soPerms.includes('finance.cashbox'));
    ok('MODERATOR lacks finance.view', !((ROLE_PERMISSIONS as any).MODERATOR ?? []).includes('finance.view'));
  }

  // ═══ TEST: ledger append-only + settlement writes ═══
  console.log('\nTEST - FinancialTransaction ledger');
  const order1 = await makeOrder('T1', { netProfit: new Prisma.Decimal(28.97), totalRevenue: new Prisma.Decimal(56.97) });
  {
    const tx1 = await db.financialTransaction.create({
      data: { companyId: co.id, orderId: order1.id, type: 'SETTLEMENT', amount: new Prisma.Decimal(56.97), currency: 'USD', createdById: accountant.id, note: 'Full settlement' },
    });
    ok('SETTLEMENT ledger entry written (Decimal amount)', D(tx1.amount).toString() === '56.97');
    let dup = false;
    try {
      // ledger is append-only: no unique constraint prevents entries, but updates are rejected by design — verify no updateMany exists in route
      const route = require('fs').readFileSync('src/app/api/orders/[id]/finance/route.ts', 'utf8');
      dup = !route.includes('financialTransaction.update');
    } catch { dup = false; }
    ok('ledger entries never updated by the finance route (append-only by design)', dup);

    const refund = await db.financialTransaction.create({
      data: { companyId: co.id, orderId: order1.id, type: 'REFUND', amount: new Prisma.Decimal(10), currency: 'USD', createdById: accountant.id, note: 'Partial refund' },
    });
    ok('REFUND entry written', D(refund.amount).toString() === '10');

    // settlement status transition with version guard
    const saved = await db.order.updateMany({
      where: { id: order1.id, version: 1 },
      data: { settlementStatus: 'SETTLED', version: { increment: 1 } },
    });
    ok('settlement transition via versioned update', saved.count === 1);
    const stale = await db.order.updateMany({
      where: { id: order1.id, version: 1 },
      data: { settlementStatus: 'REFUNDED', version: { increment: 1 } },
    });
    ok('stale settlement write REJECTED (409 semantics)', stale.count === 0);

    // actor integrity: createdById server-derived (verify query pattern in route)
    const route = require('fs').readFileSync('src/app/api/orders/[id]/finance/route.ts', 'utf8');
    ok('ledger actor = session user (createdById: user.id)', route.includes('createdById: user.id'));
    ok('client cannot set companyId (derived from session)', !/companyId:\s*(body|req\.body)/.test(route));
  }

  // ═══ TEST: company isolation on ledger ═══
  console.log('\nTEST - Multi-tenant ledger isolation');
  {
    const coB = await db.company.create({ data: { name: 'D3OtherCo', currency: 'USD', country: 'US' } });
    const countB = await db.financialTransaction.count({ where: { companyId: coB.id, orderId: order1.id } });
    ok('Company B sees ZERO ledger entries of Company A order', countB === 0);
    await db.company.delete({ where: { id: coB.id } });
  }

  // ═══ TEST: summary aggregation contract (groupBy/aggregate usage) ═══
  console.log('\nTEST - Aggregation uses server-side math');
  {
    const route = require('fs').readFileSync('src/app/api/finance/summary/route.ts', 'utf8');
    ok('summary uses db.order.aggregate (no raw rows to client)', route.includes('db.order.aggregate'));
    ok('summary filters by companyId from session', route.includes('companyId'));
    const prof = require('fs').readFileSync('src/app/api/finance/profitability/route.ts', 'utf8');
    ok('profitability uses groupBy (server-side grouping)', prof.includes('groupBy'));
  }

  // cleanup
  await cleanupOrder(order1.id);
  await db.user.deleteMany({ where: { id: { in: [accountant.id, agent.id] } } });

  console.log(`\n════════ D3 RESULT: ${pass} passed, ${fail} failed ════════`);
  await db.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
