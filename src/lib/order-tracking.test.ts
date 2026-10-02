import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_STATE,
  STEP_LABEL_AR,
  TRACKING_FIELDS,
  TRACKING_NOT_FOUND,
  TRACKING_STEPS,
  WHAT_HAPPENS_NEXT_AR,
  everyStateIsSpoken,
  trackingView,
  type TrackableOrder,
} from './order-tracking';
import { CORE_STATES, STATE_LABEL_AR } from './order-state';
import { repoFile, stripComments } from './guard-source';

/**
 * WHERE IS MY ORDER — ASKED BY SOMEBODY WITH NO ACCOUNT.
 *
 * Two things are being guarded, and only one of them is about words. The
 * first: a customer is never handed an operations word. The second, and the
 * one that matters: whoever guesses a phone-and-reference pair learns a
 * status and nothing else — no address, no name, no basket, no money.
 */

const order = (over: Partial<TrackableOrder> = {}): TrackableOrder => ({
  orderNumber: 'ORD-77',
  createdAt: new Date('2026-09-20T19:45:00.000Z'),
  shippingStatus: 'NOT_READY',
  confirmationStatus: 'NEW',
  claimedById: null,
  ...over,
});

const window = { medianDays: 2, slowDays: 4, samples: 30 };

describe('what a stranger is handed', () => {
  /**
   * THE GUARD THAT MATTERS, and it runs in both directions. A field added
   * to the payload and forgotten in the list fails; a field listed and
   * never sent fails too. That is the defence against an address arriving
   * because somebody widened a `select`.
   */
  it('exactly the fields written down, and no others', () => {
    expect(Object.keys(trackingView(order(), window)).sort()).toEqual([...TRACKING_FIELDS].sort());
  });

  it.each(['address', 'city', 'phone', 'name', 'customer', 'total', 'price', 'product', 'notes'])(
    'never a %s',
    (word) => {
      const payload = JSON.stringify(trackingView(order(), window)).toLowerCase();
      expect(payload).not.toContain(word);
    }
  );

  /** The anchor: it does answer the question that was asked. */
  it('and does say where the order is', () => {
    const view = trackingView(order({ shippingStatus: 'SHIPPED' }), window);
    expect(view.stateAr).toMatch(/في الطريق/);
    expect(view.orderNumber).toBe('ORD-77');
  });

  /**
   * The DAY, not the minute. The hour somebody placed an order is a detail
   * about their evening and it buys the reader nothing.
   */
  it('gives a day and not a clock', () => {
    expect(trackingView(order(), window).placedAt).toBe('2026-09-20');
  });
});

describe('the customer’s words are not the operator’s', () => {
  it('has a sentence for every state the system can be in', () => {
    expect(everyStateIsSpoken()).toBe(true);
    for (const state of CORE_STATES) expect(CUSTOMER_STATE[state]?.ar, state).toBeTruthy();
  });

  /**
   * «مُبطَل» · «مرتجع» · «بانتظار الإرجاع» are the operations floor's
   * vocabulary. A customer reading them about their own order has been told
   * nothing and alarmed anyway.
   */
  it.each(['VOIDED', 'RETURNED', 'WAITING_RETURN'] as const)(
    'does not read «%s» to a customer in the staff’s words',
    (state) => {
      expect(CUSTOMER_STATE[state].ar).not.toBe(STATE_LABEL_AR[state]);
    }
  );

  /** Several states are one fact to whoever is waiting: it has not left. */
  it('says one thing for the whole of the warehouse', () => {
    const said = (['CONFIRMED', 'PREPARING', 'READY_TO_SHIP'] as const).map((s) => CUSTOMER_STATE[s].ar);
    expect(new Set(said).size).toBe(1);
  });

  it('puts every step on the line it belongs to, or on none', () => {
    for (const state of CORE_STATES) {
      const step = CUSTOMER_STATE[state].step;
      if (step !== null) expect(TRACKING_STEPS, state).toContain(step);
    }
  });

  it('labels the step it reports', () => {
    const view = trackingView(order({ shippingStatus: 'SHIPPED' }), window);
    expect(view.step).toBe('onTheWay');
    expect(view.stepLabelAr).toBe(STEP_LABEL_AR.onTheWay);
  });

  it('and reports no step for an order that ended elsewhere', () => {
    const view = trackingView(order({ shippingStatus: 'RETURNED' }), window);
    expect(view.step).toBeNull();
    expect(view.stepLabelAr).toBeNull();
  });
});

