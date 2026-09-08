/**
 * VISIBILITY + QUEUE TESTS (Steps 2-7 of the bug investigation)
 * Tests the real rbac.applyQueueFilter/orderVisibilityWhere against the real DB.
 * Usage: npx tsx tests/visibility-queue-tests.ts
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();
let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

async function main() {
  const { orderVisibilityWhere, applyQueueFilter } = await import('../src/lib/rbac');
  const { ROLE_PERMISSIONS } = await import('../src/types/auth');
  const mkUser = (role: any, companyId: string | null, id = 'x') =>
    ({ id, email: 't@t', name: 't', role, status: 'ACTIVE', companyId, permissions: (ROLE_PERMISSIONS as any)[role] ?? [] }) as any;
  const applyQ = (q: string, u: any) => applyQueueFilter(u, {}, q);

  // Company A + B
  const coA = await db.company.findFirstOrThrow();
  let coB = await db.company.findFirst({ where: { id: { not: coA.id } } });
  let createdCoB = false;
  if (!coB) { coB = await db.company.create({ data: { name: 'TestCompanyB', currency: 'USD', country: 'US' } }); createdCoB = true; }

  const admin = await db.user.create({ data: { email: `vis-admin-${Date.now()}@test.local`, name: 'Admin', passwordHash: await bcrypt.hash('x', 4), role: 'COMPANY_ADMIN', status: 'ACTIVE', companyId: coA.id } });
  const agentA = await db.user.create({ data: { email: `vis-a-${Date.now()}@test.local`, name: 'AgentA', passwordHash: await bcrypt.hash('x', 4), role: 'CONFIRMATION_AGENT', status: 'ACTIVE', companyId: coA.id } });
  const agentB = await db.user.create({ data: { email: `vis-b-${Date.now()}@test.local`, name: 'AgentB', passwordHash: await bcrypt.hash('x', 4), role: 'CONFIRMATION_AGENT', status: 'ACTIVE', companyId: coA.id } });
  const agentOtherCo = await db.user.create({ data: { email: `vis-c-${Date.now()}@test.local`, name: 'AgentOtherCo', passwordHash: await bcrypt.hash('x', 4), role: 'CONFIRMATION_AGENT', status: 'ACTIVE', companyId: coB.id } });

  const customerA = await db.customer.create({ data: { companyId: coA.id, fullName: 'VA', phone: `09${Date.now()}`.slice(-9), rawPhone: 'VA', address: 'x', city: 'y' } });
  const productA = await db.product.findFirstOrThrow({ where: { companyId: coA.id } });

  // ── Scenario 1: admin creates Order #1 ──
  console.log('\nScenario 1 — Admin creates Order #1 → agents\u2019 AVAILABLE queue');
  const order1 = await db.order.create({
    data: {
      companyId: coA.id, orderNumber: `VIS1-${Date.now()}`, customerId: customerA.id, productId: productA.id,
      sellingPrice: 10, totalAmount: 10, status: 'NEW', confirmationStatus: 'NEW', shippingStatus: 'NOT_READY',
      settlementStatus: 'NOT_APPLICABLE', signatureStatus: 'UNSIGNED', version: 1, moderatorId: admin.id,
    },
  });

  {
    const userA = mkUser('CONFIRMATION_AGENT', coA.id, agentA.id);
    const userB = mkUser('CONFIRMATION_AGENT', coA.id, agentB.id);
    const userAdmin = mkUser('COMPANY_ADMIN', coA.id, admin.id);
    const userOtherCo = mkUser('CONFIRMATION_AGENT', coB.id, agentOtherCo.id);

    const availA = await db.order.count({ where: { companyId: coA.id, ...(applyQ('available', userA) as any), id: order1.id } });
    const availB = await db.order.count({ where: { companyId: coA.id, ...(applyQ('available', userB) as any), id: order1.id } });
    ok('Agent A sees Order #1 in AVAILABLE queue', availA === 1);
    ok('Agent B sees Order #1 in AVAILABLE queue', availB === 1);

    const adminAll = await db.order.count({ where: { companyId: coA.id, ...(applyQ('all_company', userAdmin) as any), id: order1.id } });
    ok('Admin sees Order #1 in ALL_COMPANY queue', adminAll === 1);

    const otherCoCount = await db.order.count({ where: { AND: [{ companyId: coB.id }, orderVisibilityWhere(userOtherCo) as any], id: order1.id } });
    ok('Other-company employee CANNOT see Order #1', otherCoCount === 0);

    // Agent C (other company) requesting all_company → denied by queue guard
    const otherAll = await db.order.count({ where: { companyId: coB.id, ...(applyQ('all_company', userOtherCo) as any), id: order1.id } });
    ok('Other-company all_company queue yields nothing', otherAll === 0);
  }

  // ── Scenario 2: Agent A claims ──
  console.log('\nScenario 2 — Claim → queue transition (atomic)');
  const locks = await import('../src/lib/order-locks');
  const now = new Date();
  const won = await locks.atomicClaim({ orderId: order1.id, userId: agentA.id, now, lockExpiresAt: new Date(now.getTime() + 300000) });
  ok('Agent A claim succeeded', won);

  {
    const userA = mkUser('CONFIRMATION_AGENT', coA.id, agentA.id);
    const userB = mkUser('CONFIRMATION_AGENT', coA.id, agentB.id);

    const bAvailable = await db.order.count({ where: { companyId: coA.id, ...(applyQ('available', userB) as any), id: order1.id } });
    ok('Order #1 DISAPPEARED from Agent B\u2019s AVAILABLE queue', bAvailable === 0);

    const aMyOrders = await db.order.count({ where: { companyId: coA.id, ...(applyQ('my_orders', userA) as any), id: order1.id } });
    ok('Order #1 IS in Agent A\u2019s MY_ORDERS queue', aMyOrders === 1);

    const aProcessing = await db.order.count({ where: { companyId: coA.id, ...(applyQ('processing', userA) as any), id: order1.id } });
    ok('Order #1 IS in Agent A\u2019s PROCESSING queue', aProcessing === 1);

    const bDefault = await db.order.count({ where: { companyId: coA.id, ...(orderVisibilityWhere(userB) as any), id: order1.id } });
    ok('Agent B default view no longer shows the claimed order', bDefault === 0);

    // ── Scenario 3: Agent B direct claim → rejected ──
    const secondClaim = await locks.atomicClaim({ orderId: order1.id, userId: agentB.id, now: new Date(), lockExpiresAt: new Date(Date.now() + 300000) });
    ok('Agent B direct claim REJECTED (already claimed)', !secondClaim);

    // ── Scenario 4: admin still views it ──
    const adminStillSees = await db.order.count({ where: { companyId: coA.id, id: order1.id } });
    ok('Admin STILL views Order #1 after claim', adminStillSees === 1);
  }

  console.log(`\n════════ RESULT: ${pass} passed, ${fail} failed ════════`);
  await cleanup(order1.id);
  await db.user.deleteMany({ where: { id: { in: [admin.id, agentA.id, agentB.id, agentOtherCo.id] } } });
  if (createdCoB) await db.company.delete({ where: { id: coB.id } }).catch(() => {});
  await db.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

async function cleanup(orderId: string) {
  await db.orderActivity.deleteMany({ where: { orderId } });
  await db.orderClaimHistory.deleteMany({ where: { orderId } });
  await db.orderStatusLog.deleteMany({ where: { orderId } });
  await db.auditLog.deleteMany({ where: { entityId: orderId } });
  const o = await db.order.findUnique({ where: { id: orderId } });
  if (o) await db.order.delete({ where: { id: orderId } });
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
