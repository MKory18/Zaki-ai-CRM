import { describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({ db: {} }));

import { GEO_MANAGER_ROLES, legacyEffectiveKeys } from './permissions-core';
import { ALL_CATALOG_KEYS } from './permission-catalog';

/** geo.* grants on the legacy (no roleId) path mirror the migration. */
describe('geo permissions', () => {
  it('are part of the catalog', () => {
    expect(ALL_CATALOG_KEYS.has('geo.view')).toBe(true);
    expect(ALL_CATALOG_KEYS.has('geo.manage')).toBe(true);
  });

  it('owner and manager roles may manage countries and stores', () => {
    for (const role of GEO_MANAGER_ROLES) {
      expect(legacyEffectiveKeys(role as any)).toEqual(expect.arrayContaining(['geo.manage', 'geo.view']));
    }
  });

  it('operational roles cannot add countries or stores', () => {
    for (const role of ['MODERATOR', 'CONFIRMATION_AGENT', 'DELIVERY_MANAGER', 'ACCOUNTANT']) {
      expect(legacyEffectiveKeys(role as any)).not.toContain('geo.manage');
    }
  });
});
