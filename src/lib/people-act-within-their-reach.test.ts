import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/types/auth';

/**
 * WHAT ONE PERSON MAY DO TO ANOTHER PERSON'S ACCOUNT — AND TO A MACHINE'S.
 *
 * Found by the permissions audit and checked against the code, then
 * sharpened by an independent review of the first version of this change:
 *
 *   · «تعديل المستخدمين» acted on ANY account — a manager could DENY the
 *     company admin «المالية». You may now act only on an account whose
 *     EFFECTIVE grants you hold — its role AND the owner's exceptions on top
 *     (reading the role alone let a manager strip a key the owner had given
 *     one employee personally).
 *   · Removing a «منع» gave the key back and asked nothing — and a person's
 *     exception gets no shift-work exemption (one «إشكالات التأكيد» opens the
 *     customers of every issue); the broader view tier covers the narrower.
 *   · A CATEGORY/SPECIFIC grant passed on the scope's NAME, any ids at all;
 *     role doors stored ids from other companies and scopes a key does not
 *     offer — judged now on what is NEW in a save, so a role whose category
 *     was deleted can still be saved.
 *   · An API key could open more than its minter holds, or more stores.
 *   · The audit log handed every salary and payslip to «سجل التدقيق» — now
 *     an allow-list: a field added to a pay row tomorrow is held back.
 *
 * Each is tested both ways: refused without, allowed with.
 */

const { db } = vi.hoisted(() => ({
  db: {
    rolePermission: { findMany: vi.fn() },
    userPermission: { findMany: vi.fn() },
    role: { findFirst: vi.fn() },
    category: { count: vi.fn() },
    product: { count: vi.fn() },
  },
}));
vi.mock('@/lib/db', () => ({ db }));

import { attachGrants } from './authorization';
import { canActOnUser, denyRemovalRefusal, granterHoldsAll, roleRefOf, roleScopeRefusal } from './user-permissions';
import { mayMintForCompany, scopeBeyondMinter } from './v1/token-granter';
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

beforeEach(() => {
  vi.clearAllMocks();
  db.userPermission.findMany.mockResolvedValue([]);
});

