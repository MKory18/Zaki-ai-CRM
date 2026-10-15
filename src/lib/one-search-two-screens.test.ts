import { describe, expect, it } from 'vitest';
import { orderSearchOr, ordersWhere } from './order-filters';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ONE SEARCH, TWO SCREENS — AND THEY CANNOT DRIFT.
 *
 * «إنشاء شحنة» had no search box. The obvious way to give it one is to
 * write a second `OR` in its route, and then the two drift: somebody adds
 * a field to the orders list, the shipment screen does not get it, and
 * «لقيته بالطلبات وما لقيته بالشحنات» is a bug report nobody can read.
 *
 * So the branch was lifted out of `ordersWhere` and both callers ask it.
 * These hold the shape it answers in, and the one deliberate difference
 * between the two callers.
 * ═══════════════════════════════════════════════════════════════════════
 */

/** The field a branch matches on, as a dotted path — `customer.city`. */
function fieldOf(branch: Record<string, unknown>): string {
  const [key, value] = Object.entries(branch)[0];
  if (value && typeof value === 'object' && !('contains' in (value as object))) {
    return `${key}.${Object.keys(value as object)[0]}`;
  }
  return key;
}

const fields = (search: string, opts?: { withCity?: boolean }) =>
  orderSearchOr(search, opts).map(fieldOf);

describe('what a person can search a parcel by', () => {
  it('the order number, our reference, the courier’s barcode, the name and the phone', () => {
    expect(fields('شيء')).toEqual([
      'orderNumber',
      'merchantRef',
      'trackingNumber',
      'customer.fullName',
      'customer.phone',
      'customer.rawPhone',
    ]);
  });

  it('and the city, only where the city is the point', () => {
    /*
     * «إنشاء شحنة» is sorted by where parcels are going, so a governorate
     * typed into the box is exactly what a person means. The ORDERS list
     * is not: adding it there would change what today's searches return —
     * one word would start matching every customer in a governorate — and
     * nobody asked for that.
     */
    expect(fields('عمّان', { withCity: true })).toContain('customer.city');
    expect(fields('عمّان'), 'المدينة دخلت على بحث الطلبات بلا ما حدا طلبها').not.toContain(
      'customer.city'
    );
  });

  it('and the city is added, never swapped in for something else', () => {
    const without = fields('س');
    const withCity = fields('س', { withCity: true });
    expect(withCity.slice(0, without.length)).toEqual(without);
    expect(withCity).toHaveLength(without.length + 1);
  });
});

describe('a phone is matched the way it is read, and the way it is stored', () => {
  it('a number typed with the country code still finds one stored without it', () => {
    const branches = orderSearchOr('+962791234567');
    const phone = branches.find((b) => 'customer' in b && 'phone' in (b.customer as object));
    const raw = branches.find((b) => 'customer' in b && 'rawPhone' in (b.customer as object));

    // The normalised form goes to the normalised column. Measured:
    // `+962791234567` and `0791234567` both normalise to `791234567`, so
    // either way of typing it finds the same stored row.
    expect(JSON.stringify(phone), 'الرقم ما انطبّع').toContain('791234567');
    // …and the typed form is still matched as typed, because that is what
    // a person copies off a screen.
    expect(JSON.stringify(raw)).toContain('+962791234567');
  });

  it('and a number that normalises to nothing is still searched as typed', () => {
    const branches = orderSearchOr('123');
    expect(JSON.stringify(branches)).toContain('123');
    expect(branches).toHaveLength(6);
  });
});

describe('and the orders list still asks it', () => {
  it('a q on the orders list produces the same six branches', () => {
    const built = ordersWhere(new URLSearchParams({ q: 'ORD-5' }));
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.where.OR).toEqual(orderSearchOr('ORD-5'));
  });

  it('and no q leaves the list alone', () => {
    const built = ordersWhere(new URLSearchParams());
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.where.OR).toBeUndefined();
  });
});
