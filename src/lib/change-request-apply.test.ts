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
    // AND NOW THE LIST IS EMPTY — THE POINT OF THE WHOLE DOOR.
    //
    // The city left it by being FIXED: free text with no column on the
    // order, so every request to change it was accepted, approved, and
    // then refused — «طلب تعديل: لا يمكن تعديل المدينة». It is `regionId`
    // now, the governorate the delivery fee is keyed on, which the order
    // writes.
    //
    // The offer left it by being REMOVED, which this assertion is what
    // forced. This test used to read `toEqual(['offerId'])` — it recorded
    // the exception instead of refusing it, so the same defect the seller
    // reported about the city sat in the menu beside it with a passing
    // test over the top. An offer is five money inputs (quantity, free
    // units, price, discount, whether delivery is included), and the ask
    // behind it is sayable in three fields that do apply.
    expect(cannot.sort()).toEqual([]);
  });

  /**
   * AND AN OLD ROW STILL READS IN ARABIC.
   *
   * Rows raised before the offer was retired still carry it, and they are
   * refused — but by NAME. Dropping the label with the field would print
   * `offerId` to somebody reading a request they did not raise.
   */
  it('refuses a retired field by its Arabic name, not its code name', () => {
    const r = expandApproved(approved({ offerId: { to: 'offer-1' } }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('NOT_APPLICABLE');
      expect(r.error).toContain('العرض');
      expect(r.error).not.toContain('offerId');
    }
  });

  /**
   * THE PRICE APPLIES, BECAUSE THE ORDER ROUTE NAMES IT THE SAME.
   *
   * «كمية كم عدد والسعر الجديد… وينعكس هذا على الفاتورة» — and it does,
   * because the order route recomputes the amount due from this field
   * rather than storing it beside a total somebody else wrote.
   */
  it('applies the new price and the new product as the order route names them', () => {
    const r = expandApproved(approved({
      sellingPrice: { from: 50, to: 60 },
      productId: { from: 'p-old', to: 'p-new' },
    }));
    expect(r).toEqual({ ok: true, fields: { sellingPrice: 60, productId: 'p-new' } });
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
