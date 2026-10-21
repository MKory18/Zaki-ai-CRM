import { describe, expect, it } from 'vitest';
// How the legacy «صحة بلس» dump reads in this system. The tool runs under
// plain node, so its rules live in a pure .mjs module; this suite holds them
// against the app's own readings of the same fields.
import {
  allocateDiscount as portedAllocate,
  canonicalPhone as portedCanonical,
  checkOrderPrices,
  LEGACY_STATUS,
  legacyTimestamps,
  mapLegacyStatus,
  normPhone,
  priceLines,
  resolveLinePrice,
} from '../../scripts/migration/lib/legacy-map.mjs';
import { deriveCoreState } from './order-state';
import { closingStages } from './order-closing';
import { allocateDiscount } from './money';
import { canonicalPhone, PHONE_RULES } from './phone-rules';

function closingOf(statusId: number) {
  const m = mapLegacyStatus(statusId);
  return closingStages({
    shippingStatus: m.shippingStatus,
    settlementStatus: m.settlementStatus,
    returnReceived: m.returnReceipt,
  });
}

describe('the owner\'s status ruling, read through the app\'s own state machine', () => {
  it('maps exactly the ten statuses in the dump', () => {
    expect(Object.keys(LEGACY_STATUS).map(Number).sort((a, b) => a - b)).toEqual([2, 4, 5, 6, 8, 9, 12, 13, 15, 16]);
  });

  it('every order was confirmed — all but the postponed read CONFIRMED', () => {
    for (const id of [2, 4, 5, 6, 9, 12, 13, 15, 16]) {
      expect(mapLegacyStatus(id).confirmationStatus).toBe('CONFIRMED');
    }
    expect(mapLegacyStatus(8).confirmationStatus).toBe('POSTPONED');
  });

  it('«مطلوب تجهيزه» is confirmed and shipped, and still open', () => {
    const m = mapLegacyStatus(2);
    expect(deriveCoreState(m)).toBe('SHIPPED');
    expect(closingOf(2).closed).toBe(false);
  });

  it('«تم استلام المبلغ» and «تم توصيله» are delivered, collected and closed', () => {
    for (const id of [5, 12]) {
      const m = mapLegacyStatus(id);
      expect(deriveCoreState(m)).toBe('DELIVERED');
      expect(m.settlementStatus).toBe('SETTLED');
      expect(m.collected).toBe(true);
      expect(closingOf(id)).toMatchObject({ cash: 'DONE', closed: true });
    }
  });

  it('«قيد التوصيل» and «تم استلام الطلب الملغي» are a received return, closed', () => {
    for (const id of [4, 13]) {
      const m = mapLegacyStatus(id);
      expect(deriveCoreState(m)).toBe('RETURNED');
      expect(m.returnReceipt).toBe(true);
      expect(closingOf(id)).toMatchObject({ goods: 'DONE', closed: true });
    }
  });

  it('without the receipt the same return would still be open — the receipt is what closes it', () => {
    const m = mapLegacyStatus(13);
    expect(closingStages({ shippingStatus: m.shippingStatus, settlementStatus: m.settlementStatus, returnReceived: false }).closed).toBe(false);
  });

  it('«ملغي» «مفقود» «ملغي من الشركة» are cancelled before shipping', () => {
    for (const id of [6, 15, 16]) {
      const m = mapLegacyStatus(id);
      expect(deriveCoreState(m)).toBe('CANCELLED');
      expect(m.label).toBe('ملغي قبل الشحن');
      expect(legacyTimestamps(m, new Date(1), new Date(2)).shippedAt).toBeNull();
    }
  });

  it('«مكرر» is a cancelled duplicate', () => {
    const m = mapLegacyStatus(9);
    expect(deriveCoreState(m)).toBe('CANCELLED');
    expect(m.rejectionReason).toBe('DUPLICATE_ORDER');
  });

  it('«مؤجل» stays postponed', () => {
    expect(deriveCoreState(mapLegacyStatus(8))).toBe('POSTPONED');
  });

  it('REFUSES a status it does not know instead of reading it as «مطلوب تجهيزه»', () => {
    expect(() => mapLegacyStatus(1)).toThrow(/unknown legacy status_id 1/);
    expect(() => mapLegacyStatus(99)).toThrow(/never guess/);
    expect(() => mapLegacyStatus('x')).toThrow();
  });

  it('dates: confirmed when made, delivered or returned when last changed', () => {
    const made = new Date('2026-03-01T10:00:00Z');
    const last = new Date('2026-03-05T10:00:00Z');
    expect(legacyTimestamps(mapLegacyStatus(12), made, last)).toEqual({ confirmedAt: made, shippedAt: made, deliveredAt: last, returnedAt: null });
    expect(legacyTimestamps(mapLegacyStatus(13), made, last)).toEqual({ confirmedAt: made, shippedAt: made, deliveredAt: null, returnedAt: last });
    expect(legacyTimestamps(mapLegacyStatus(8), made, last)).toEqual({ confirmedAt: null, shippedAt: null, deliveredAt: null, returnedAt: null });
  });
});

