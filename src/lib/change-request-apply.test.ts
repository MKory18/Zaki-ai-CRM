import { describe, it, expect } from 'vitest';
import { expandApproved, strayFields } from './change-request-apply';
import { CHANGEABLE_FIELDS } from './change-request-fields';

const approved = (changes: Record<string, unknown>) => ({
  id: 'r1', orderId: 'o1', status: 'APPROVED', appliedAt: null, changes,
});

describe('every changeable field has a decided fate', () => {
  it('either applies through the order edit, or is refused by name — nothing in between', () => {
    // The drift this catches: a field added to the change-request list
    // without anybody deciding how an approved change to it is carried out.
    // It would be requestable, approvable, and silently never applied.
    const cannot: string[] = [];
    for (const f of CHANGEABLE_FIELDS) {
      const r = expandApproved(approved({ [f]: { to: 'x' } }));
      if (!r.ok) cannot.push(f);
    }
    expect(cannot.sort()).toEqual(['customerCity', 'offerId']);
  });
});

describe('expandApproved', () => {
  it('turns approved changes into the order-edit fields, with the approved values', () => {
    const r = expandApproved(approved({ quantity: { from: 2, to: 3 }, customerAddress: { to: 'شارع' } }));
    expect(r).toEqual({ ok: true, fields: { quantity: 3, customerAddress: 'شارع' } });
  });

  it('carries a cleared value as null rather than dropping it', () => {
    const r = expandApproved(approved({ customerAltPhone: { from: '078', to: null } }));
    expect(r).toEqual({ ok: true, fields: { customerAltPhone: null } });
  });

  it('refuses an empty request instead of applying nothing and calling it done', () => {
    const r = expandApproved(approved({}));
    expect(r.ok).toBe(false);
  });
});

describe('strayFields', () => {
  it('allows the request id and the version, and nothing else', () => {
    expect(strayFields({ changeRequestId: 'x', expectedVersion: 3 })).toEqual([]);
    expect(strayFields({ changeRequestId: 'x', customerPhone: '079', quantity: 5 })).toEqual(['customerPhone', 'quantity']);
  });

  it('ignores keys that are present but undefined', () => {
    expect(strayFields({ changeRequestId: 'x', customerPhone: undefined })).toEqual([]);
  });
});
