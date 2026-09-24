import { describe, it, expect } from 'vitest';
import { inStore, inStoreOrShared, belongsToStore } from './store-filter';

/**
 * A TENANT FILTER FAILS BY RETURNING MORE.
 *
 * That is the whole reason these tests exist and the whole reason they are
 * written as refusals. A forgotten `storeId` throws nothing, logs nothing
 * and renders fine — it just shows a clerk at one store another store's
 * rows, and on this database that was one hundred and thirty-five stock
 * movements where five were theirs.
 *
 * So every case below asserts what must NOT come back.
 */

const A = 'store-a';
const B = 'store-b';
const CO = 'company-1';

describe('rows of the caller’s store', () => {
  it('names the store in the clause', () => {
    expect(inStore(CO, A)).toEqual({ companyId: CO, storeId: A });
  });

  it('matches nothing when no store is selected', () => {
    // NOT the whole company. "No store chosen" is what a fresh session is,
    // and answering it with everything is the leak wearing a convenience.
    const f = inStore(CO, null);
    expect(f.storeId).toBeUndefined();
    expect(f.id).toEqual({ in: [] });
  });

  it('treats undefined and empty string the same as null', () => {
    for (const v of [undefined, '', null]) {
      expect(inStore(CO, v as string | null).id, String(v)).toEqual({ in: [] });
    }
  });

  it('never widens to another store', () => {
    expect(inStore(CO, A).storeId).not.toBe(B);
  });
});

describe('rows of the store plus unassigned ones', () => {
  it('includes both, and only for a chosen store', () => {
    expect(inStoreOrShared(CO, A)).toEqual({
      companyId: CO,
      OR: [{ storeId: A }, { storeId: null }],
    });
  });

  it('falls back to unassigned rows alone, never to every store', () => {
    const f = inStoreOrShared(CO, null);
    expect(f).toEqual({ companyId: CO, storeId: null });
    expect('OR' in f).toBe(false);
  });
});

describe('checking a row already in hand', () => {
  it('accepts a row of this company and this store', () => {
    expect(belongsToStore({ companyId: CO, storeId: A }, CO, A)).toBe(true);
  });

  it('refuses another store’s row', () => {
    expect(belongsToStore({ companyId: CO, storeId: B }, CO, A)).toBe(false);
  });

  it('refuses another company’s row even when the store id matches', () => {
    // Store ids are uuids and will not collide in practice. The check is
    // here because "in practice" is not a guarantee, and the cost is a
    // comparison.
    expect(belongsToStore({ companyId: 'company-2', storeId: A }, CO, A)).toBe(false);
  });

  it('refuses a row belonging to no store', () => {
    // Unassigned means unassigned. Reading it as "belongs to everyone" is
    // how a row nobody placed becomes a row everybody can see.
    expect(belongsToStore({ companyId: CO, storeId: null }, CO, A)).toBe(false);
    expect(belongsToStore({ companyId: CO }, CO, A)).toBe(false);
  });

  it('refuses when the caller has no store selected', () => {
    expect(belongsToStore({ companyId: CO, storeId: A }, CO, null)).toBe(false);
  });

  it('refuses nothing at all', () => {
    expect(belongsToStore(null, CO, A)).toBe(false);
    expect(belongsToStore(undefined, CO, A)).toBe(false);
  });
});
