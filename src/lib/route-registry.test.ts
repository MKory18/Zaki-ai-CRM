import { describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({ db: {} }));

import { ALL_ROUTES, NAV, canAccessRoute, findRoute, visibleNav } from './route-registry';
import { attachGrants } from './authorization';
import { ALL_CATALOG_KEYS } from './permission-catalog';

function userWith(keys: string[], role = 'MODERATOR') {
  const user = { id: 'u1', role, status: 'ACTIVE', permissions: keys } as any;
  return attachGrants(user, {
    fullAccess: false,
    grants: Object.fromEntries(keys.map((k) => [k, { scope: 'ALL_COMPANY' }])),
  });
}

describe('navigation contract', () => {
  it('has the ten groups in contract order', () => {
    expect(NAV.map((g) => g.label)).toEqual([
      'الرئيسية', 'مركز التأكيد', 'التشغيل', 'المخزون', 'المال',
      'الرقابة', 'النمو', 'التطبيقات', 'الإعدادات', 'الإدارة',
    ]);
  });

  it('lists 50 unique routes', () => {
    const paths = ALL_ROUTES.map((route) => route.path);
    expect(paths).toHaveLength(50);
    expect(new Set(paths).size).toBe(50);
  });

  it('only references permissions that exist in the catalog', () => {
    for (const route of ALL_ROUTES) {
      for (const p of route.permissions ?? []) expect(ALL_CATALOG_KEYS.has(p), `${route.path}: ${p}`).toBe(true);
    }
  });

  it('a path outside the contract resolves to nothing (404)', () => {
    expect(findRoute('/dashboards/crm')).toBeUndefined();
    expect(findRoute('/offers')).toBeUndefined();
    expect(findRoute('/confirmation/queue')).toBeDefined();
  });

  it('apps appear once, as their own group', () => {
    const appRoutes = ALL_ROUTES.filter((route) => route.path.startsWith('/apps/'));
    expect(appRoutes).toHaveLength(2);
    expect(NAV.find((g) => g.key === 'apps')!.routes).toEqual(appRoutes);
  });

  it('/assistant and /growth/intelligence stay two distinct screens', () => {
    expect(findRoute('/assistant')!.permissions).not.toEqual(findRoute('/growth/intelligence')!.permissions);
  });
});

describe('role visibility', () => {
  const moderator = () => userWith(['orders.view', 'orders.create', 'orders.edit', 'orders.claim', 'orders.confirm', 'customers.view', 'confirmation.issues']);

  it('a moderator is refused /confirmation/queue even with order claim/confirm grants', () => {
    expect(canAccessRoute(moderator(), findRoute('/confirmation/queue')!)).toBe(false);
  });

  it('a moderator may open /confirmation/issues and /orders', () => {
    expect(canAccessRoute(moderator(), findRoute('/confirmation/issues')!)).toBe(true);
    expect(canAccessRoute(moderator(), findRoute('/orders')!)).toBe(true);
  });

  it('a confirmation agent reaches queue, mine and postponed but not issues', () => {
    const agent = userWith(['confirmation.pull', 'confirmation.work'], 'CONFIRMATION_AGENT');
    const allowed = ['/confirmation/queue', '/confirmation/mine', '/confirmation/postponed'];
    for (const p of allowed) expect(canAccessRoute(agent, findRoute(p)!)).toBe(true);
    expect(canAccessRoute(agent, findRoute('/confirmation/issues')!)).toBe(false);
  });

  it('warehouse never reaches money or customer screens', () => {
    const wh = userWith(['ops.prepare', 'ops.labels', 'ops.returns', 'inventory.view', 'inventory.adjust'], 'WAREHOUSE');
    for (const p of ['/finance/profit', '/customers', '/ops/tracking']) {
      expect(canAccessRoute(wh, findRoute(p)!), p).toBe(false);
    }
  });

  it('an inactive user opens nothing, not even the profile', () => {
    const pending = { ...userWith(['orders.view']), status: 'PENDING' };
    expect(canAccessRoute(pending, findRoute('/admin/profile')!)).toBe(false);
  });

  it('the visible navigation drops empty groups', () => {
    const nav = visibleNav(userWith(['confirmation.pull', 'confirmation.work'], 'CONFIRMATION_AGENT'));
    expect(nav.map((g) => g.key)).toEqual(['confirmation', 'admin']);
  });
});
