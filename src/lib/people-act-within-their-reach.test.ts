import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/types/auth';

/**
 * WHAT ONE PERSON MAY DO TO ANOTHER PERSON'S ACCOUNT — AND TO A MACHINE'S.
 *
 * Found by the permissions audit and checked against the code:
 *
 *   · «تعديل المستخدمين» suspended, signed out, deleted, re-roled or
 *     re-permissioned ANY account — a manager could DENY the company admin
 *     «المالية». You may now act only on an account whose role you could
 *     have given (canActOnUser).
 *   · Removing a «منع» gave the key back and asked nothing (denyRemovalRefusal).
 *   · A CATEGORY/SPECIFIC grant passed on the scope's NAME, any ids at all;
 *     and role doors stored ids from other companies and scopes a key does
 *     not offer (granterHoldsAll ids, roleScopeRefusal).
 *   · «تثبيت التطبيقات» minted an API key that reads customers and costs
 *     whether or not the minter could (scopeBeyondMinter).
 *   · The audit log handed every salary and payslip to «سجل التدقيق»
 *     (withoutPay).
 *
 * Each is tested both ways: refused without, allowed with.
 */

const { db } = vi.hoisted(() => ({
  db: {
    rolePermission: { findMany: vi.fn() },
    role: { findFirst: vi.fn() },
    category: { count: vi.fn() },
    product: { count: vi.fn() },
  },
}));
vi.mock('@/lib/db', () => ({ db }));

import { attachGrants } from './authorization';
import { canActOnUser, denyRemovalRefusal, granterHoldsAll, roleScopeRefusal } from './user-permissions';
import { scopeBeyondMinter } from './v1/token-granter';
import { withoutPay } from './audit-pay-redact';

type Grant = { scope: string; scopeIds?: string[] };
function person(grants: Record<string, Grant | string>, role = 'CUSTOM', id = 'actor'): SessionUser {
  const u = { id, role, status: 'ACTIVE', companyId: 'c1', email: 'a@x', name: 'أ' } as unknown as SessionUser;
  return attachGrants(u, {
    fullAccess: role === 'SUPER_ADMIN',
    grants: Object.fromEntries(
      Object.entries(grants).map(([k, g]) => [k, typeof g === 'string' ? { scope: g } : g]),
    ) as never,
  });
}

beforeEach(() => vi.clearAllMocks());

