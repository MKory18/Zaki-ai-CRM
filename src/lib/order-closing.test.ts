import { describe, expect, it } from 'vitest';
import { CASH_DONE, closingStages, type ClosingSource } from './order-closing';
import { getZone, deriveCoreState, type StateSource } from './order-state';

/**
 * «الكاش لحال والمرتجع لحال» — and the partly delivered order runs both.
 *
 * Measured on this shop's own record at the time of writing: 3190 concluded
 * parcels, **0 of them settled**, and 12 partial deliveries. So the honest
 * answer to «is it closed?» is no for every one of them, and a rule that
 * said yes would retire 53,769 of receivable money into the finished pile.
 */

const o = (over: Partial<ClosingSource> = {}): ClosingSource => ({
  shippingStatus: 'DELIVERED',
  settlementStatus: 'PENDING',
  returnReceived: false,
  ...over,
});

describe('a delivered order', () => {
  it('is not closed while the money is still out', () => {
    const s = closingStages(o());
    expect(s.cash).toBe('PENDING');
    expect(s.goods).toBe('NONE');
    expect(s.closed).toBe(false);
    expect(s.why).toContain('المال');
  });

  /**
   * COLLECTED IS THE COURIER'S POCKET, NOT OURS.
   *
   * It is the state that tempts every closing rule: the money exists, a
   * person is holding it, and the parcel is done. It is also exactly the
   * money a COD shop loses, and this record has thousands of it.
   */
  it('and not when the courier merely says he collected it', () => {
    expect(closingStages(o({ settlementStatus: 'COLLECTED' })).closed).toBe(false);
    expect(closingStages(o({ settlementStatus: 'PENDING_COLLECTION' })).closed).toBe(false);
    expect(closingStages(o({ settlementStatus: 'PARTIALLY_SETTLED' })).closed).toBe(false);
  });

  it('and is closed when settlement says the money reached us', () => {
    const s = closingStages(o({ settlementStatus: CASH_DONE }));
    expect(s.cash).toBe('DONE');
    expect(s.closed).toBe(true);
    expect(s.why).toBe('مغلق');
  });
});

describe('a returned order', () => {
  it('owes no money, and is not closed until the goods are counted in', () => {
    const s = closingStages(o({ shippingStatus: 'RETURNED', settlementStatus: 'NOT_APPLICABLE' }));
    expect(s.cash).toBe('NONE');
    expect(s.goods).toBe('PENDING');
    expect(s.closed).toBe(false);
    expect(s.why).toContain('البضاعة');
  });

  it('and is closed once a receipt exists for it', () => {
    const s = closingStages(o({ shippingStatus: 'RETURNED', settlementStatus: 'NOT_APPLICABLE', returnReceived: true }));
    expect(s.goods).toBe('DONE');
    expect(s.closed).toBe(true);
  });

  /** A failed delivery is goods on a van, coming back. */
  it('counts a failed delivery as goods on their way back', () => {
    expect(closingStages(o({ shippingStatus: 'FAILED_DELIVERY' })).goods).toBe('PENDING');
    expect(closingStages(o({ shippingStatus: 'RETURN_REQUESTED' })).goods).toBe('PENDING');
  });
});

/**
 * THE CASE THE OWNER ASKED ABOUT TWICE. «طيب إذا استلم جزء وجزء رجع» — and
 * then «الاعلاق على مرحلتين للمسلم جزئي كمان».
 */
describe('a partly delivered order runs BOTH stages', () => {
  it('is waiting for the money and for the refused units at once', () => {
    const s = closingStages(o({ shippingStatus: 'PARTIALLY_DELIVERED' }));
    expect(s.cash).toBe('PENDING');
    expect(s.goods).toBe('PENDING');
    expect(s.closed).toBe(false);
    expect(s.why).toContain('تسليم جزئي');
    expect(s.why).toContain('المال');
    expect(s.why).toContain('البضاعة');
  });

  it('is still open when only the money arrived', () => {
    const s = closingStages(o({ shippingStatus: 'PARTIALLY_DELIVERED', settlementStatus: CASH_DONE }));
    expect(s.cash).toBe('DONE');
    expect(s.goods).toBe('PENDING');
    expect(s.closed).toBe(false);
  });

  it('is still open when only the goods came back', () => {
    const s = closingStages(o({ shippingStatus: 'PARTIALLY_DELIVERED', returnReceived: true }));
    expect(s.goods).toBe('DONE');
    expect(s.cash).toBe('PENDING');
    expect(s.closed).toBe(false);
  });

  it('and closes only when both landed', () => {
    const s = closingStages(
      o({ shippingStatus: 'PARTIALLY_DELIVERED', settlementStatus: CASH_DONE, returnReceived: true })
    );
    expect(s.closed).toBe(true);
    expect(s.why).toContain('المال وصل والبضاعة الراجعة استُلمت');
  });
});

describe('what is not a closing question at all', () => {
  it('a parcel still in transit has started neither stage', () => {
    for (const shippingStatus of ['SHIPPED', 'OUT_FOR_DELIVERY', 'READY_FOR_PICKUP', 'NOT_READY']) {
      const s = closingStages(o({ shippingStatus }));
      expect(s.cash, shippingStatus).toBe('NONE');
      expect(s.goods, shippingStatus).toBe('NONE');
      // AND IT IS NOT «CLOSED WITH NOTHING OWED» — that would put every
      // parcel on a van into the finished pile.
      expect(s.closed, shippingStatus).toBe(false);
      expect(s.why).toContain('لم يصل البابَ بعد');
    }
  });

  it('a cancelled order is finished with nothing owed and nothing coming', () => {
    const s = closingStages(o({ shippingStatus: 'CANCELLED', settlementStatus: 'CANCELLED' }));
    expect(s.cash).toBe('NONE');
    expect(s.goods).toBe('NONE');
    expect(s.closed).toBe(true);
  });
});

/**
 * AND IT DOES NOT CONTRADICT THE ZONE — it answers a different question.
 *
 * `getZone` says where the work is, and a delivered parcel belongs in no
 * operations queue. That is true and unchanged. Closing says what the
 * business is still waiting for, and for the same parcel the answer is «the
 * money». A rule that merged them would either put settled-but-unpaid
 * orders back into the warehouse queue or retire unpaid ones as finished.
 */
describe('beside the zone, never instead of it', () => {
  it('leaves a delivered order in the CLOSED zone while refusing to call it closed', () => {
    const order = { confirmationStatus: 'CONFIRMED', shippingStatus: 'DELIVERED' } as StateSource;
    expect(getZone(deriveCoreState(order))).toBe('CLOSED');
    expect(closingStages(o()).closed).toBe(false);
  });

  it('and the same for a partly delivered one', () => {
    const order = { confirmationStatus: 'CONFIRMED', shippingStatus: 'PARTIALLY_DELIVERED' } as StateSource;
    expect(deriveCoreState(order)).toBe('PARTIALLY_DELIVERED');
    expect(getZone('PARTIALLY_DELIVERED')).toBe('CLOSED');
    expect(closingStages(o({ shippingStatus: 'PARTIALLY_DELIVERED' })).closed).toBe(false);
  });
});