describe('line prices: the sale price first, the variant only when there is none', () => {
  it('keeps the line\'s own price even when the variant lists another', () => {
    expect(resolveLinePrice('10.00', '15.00')).toEqual({ price: 10, fromVariant: false });
  });

  it('a MISSING line price is taken from the variant — and says so', () => {
    expect(resolveLinePrice(null, '15.00')).toEqual({ price: 15, fromVariant: true });
    expect(resolveLinePrice('', '15.00')).toEqual({ price: 15, fromVariant: true });
  });

  it('a recorded zero is NOT replaced: the door asked for the shipping alone', () => {
    expect(resolveLinePrice('0.00', '15.00')).toEqual({ price: 0, fromVariant: false });
  });

  it('with neither, the price is zero and not invented', () => {
    expect(resolveLinePrice(null, null)).toEqual({ price: 0, fromVariant: false });
  });
});

describe('the price check reports every disagreement and corrects none', () => {
  const clean = { sub_total: '30.00', discount: '7.00', shipping_price: '4.00', total: '27.00' };
  const lines = [{ price: '15.00', quantity: '2' }];

  it('a consistent order has no issues', () => {
    expect(checkOrderPrices(clean, lines, 4)).toEqual([]);
  });

  it('a total that ignores the discount is flagged with both figures', () => {
    const issues = checkOrderPrices({ ...clean, total: '34.00' }, lines, 4);
    expect(issues).toEqual([{ code: 'TOTAL_NE_FORMULA', expected: 27, actual: 34 }]);
  });

  it('lines that do not add up to the subtotal are flagged', () => {
    const issues = checkOrderPrices({ sub_total: '22.00', discount: '0', shipping_price: '4.00', total: '26.00' }, [{ price: '7.33', quantity: '3' }], 4);
    expect(issues).toContainEqual({ code: 'LINES_NE_SUBTOTAL', expected: 22, actual: 21.99 });
  });

  it('a zero line price is flagged', () => {
    expect(checkOrderPrices({ ...clean, sub_total: '0', discount: '0', total: '4.00' }, [{ price: '0', quantity: '1' }], 4).map((i) => i.code)).toContain('LINE_PRICE_ZERO');
  });

  it('a negative total is flagged — the dump holds four', () => {
    const issues = checkOrderPrices({ sub_total: '0.00', discount: '6.80', shipping_price: '3.00', total: '-2.10' }, [{ price: '0', quantity: '1' }], 3);
    expect(issues).toContainEqual({ code: 'NEGATIVE_TOTAL', actual: -2.1 });
  });

  it('a shipping fee unlike the courier\'s table is flagged, and free shipping is not «missing»', () => {
    const issues = checkOrderPrices({ ...clean, shipping_price: '0.00', total: '23.00' }, lines, 4);
    expect(issues).toEqual([{ code: 'SHIPPING_NE_TABLE', expected: 4, actual: 0 }]);
    expect(checkOrderPrices({ ...clean, shipping_price: null, total: '23.00' }, lines, 4).map((i) => i.code)).toContain('SHIPPING_MISSING');
  });
});

describe('the ports agree with the app code they copy', () => {
  it('allocateDiscount splits exactly as money.ts does', () => {
    const cases: [Array<{ quantity: number; unitPrice: number }>, number][] = [
      [[{ quantity: 1, unitPrice: 30 }], 7],
      [[{ quantity: 3, unitPrice: 7.33 }, { quantity: 1, unitPrice: 10 }], 5],
      [[{ quantity: 2, unitPrice: 12.5 }, { quantity: 1, unitPrice: 0 }, { quantity: 1, unitPrice: 9.99 }], 3.33],
      [[{ quantity: 1, unitPrice: 5 }], 50],
      [[{ quantity: 1, unitPrice: 0 }], 2],
    ];
    for (const [lines, d] of cases) expect(portedAllocate(lines, d, 2)).toEqual(allocateDiscount(lines, d, 2));
  });

  it('canonicalPhone agrees with phone-rules.ts on every form the dump holds', () => {
    const forms = ['966793918', '0966793918', '00963966793918', '+963 966 793918', '٠٩٦٦٧٩٣٩١٨', '0791234567', '00962791234567', '963966793918', '', 'abc'];
    for (const f of forms) expect(portedCanonical(f)).toBe(canonicalPhone(f));
  });

  it('the port knows every dial code the app knows', () => {
    const appCodes = [...new Set(Object.values(PHONE_RULES).map((r) => r.dialCode))];
    for (const code of appCodes) expect(portedCanonical(`00${code}123456789`)).toBe('123456789');
  });

  it('«00963…» and «09…» are the same customer — the old key kept the 963', () => {
    expect(normPhone('00963966793918')).toBe(normPhone('0966793918'));
    expect(normPhone('')).toBeNull();
  });
});

describe('a sheet order: one total, delivery included, shared across its lines', () => {
  it('one line takes the whole total', () => {
    const [l] = priceLines(25, [{ basePrice: 18, quantity: 3 }], 2);
    expect(l.lineTotal).toBe(25);
    expect(l.unitPrice).toBe(8.333);
  });

  it('several lines share it by list value and add back up exactly — 19oct2026-20', () => {
    const lines = priceLines(50, [{ basePrice: 20, quantity: 1 }, { basePrice: 20, quantity: 1 }, { basePrice: 20, quantity: 1 }], 2);
    expect(lines.map((l) => l.lineTotal).reduce((a, b) => a + b, 0)).toBe(50);
    expect(lines.map((l) => l.lineTotal).sort()).toEqual([16.66, 16.67, 16.67]);
  });

  it('a line with no list price still gets a share instead of dividing by zero', () => {
    const lines = priceLines(30, [{ basePrice: 0, quantity: 1 }, { basePrice: 0, quantity: 2 }], 2);
    expect(lines.map((l) => l.lineTotal).reduce((a, b) => a + b, 0)).toBe(30);
  });
});