describe('acting on another account', () => {
  const MANAGER = person({ 'users.edit': 'ALL_COMPANY', 'orders.view': 'ALL_COMPANY', 'orders.edit': 'ALL_COMPANY' });
  const roleWith = (keys: string[]) => db.rolePermission.findMany.mockResolvedValue(keys.map((permission) => ({ permission, scope: 'ALL_COMPANY', scopeIds: null })));

  it('refuses an account whose role carries a key the actor lacks — the manager cannot suspend the company admin', async () => {
    roleWith(['orders.view', 'finance.view', 'users.edit']);
    const r = await canActOnUser(MANAGER, { id: 'admin', roleId: 'r-admin', role: 'COMPANY_ADMIN' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it('allows an account whose role the actor could have given', async () => {
    roleWith(['orders.view', 'orders.edit']);
    expect((await canActOnUser(MANAGER, { id: 'agent', roleId: 'r-agent', role: 'CONFIRMATION_AGENT' })).ok).toBe(true);
  });

  it('a role with only the shift-work keys is anyone’s to act on, as it is anyone’s to give', async () => {
    roleWith(['confirmation.pull', 'confirmation.work', 'confirmation.issues']);
    expect((await canActOnUser(MANAGER, { id: 'agent', roleId: 'r', role: 'X' })).ok).toBe(true);
  });

  it('an account with no role row is judged by the system template the engine would give it', async () => {
    db.role.findFirst.mockResolvedValue({ id: 'sys-warehouse' });
    roleWith(['inventory.adjust']);
    const r = await canActOnUser(MANAGER, { id: 'w', roleId: null, role: 'WAREHOUSE' });
    expect(db.role.findFirst.mock.calls[0][0].where).toEqual({ companyId: null, name: 'WAREHOUSE' });
    expect(r.ok).toBe(false);
  });

  it('oneself and the owner are not held by it', async () => {
    roleWith(['finance.view']);
    expect((await canActOnUser(MANAGER, { id: 'actor', roleId: 'r', role: 'X' })).ok).toBe(true);
    expect((await canActOnUser(person({}, 'SUPER_ADMIN'), { id: 'admin', roleId: 'r', role: 'COMPANY_ADMIN' })).ok).toBe(true);
  });
});

describe('removing a «منع»', () => {
  it('is granting: refused without the key at full scope, allowed with it', () => {
    expect(denyRemovalRefusal(person({ 'users.edit': 'ALL_COMPANY' }), ['finance.view'])).toMatch(/منع/);
    expect(denyRemovalRefusal(person({ 'finance.view': 'OWN' }), ['finance.view'])).not.toBeNull();
    expect(denyRemovalRefusal(person({ 'finance.view': 'ALL_COMPANY' }), ['finance.view'])).toBeNull();
  });

  it('the shift-work keys are exempt, as they are for an ALLOW', () => {
    expect(denyRemovalRefusal(person({}), ['confirmation.pull'])).toBeNull();
  });
});

describe('category and product scopes', () => {
  const EDITOR = person({ 'products.edit': { scope: 'SPECIFIC', scopeIds: ['p1'] } });

  it('below full scope, the ids given must be among the ids held', () => {
    expect(granterHoldsAll(EDITOR, [{ permission: 'products.edit', scope: 'SPECIFIC', scopeIds: ['p1', 'p2'] }])).toMatch(/أوسع/);
    expect(granterHoldsAll(EDITOR, [{ permission: 'products.edit', scope: 'SPECIFIC', scopeIds: ['p1'] }])).toBeNull();
    const FULL = person({ 'products.edit': 'ALL_COMPANY' });
    expect(granterHoldsAll(FULL, [{ permission: 'products.edit', scope: 'SPECIFIC', scopeIds: ['p1', 'p2'] }])).toBeNull();
  });

  it('a role refuses ids of another company, and a scope the key does not offer', async () => {
    db.category.count.mockResolvedValue(1);
    expect(await roleScopeRefusal('c1', [{ permission: 'products.view', scope: 'CATEGORY', scopeIds: ['cat-1', 'cat-other'] }])).toMatch(/شركة أخرى/);
    db.category.count.mockResolvedValue(2);
    expect(await roleScopeRefusal('c1', [{ permission: 'products.view', scope: 'CATEGORY', scopeIds: ['cat-1', 'cat-2'] }])).toBeNull();
    expect(await roleScopeRefusal('c1', [{ permission: 'customers.view', scope: 'CATEGORY', scopeIds: [] }])).toMatch(/غير متاح/);
  });
});

describe('an API key for another program', () => {
  it('cannot open more than its minter holds', () => {
    const APPS_ONLY = person({ 'apps.manage': 'ALL_COMPANY', 'products.view': 'ALL_COMPANY' });
    expect(scopeBeyondMinter(APPS_ONLY, ['products.read'])).toBeNull();
    expect(scopeBeyondMinter(APPS_ONLY, ['products.costs.read'])).toEqual({ scope: 'products.costs.read', key: 'finance.view' });
    expect(scopeBeyondMinter(APPS_ONLY, ['customers.lookup'])?.key).toBe('customers.view');
  });

  it('a person who sees only their own orders cannot mint a key that reads everybody’s', () => {
    const OWN = person({ 'orders.view': 'OWN' });
    expect(scopeBeyondMinter(OWN, ['orders.read'])).toEqual({ scope: 'orders.read', key: 'orders.view' });
    expect(scopeBeyondMinter(person({ 'orders.view': 'ALL_COMPANY' }), ['orders.read', 'orders.note'])).toBeNull();
  });
});

describe('pay in the audit trail', () => {
  it('a payslip keeps its row and loses its amounts, and says so', () => {
    const row = withoutPay({
      entity: 'Payslip',
      previousData: null,
      newData: JSON.stringify({ userId: 'u9', month: '2026-10', salary: 400, penalties: 20, net: 380, paid: 380 }),
    });
    expect(row.payWithheld).toBe(true);
    expect(JSON.parse(row.newData!)).toEqual({ userId: 'u9', month: '2026-10' });
  });

  it('a user record loses its salary and commission fields, and keeps the rest', () => {
    const row = withoutPay({
      entity: 'User',
      previousData: JSON.stringify({ name: 'سارة', salaryAmount: 300 }),
      newData: JSON.stringify({ name: 'سارة', salaryAmount: 350, salaryCurrency: 'JOD', commissionRate: 2 }),
    });
    expect(JSON.parse(row.previousData!)).toEqual({ name: 'سارة' });
    expect(JSON.parse(row.newData!)).toEqual({ name: 'سارة' });
  });

  it('a row that is not about pay is left exactly as it was', () => {
    const order = { entity: 'Order', previousData: '{"totalAmount":25}', newData: '{"totalAmount":30}' };
    expect(withoutPay(order)).toBe(order);
  });
});
