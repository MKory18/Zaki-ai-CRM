import { describe, it, expect } from 'vitest';
import { CHANGEABLE_FIELDS, CHANGE_FIELD_AR, changeFieldLabel, withFrom, type OrderSnapshot } from './change-request-fields';

const order: OrderSnapshot = {
  quantity: 2,
  productId: 'p1',
  offerId: null,
  discountAmount: 0,
  customerNotes: null,
  customer: { fullName: 'أحمد', phone: '0791234567', altPhone: null, address: 'عمان، الشميساني', city: 'عمان' },
};

describe('one list of changeable fields', () => {
  it('names every field in Arabic', () => {
    // The dialog and the route kept a list each and they drifted: four of
    // the ten fields reached the person deciding as English code names.
    for (const f of CHANGEABLE_FIELDS) {
      expect(CHANGE_FIELD_AR[f]).toBeTruthy();
      expect(changeFieldLabel(f)).not.toBe(f);
    }
  });

  it('shows an unknown field as itself rather than as nothing', () => {
    expect(changeFieldLabel('somethingNew')).toBe('somethingNew');
  });
});

describe('withFrom — the value BEFORE, taken by the server', () => {
  it('answers "three instead of what?"', () => {
    expect(withFrom(order, { quantity: { to: 3 } })).toEqual({ quantity: { from: 2, to: 3 } });
  });

  it('reads customer fields from the customer', () => {
    expect(withFrom(order, { customerPhone: { to: '0799999999' }, customerCity: { to: 'الزرقاء' } })).toEqual({
      customerPhone: { from: '0791234567', to: '0799999999' },
      customerCity: { from: 'عمان', to: 'الزرقاء' },
    });
  });

  it('records an empty before as null, not as a missing key', () => {
    expect(withFrom(order, { customerAltPhone: { to: '0781111111' } })).toEqual({
      customerAltPhone: { from: null, to: '0781111111' },
    });
  });

  it('ignores a "from" the browser sent — it could say anything', () => {
    // The negative test: a requester who claims the quantity was 10 must not
    // be believed. Only the order's own value is recorded.
    const forged = { quantity: { from: 10, to: 3 } } as unknown as Parameters<typeof withFrom>[1];
    expect(withFrom(order, forged)).toEqual({ quantity: { from: 2, to: 3 } });
  });

  it('touches only the fields that were asked for', () => {
    expect(Object.keys(withFrom(order, { customerName: { to: 'محمد' } }))).toEqual(['customerName']);
  });
});
