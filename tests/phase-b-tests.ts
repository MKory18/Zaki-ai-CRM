/**
 * PHASE B TEST SUITE — runs against the real DB + rbac/order-locks engines.
 * Covers the 8 mandated scenarios (claim race, locks, heartbeat, 409, override).
 * Usage: npx tsx tests/phase-b-tests.ts
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();
let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

async function makeUser(name: string, role: string, companyId: string | null) {
  const hash = await bcrypt.hash('test_pw_123', 4);
  return db.user.create({
    data: {
      email: `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.local`,
      name, passwordHash: hash, role, status: 'ACTIVE', companyId,
    },
  });
}

async function makeOrder(companyId: string, num: string) {
  const customer = await db.customer.create({
    data: { companyId, fullName: num, phone: `09${Date.now()}`.slice(-9), rawPhone: num, address: 'x', city: 'y' },
  });
  const product = await db.product.findFirstOrThrow({ where: { companyId } });
  return db.order.create({
    data: { companyId, orderNumber: `${num}-${Date.now()}`, customerId: customer.id, productId: product.id, sellingPrice: 10, totalAmount: 10 },
  });
}

async function cleanupOrder(id: string) {
  await db.orderActivity.deleteMany({ where: { orderId: id } });
  await db.orderClaimHistory.deleteMany({ where: { orderId: id } });
  await db.orderStatusLog.deleteMany({ where: { orderId: id } });
  await db.auditLog.deleteMany({ where: { entityId: id } });
  await db.order.delete({ where: { id } });
}

async function main() {
  const company = await db.company.findFirstOrThrow();
  const locks = await import('../src/lib/order-locks');
  const { can } = await import('../src/lib/rbac');
  const { ROLE_PERMISSIONS } = await import('../src/types/auth');
  const mk = (role: any, status = 'ACTIVE') => ({
    id: 'x', email: 't@t', name: 't', role, status, companyId: company.id,
    permissions: (ROLE_PERMISSIONS as any)[role] ?? [],
  }) as any;

  // ═══ TEST 1 ═══
  console.log('\nTEST 1 — Atomic claim race (two users, one order)');
  {
    const a = await makeUser('agentA', 'CONFIRMATION_AGENT', company.id);
    const b = await makeUser('agentB', 'CONFIRMATION_AGENT', company.id);
    const order = await makeOrder(company.id, 'T1');
    const now = new Date();
    const [winA, winB] = await Promise.all([
      locks.atomicClaim({ orderId: order.id, userId: a.id, now, lockExpiresAt: new Date(now.getTime() + 300000) }),
      locks.atomicClaim({ orderId: order.id, userId: b.id, now, lockExpiresAt: new Date(now.getTime() + 300000) }),
    ]);
    ok('only ONE concurrent claim succeeds', winA !== winB, `a=${winA} b=${winB}`);
    const fresh = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    ok('claimedById = the winner only', fresh.claimedById === (winA ? a.id : b.id));
    ok('signature SIGNED by winner', fresh.signatureStatus === 'SIGNED' && fresh.signedById === fresh.claimedById);
    ok('currentOwnerId = winner', fresh.currentOwnerId === fresh.claimedById);
    await cleanupOrder(order.id); await db.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  }

  // ═══ TEST 2 ═══
  console.log('\nTEST 2 — Editing lock blocks second user');
  {
    const a = await makeUser('uA', 'MANAGER', company.id);
    const b = await makeUser('uB', 'MANAGER', company.id);
    const order = await makeOrder(company.id, 'T2');
    const now = new Date();
    const gotA = await locks.atomicAcquireLock({ orderId: order.id, userId: a.id, lockedAt: now, lockExpiresAt: new Date(now.getTime() + 300000) });
    const gotB = await locks.atomicAcquireLock({ orderId: order.id, userId: b.id, lockedAt: now, lockExpiresAt: new Date(now.getTime() + 300000) });
    ok('A acquires lock', gotA);
    ok('B is blocked while A holds it', !gotB);
    const fresh = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    ok('lock still held by A', fresh.lockedById === a.id);
    await cleanupOrder(order.id); await db.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  }

  // ═══ TEST 3 ═══
  console.log('\nTEST 3 — Heartbeat extends own lock');
  {
    const a = await makeUser('uA', 'MANAGER', company.id);
    const order = await makeOrder(company.id, 'T3');
    const now = new Date();
    await locks.atomicAcquireLock({ orderId: order.id, userId: a.id, lockedAt: now, lockExpiresAt: new Date(now.getTime() + 5000) });
    const renewed = await locks.atomicRenewLock({ orderId: order.id, userId: a.id, from: new Date(), lockExpiresAt: new Date(Date.now() + 300000) });
    ok('heartbeat renews own lock', renewed);
    const fresh = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    ok('lockExpiresAt extended', fresh.lockExpiresAt!.getTime() > Date.now() + 200000);
    await cleanupOrder(order.id); await db.user.delete({ where: { id: a.id } });
  }

  // ═══ TEST 4 ═══
  console.log('\nTEST 4 — Foreign heartbeat denied');
  {
    const a = await makeUser('uA', 'MANAGER', company.id);
    const b = await makeUser('uB', 'MANAGER', company.id);
    const order = await makeOrder(company.id, 'T4');
    const now = new Date();
    await locks.atomicAcquireLock({ orderId: order.id, userId: a.id, lockedAt: now, lockExpiresAt: new Date(now.getTime() + 300000) });
    const renewed = await locks.atomicRenewLock({ orderId: order.id, userId: b.id, from: new Date(), lockExpiresAt: new Date(Date.now() + 300000) });
    ok('foreign heartbeat DENIED', !renewed);
    const fresh = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    ok('lock still owned by A', fresh.lockedById === a.id);
    await cleanupOrder(order.id); await db.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  }

  // ═══ TEST 5 ═══
  console.log('\nTEST 5 — Lock expiration frees the order');
  {
    const a = await makeUser('uA', 'MANAGER', company.id);
    const b = await makeUser('uB', 'MANAGER', company.id);
    const order = await makeOrder(company.id, 'T5');
    const now = new Date();
    await locks.atomicAcquireLock({ orderId: order.id, userId: a.id, lockedAt: now, lockExpiresAt: new Date(now.getTime() + 300000) });
    const blockedB = await locks.atomicAcquireLock({ orderId: order.id, userId: b.id, lockedAt: now, lockExpiresAt: new Date(now.getTime() + 300000) });
    ok('B blocked while A lock active', !blockedB);
    await db.order.update({ where: { id: order.id }, data: { lockExpiresAt: new Date(Date.now() - 1000) } });
    const gotB = await locks.atomicAcquireLock({ orderId: order.id, userId: b.id, lockedAt: new Date(), lockExpiresAt: new Date(Date.now() + 300000) });
    ok('B acquires AFTER expiry (server-time based)', gotB);
    const fresh = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    ok('lock now held by B', fresh.lockedById === b.id);
    await cleanupOrder(order.id); await db.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  }

  // ═══ TEST 6 ═══
  console.log('\nTEST 6 — Optimistic concurrency (409 semantics)');
  {
    const order = await makeOrder(company.id, 'T6');
    await db.order.update({ where: { id: order.id }, data: { version: 5 } });
    // A loaded version 5. B saves first with the same (still-current) version → succeeds → v=6
    const bWrite = await locks.atomicVersionedUpdate({ orderId: order.id, expectedVersion: 5, data: { internalNotes: 'B v6' } });
    ok('B\u2019s fresh write (v5) succeeds & increments', bWrite);
    const afterB = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    ok('version incremented to 6', afterB.version === 6, `v=${afterB.version}`);
    // A now tries to save with his old version 5 → must be rejected (409 semantics)
    const aStaleWrite = await locks.atomicVersionedUpdate({ orderId: order.id, expectedVersion: 5, data: { internalNotes: 'A stale' } });
    ok('A\u2019s stale save REJECTED (would be HTTP 409)', !aStaleWrite);
    const fresh = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    ok('data is B\u2019s, never silently overwritten', fresh.internalNotes === 'B v6' && fresh.version === 6, `v=${fresh.version} notes=${fresh.internalNotes}`);
    await cleanupOrder(order.id);
  }

  // ═══ TEST 7 + 8: permission matrix gates ═══
  console.log('\nTEST 7/8 — Role permission gates');
  ok('TEST 8: ACCOUNTANT denied orders.confirmation_status', !can(mk('ACCOUNTANT'), 'orders.confirmation_status'));
  ok('TEST 9: SETTLEMENT_OFFICER denied finance.cashbox', !can(mk('SETTLEMENT_OFFICER'), 'finance.cashbox'));
  ok('TEST 7: PENDING_USER denied orders.claim', !can(mk('PENDING_USER', 'PENDING'), 'orders.claim'));
  ok('MODERATOR denied finance.view (separation of duties)', !can(mk('MODERATOR'), 'finance.view'));
  ok('CONFIRMATION_AGENT denied finance.view', !can(mk('CONFIRMATION_AGENT'), 'finance.view'));
  ok('CONFIRMATION_AGENT denied orders.update (any)', !can(mk('CONFIRMATION_AGENT'), 'orders.update'));
  ok('DELIVERY_MANAGER denied confirmation status (Decision 4)', !can(mk('DELIVERY_MANAGER'), 'orders.confirmation_status'));
  ok('SETTLEMENT_OFFICER denied confirmation status', !can(mk('SETTLEMENT_OFFICER'), 'orders.confirmation_status'));
  ok('SUPER_ADMIN can unlock (override)', can(mk('SUPER_ADMIN'), 'orders.unlock'));
  ok('SUSPENDED user denied everything', !can(mk('MODERATOR', 'SUSPENDED'), 'orders.claim'));

  console.log(`\n════════ RESULT: ${pass} passed, ${fail} failed ════════`);
  await db.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