describe('acting on another account — its effective grants, read by the engine', () => {
  const MANAGER = person({ 'users.edit': 'ALL_COMPANY', 'orders.view': 'ALL_COMPANY', 'orders.edit': 'ALL_COMPANY' });
  const roleWith = (keys: string[]) =>
    db.rolePermission.findMany.mockResolvedValue(keys.map((permission) => ({ permission, scope: 'ALL_COMPANY', scopeIds: null })));

  it('refuses an account whose role carries a key the actor lacks — and names the key', async () => {
    roleWith(['orders.view', 'finance.view']);
    const r = await canActOnUser(MANAGER, { id: 'admin', roleId: 'r-admin', role: 'COMPANY_ADMIN' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(403);
      expect(r.error).toContain('عرض المالية');
    }
  });

  it('allows an account whose grants the actor holds', async () => {
    roleWith(['orders.view', 'orders.edit']);
    expect((await canActOnUser(MANAGER, { id: 'agent', roleId: 'r-agent', role: 'CONFIRMATION_AGENT' })).ok).toBe(true);
  });

  it('an ALLOW the owner gave the employee personally puts them out of reach too', async () => {
    roleWith(['orders.view']);
    db.userPermission.findMany.mockResolvedValue([{ permission: 'finance.view', effect: 'ALLOW', scope: 'ALL_COMPANY', scopeIds: null }]);
    const r = await canActOnUser(MANAGER, { id: 'sara', roleId: 'r-mod', role: 'MODERATOR' });
    expect(r.ok).toBe(false);
  });

  it('a DENY on the employee narrows what the actor must hold', async () => {
    roleWith(['orders.view', 'finance.view']);
    db.userPermission.findMany.mockResolvedValue([{ permission: 'finance.view', effect: 'DENY', scope: null, scopeIds: null }]);
    expect((await canActOnUser(MANAGER, { id: 'x', roleId: 'r', role: 'X' })).ok).toBe(true);
  });

  it('a role with only the shift-work keys is anyone’s to act on, as it is anyone’s to give', async () => {
    roleWith(['confirmation.pull', 'confirmation.work', 'confirmation.issues']);
    expect((await canActOnUser(MANAGER, { id: 'agent', roleId: 'r', role: 'X' })).ok).toBe(true);
  });

  it('an account with no role row is judged by the system template the engine reads', async () => {
    roleWith(['inventory.adjust']);
    const r = await canActOnUser(MANAGER, { id: 'w', roleId: null, role: 'WAREHOUSE' });
    expect(db.rolePermission.findMany.mock.calls[0][0].where).toEqual({ role: { companyId: null, name: 'WAREHOUSE' } });
    expect(r.ok).toBe(false);
  });

  it('oneself and the owner are not held by it; a full-access account is the owner’s alone', async () => {
    roleWith(['finance.view']);
    expect((await canActOnUser(MANAGER, { id: 'actor', roleId: 'r', role: 'X' })).ok).toBe(true);
    expect((await canActOnUser(person({}, 'SUPER_ADMIN'), { id: 'admin', roleId: 'r', role: 'COMPANY_ADMIN' })).ok).toBe(true);
    expect((await canActOnUser(MANAGER, { id: 'owner2', roleId: null, role: 'SUPER_ADMIN' })).ok).toBe(false);
  });
});

describe('the role a nameless account resolves to', () => {
  it('the system template of that name — or the in-code matrix when that template is empty, as the engine does', async () => {
    db.role.findFirst.mockResolvedValue({ id: 'sys-w', _count: { permissions: 3 } });
    expect(await roleRefOf({ role: 'WAREHOUSE' })).toEqual({ id: 'sys-w', name: 'WAREHOUSE' });
    db.role.findFirst.mockResolvedValue({ id: 'sys-acc', _count: { permissions: 0 } });
    expect(await roleRefOf({ role: 'ACCOUNTANT' })).toEqual({ id: null, name: 'ACCOUNTANT' });
  });
});

describe('removing a «منع»', () => {
  it('is granting: refused without the key at full scope — naming it — allowed with it', () => {
    expect(denyRemovalRefusal(person({ 'users.edit': 'ALL_COMPANY' }), ['finance.view'])).toContain('عرض المالية');
    expect(denyRemovalRefusal(person({ 'finance.view': 'OWN' }), ['finance.view'])).not.toBeNull();
    expect(denyRemovalRefusal(person({ 'finance.view': 'ALL_COMPANY' }), ['finance.view'])).toBeNull();
  });

  it('a person’s exception has no shift-work exemption — «إشكالات التأكيد» opens customers', () => {
    expect(denyRemovalRefusal(person({}), ['confirmation.issues'])).not.toBeNull();
  });

  it('the broader view tier covers the narrower: an admin can lift a «منع» on the basic customer view', () => {
    expect(denyRemovalRefusal(person({ 'customers.view': 'ALL_COMPANY' }), ['customers.view_basic'])).toBeNull();
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

  it('a role refuses an id that belongs to ANOTHER company', async () => {
    db.category.count.mockResolvedValue(1);
    expect(await roleScopeRefusal('c1', [{ permission: 'products.view', scope: 'CATEGORY', scopeIds: ['cat-1', 'cat-other'] }])).toMatch(/شركة أخرى/);
    expect(db.category.count.mock.calls[0][0].where).toEqual({ id: { in: ['cat-1', 'cat-other'] }, NOT: { companyId: 'c1' } });
  });

  it('an id that exists nowhere is a deleted category, not a foreign one — it is let through', async () => {
    db.category.count.mockResolvedValue(0);
    expect(await roleScopeRefusal('c1', [{ permission: 'products.view', scope: 'CATEGORY', scopeIds: ['deleted-cat'] }])).toBeNull();
  });

  it('a row already on the role is not re-judged — the owner can save a role whose category was deleted since', async () => {
    const previous = [{ permission: 'products.view', scope: 'CATEGORY', scopeIds: ['cat-1', 'gone'] }];
    expect(await roleScopeRefusal('c1', [{ permission: 'products.view', scope: 'CATEGORY', scopeIds: ['cat-1', 'gone'] }], previous)).toBeNull();
    expect(db.category.count).not.toHaveBeenCalled();
  });

  it('a scope the key does not offer is refused when it is new', async () => {
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
    expect(scopeBeyondMinter(person({ 'orders.view': 'OWN' }), ['orders.read'])).toEqual({ scope: 'orders.read', key: 'orders.view' });
    expect(scopeBeyondMinter(person({ 'orders.view': 'ALL_COMPANY' }), ['orders.read', 'orders.note'])).toBeNull();
  });

  it('a key reads every store, so its minter must reach every store', () => {
    expect(mayMintForCompany(person({ 'apps.manage': 'ALL_COMPANY' }))).toBe(false);
    expect(mayMintForCompany(person({ 'apps.manage': 'ALL_COMPANY', 'geo.manage': 'ALL_COMPANY' }))).toBe(true);
  });
});

describe('pay in the audit trail — the payloads the doors really write', () => {
  const kept = (entity: string, data: Record<string, unknown>) =>
    JSON.parse(withoutPay({ entity, previousData: null, newData: JSON.stringify(data) }).newData!);

  it('a payslip keeps who and in what currency, and nothing that is a figure', () => {
    expect(kept('Payslip', { employeeId: 'u9', salary: 400, penalties: 20, net: 380, carriedOver: 0, currency: 'JOD', paid: 380, paidCurrency: 'JOD', rate: 1 }))
      .toEqual({ employeeId: 'u9', currency: 'JOD', paidCurrency: 'JOD' });
  });

  it('a penalty keeps who, what kind and why', () => {
    expect(kept('Penalty', { employeeId: 'u9', kind: 'LATE', amount: 5, currency: 'JOD', reason: 'تأخير' }))
      .toEqual({ employeeId: 'u9', kind: 'LATE', currency: 'JOD', reason: 'تأخير' });
  });

  it('a commission payout keeps whose and how many entries', () => {
    expect(kept('CommissionPayout', { person: 'u9', amount: 30, currency: 'SYP', paidAmount: 2, paidCurrency: 'USD', exchangeRate: 15000, entries: 4 }))
      .toEqual({ person: 'u9', currency: 'SYP', paidCurrency: 'USD', entries: 4 });
  });

  it('a field added to a pay row tomorrow is held back until somebody decides it is safe', () => {
    expect(kept('Payslip', { employeeId: 'u9', bonusNextYear: 999 })).toEqual({ employeeId: 'u9' });
  });

  it('a user record loses its salary and commission figures, and says so', () => {
    const row = withoutPay({
      entity: 'User',
      previousData: JSON.stringify({ name: 'سارة', salaryAmount: 300 }),
      newData: JSON.stringify({ name: 'سارة', salaryAmount: 350, salaryCurrency: 'JOD', commissionRate: 2 }),
    });
    expect(row.payWithheld).toBe(true);
    expect(JSON.parse(row.newData!)).toEqual({ name: 'سارة' });
  });

  it('a phone correction whose record carries EMPTY pay fields is not marked as hidden pay', () => {
    const row = withoutPay({
      entity: 'User',
      previousData: JSON.stringify({ phone: '079', salaryAmount: null, salaryCurrency: null, commissionCurrency: null }),
      newData: JSON.stringify({ phone: '078' }),
    });
    expect(row.payWithheld).toBeUndefined();
    expect(JSON.parse(row.previousData!)).toEqual({ phone: '079' });
  });

  it('a row that is not about pay is left exactly as it was', () => {
    const order = { entity: 'Order', previousData: '{"totalAmount":25}', newData: '{"totalAmount":30}' };
    expect(withoutPay(order)).toBe(order);
  });
});