describe('an estimate is offered only while it is still an answer', () => {
  it('quotes the measured window on the way', () => {
    expect(trackingView(order({ shippingStatus: 'SHIPPED' }), window).eta).toMatch(/يومين/);
  });

  it('says nothing once it arrived', () => {
    expect(trackingView(order({ shippingStatus: 'DELIVERED' }), window).eta).toBeNull();
    expect(trackingView(order({ shippingStatus: 'DELIVERED' }), window).finished).toBe(true);
  });

  it('and nothing when nothing was measured', () => {
    expect(trackingView(order({ shippingStatus: 'SHIPPED' }), null).eta).toBeNull();
  });

  it('knows which orders are over', () => {
    expect(trackingView(order(), window).finished).toBe(false);
    expect(trackingView(order({ shippingStatus: 'CANCELLED' }), window).finished).toBe(true);
  });
});

describe('the door answers the same way to every wrong guess', () => {
  const src = () => stripComments(repoFile('src/app/api/public/stores/[store]/track/route.ts'));

  /**
   * A different sentence for «wrong phone» and «no such order» is a way to
   * ask «does this order exist» one guess at a time — which is how somebody
   * with a list of phone numbers finds out who bought what.
   */
  it('has one refusal and uses it everywhere', () => {
    const body = src();
    expect(body).toContain('TRACKING_NOT_FOUND');
    /**
     * Counting uses of the helper proved nothing — measured: writing one
     * refusal by hand still left six calls to it. The rule is that the file
     * builds a 404 in ONE place, so there is nowhere a second sentence can
     * be written.
     */
    expect((body.match(/status: 404/g) ?? []).length, 'رفض ثانٍ مكتوب بيده').toBe(1);
    expect((body.match(/notFound\(\)/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });

  /**
   * A phone number in a URL is in the browser's history, the access log,
   * the next page's referrer, and anything sitting between. The shape of
   * the request IS the privacy decision.
   */
  it('takes the phone in a body, never in a URL', () => {
    expect(src()).toMatch(/export async function POST/);
    expect(src(), 'صفحة التتبّع تقبل GET').not.toMatch(/export async function GET/);
    expect(src()).toMatch(/await req\.json\(\)/);
  });

  /** Two limits, guarding two different attacks — see the note in the route. */
  it('limits by machine and by phone', () => {
    expect(src()).toMatch(/track_ip:/);
    expect(src()).toMatch(/track_phone:/);
  });

  /** And the select is the privacy rule: it cannot return what it never read. */
  it.each(['address', 'customerNotes', 'totalAmount', 'sellingPrice', 'productNameSnapshot'])(
    'never reads %s out of the database',
    (column) => {
      expect(src()).not.toContain(`${column}: true`);
    }
  );
});

describe('one promise, on both screens', () => {
  /**
   * A thank-you page that says «سنتصل خلال ساعة» and a tracking page that
   * says «خلال يوم» is one shop contradicting itself between two screens
   * the same customer opens four minutes apart.
   */
  it('says what happens next in one place', () => {
    expect(WHAT_HAPPENS_NEXT_AR.length).toBeGreaterThan(0);
    for (const line of WHAT_HAPPENS_NEXT_AR) expect(line).toMatch(/[؀-ۿ]/);
  });

  it('and the refusal is a sentence a person can act on', () => {
    expect(TRACKING_NOT_FOUND).toMatch(/[؀-ۿ]/);
    expect(TRACKING_NOT_FOUND).toMatch(/تأكّد/);
  });
});
