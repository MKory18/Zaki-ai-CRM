import { describe, it, expect } from 'vitest';
import { CHANGEABLE_FIELDS, CHANGE_FIELD_AR, changeFieldLabel, withFrom, type OrderSnapshot } from './change-request-fields';
import { repoFile, stripComments } from './guard-source';

const order: OrderSnapshot = {
  quantity: 2,
  productId: 'p1',
  // The LINE total for the two units, not the price of one.
  sellingPrice: 50,
  discountAmount: 0,
  customerNotes: null,
  regionId: 'region-amman',
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

  /**
   * A RETIRED FIELD KEEPS ITS NAME.
   *
   * Requests raised before the offer left the list still carry it and are
   * still refused — but the refusal names «العرض», not `offerId`, because
   * the person reading it did not write the code.
   */
  it('still names the fields that were retired, so an old row reads in Arabic', () => {
    expect(CHANGEABLE_FIELDS).not.toContain('offerId');
    expect(changeFieldLabel('offerId')).toBe('العرض');
    expect(changeFieldLabel('customerCity')).toBe('المدينة');
  });

  /**
   * THE PRICE SAYS WHICH PRICE IT IS.
   *
   * `Order.sellingPrice` is the line's total for the quantity, in the order
   * route's own words. A menu entry reading «السعر» would be approved as a
   * discount whenever the person meant «per unit», and the approval applies
   * the number as typed.
   */
  it('says the price is the line total, not the price of one unit', () => {
    expect(CHANGEABLE_FIELDS).toContain('sellingPrice');
    expect(CHANGE_FIELD_AR.sellingPrice).toContain('إجمالي الكمية');
  });
});

/**
 * WHAT THE DIALOG DOES WITH THE LIST.
 *
 * The raise dialog held back two fields, and both reasons are gone: the
 * product now has a searchable picker, and the offer is no longer in the
 * list at all. A field that is askable and never offered is a feature
 * nobody can reach; one that is offered and cannot be applied is the bug
 * the seller reported twice.
 */
describe('the raise dialog offers the whole list', () => {
  const dialog = () => stripComments(repoFile('src/components/screens/confirmation/ActionDialogs.tsx'));

  it('derives its menu from the list with nothing filtered out', () => {
    const src = dialog();
    expect(src.length).toBeGreaterThan(200);
    expect(src).toMatch(/CHANGE_FIELDS = CHANGEABLE_FIELDS\.map\(/);
    expect(src, 'عاد حقلٌ يُحجب عن الشاشة').not.toMatch(/NOT_OFFERED_HERE/);
  });

  it('chooses the product with the shared searchable picker, never a bare list', () => {
    const src = dialog();
    expect(src).toMatch(/field === 'productId' \? \(\s*<ProductPicker/);
    // ONE fetch for the catalogue, and it is the shared hook — two screens
    // had asked for `?limit=200` against a route that caps at 100.
    expect(src).toMatch(/useProducts\(\)/);
  });

  /**
   * THE WHOLE CATALOGUE, NOT THE FIRST HUNDRED.
   *
   * `/api/products` caps `?limit` at 100, and two screens asked it for 200
   * — so past a hundred products the tail of the catalogue was unreachable
   * from them, and a search box over a truncated list answers «لا يوجد»
   * about a product that exists. The shared hook asks for no limit.
   */
  it('fetches the catalogue whole, through the one hook', () => {
    const hook = stripComments(repoFile('src/hooks/useProducts.ts'));
    expect(hook.length).toBeGreaterThan(200);
    // The type it is read into is not the point — the point is one fetch,
    // through the client that redirects on an expired session, with no
    // limit on it. (It is `CatalogueProduct` now: the route always sent
    // `basePrice` and the offers, and three order dialogs were fetching
    // the catalogue again by hand to reach them.)
    expect(hook).toMatch(/apiJson<\{ products: \w+\[\] \}>\('\/api\/products'\)/);
    expect(hook, 'عاد الحدُّ الذي يقصّ آخر الكتالوج').not.toMatch(/limit=/);
  });

  it('will not send an edit with no new value', () => {
    // `required` cannot guard the picker, so the button carries the rule —
    // and it says "not ready", not «جارٍ الحفظ…».
    expect(dialog()).toMatch(/disabled=\{intent === 'EDIT' && !to\.trim\(\)\}/);
  });
});

describe('withFrom — the value BEFORE, taken by the server', () => {
  it('answers "three instead of what?"', () => {
    expect(withFrom(order, { quantity: { to: 3 } })).toEqual({ quantity: { from: 2, to: 3 } });
  });

  it('reads customer fields from the customer', () => {
    expect(withFrom(order, { customerPhone: { to: '0799999999' } })).toEqual({
      customerPhone: { from: '0791234567', to: '0799999999' },
    });
  });

  /**
   * THE GOVERNORATE, NOT THE CITY.
   *
   * The city was free text and the order has no column for it, so every
   * request to change it was accepted, approved, and then refused with
   * «عدّلها يدوياً» — reported as «طلب تعديل: لا يمكن تعديل المدينة».
   * The order ships to a region, and that is what the request carries.
   */
  it('reads the governorate from the order, not the customer’s typed city', () => {
    expect(withFrom(order, { regionId: { to: 'region-zarqa' } })).toEqual({
      regionId: { from: 'region-amman', to: 'region-zarqa' },
    });
    expect(CHANGEABLE_FIELDS).not.toContain('customerCity');
  });

  /**
   * THE LINE TOTAL, TAKEN AS IT STANDS.
   *
   * Dividing it by the quantity here would show the decider «25 ← 60» on an
   * order of two at fifty, and they would approve what looks like a rise
   * when the seller asked for a ten-unit increase on the line. The order
   * route stores the line total; the request shows the line total.
   */
  it('reads the price as the line total, without dividing it by the quantity', () => {
    expect(withFrom(order, { sellingPrice: { to: 60 } })).toEqual({
      sellingPrice: { from: 50, to: 60 },
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
