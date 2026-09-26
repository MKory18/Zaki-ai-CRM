import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  validateEventName, collidesWithBrowserPixel, isTooOldForMeta,
  conversionEventId, isTrigger, isValueSource, SUGGESTED_EVENT_NAMES,
  CONVERSION_TRIGGERS, TRIGGER_AR, TRIGGER_HINT_AR,
} from './types';
import { sendEvents, verifyPixelToken, explainCapiError, CapiError } from './meta-capi';
import { eventTimeFor, conversionValue } from './emit';
import { buildUserData } from './hash';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function mockFetch(reply: unknown, ok = true, status = 200) {
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return { ok, status, json: async () => reply } as Response;
  }) as unknown as typeof fetch;
  return calls;
}

describe('event names', () => {
  it('accepts what Meta can actually use', () => {
    expect(validateEventName('OrderDelivered')).toBe('OrderDelivered');
    expect(validateEventName('  lead_submitted ')).toBe('lead_submitted');
    expect(validateEventName('A_1')).toBe('A_1');
  });

  it('refuses the names that are accepted by the API and useless afterwards', () => {
    // Each of these is taken by the endpoint and then cannot be selected
    // when building a custom conversion — a failure that looks like success
    // until somebody tries to use it a week later.
    expect(validateEventName('طلب موصّل')).toBeNull();
    expect(validateEventName('Order Delivered')).toBeNull();
    expect(validateEventName('order-delivered')).toBeNull();
    expect(validateEventName('1Order')).toBeNull();
    expect(validateEventName('Ab')).toBeNull();
    expect(validateEventName('')).toBeNull();
    expect(validateEventName('X'.repeat(41))).toBeNull();
  });

  it('knows which names the browser pixel already sends', () => {
    // Naming one of these double-counts: the form submission AND the
    // delivery both land as Purchase, reported ROAS doubles, and a campaign
    // gets scaled on a number that was never real.
    expect(collidesWithBrowserPixel('Purchase')).toBe(true);
    expect(collidesWithBrowserPixel('ViewContent')).toBe(true);
    expect(collidesWithBrowserPixel('OrderDelivered')).toBe(false);
  });

  it('suggests a distinct, valid name for every moment', () => {
    for (const t of CONVERSION_TRIGGERS) {
      const name = SUGGESTED_EVENT_NAMES[t];
      expect(validateEventName(name)).toBe(name);
      expect(collidesWithBrowserPixel(name)).toBe(false);
    }
    expect(new Set(Object.values(SUGGESTED_EVENT_NAMES)).size).toBe(CONVERSION_TRIGGERS.length);
  });

  it('describes every moment to the seller', () => {
    for (const t of CONVERSION_TRIGGERS) {
      expect(TRIGGER_AR[t]).toBeTruthy();
      expect(TRIGGER_HINT_AR[t]).toBeTruthy();
    }
  });
});

describe('the seven-day window', () => {
  const now = new Date('2026-09-24T12:00:00Z');

  it('lets a normal delivery through', () => {
    expect(isTooOldForMeta(new Date('2026-09-22T12:00:00Z'), now)).toBe(false);
    expect(isTooOldForMeta(new Date('2026-09-17T13:00:00Z'), now)).toBe(false);
  });

  it('catches the late courier before it becomes five pointless retries', () => {
    expect(isTooOldForMeta(new Date('2026-09-16T12:00:00Z'), now)).toBe(true);
    expect(isTooOldForMeta(new Date('2026-08-01T12:00:00Z'), now)).toBe(true);
  });
});

describe('event id', () => {
  it('is stable, so a row sent twice is still counted once by Meta', () => {
    const a = conversionEventId('11111111-2222-3333-4444-555555555555', 'order-9');
    const b = conversionEventId('11111111-2222-3333-4444-555555555555', 'order-9');
    expect(a).toBe(b);
  });

  it('differs per conversion and per order', () => {
    expect(conversionEventId('aaaaaaaa-1', 'o1')).not.toBe(conversionEventId('bbbbbbbb-1', 'o1'));
    expect(conversionEventId('aaaaaaaa-1', 'o1')).not.toBe(conversionEventId('aaaaaaaa-1', 'o2'));
  });
});

describe('the moment a conversion describes', () => {
  const order = {
    createdAt: new Date('2026-09-20T09:00:00Z'),
    confirmedAt: new Date('2026-09-20T15:00:00Z'),
    deliveredAt: new Date('2026-09-23T11:00:00Z'),
  };

  it('is when it happened, never when the worker got round to it', () => {
    expect(eventTimeFor('order.created', order)).toEqual(order.createdAt);
    expect(eventTimeFor('order.confirmed', order)).toEqual(order.confirmedAt);
    expect(eventTimeFor('order.delivered', order)).toEqual(order.deliveredAt);
  });

  it('falls back to creation rather than to now', () => {
    // `now` would push every conversion onto the day the worker ran and
    // quietly destroy the day-by-day reporting a seller decides on.
    const partial = { ...order, confirmedAt: null, deliveredAt: null };
    expect(eventTimeFor('order.delivered', partial)).toEqual(order.createdAt);
    expect(eventTimeFor('order.confirmed', partial)).toEqual(order.createdAt);
  });
});

describe('what the conversion was worth', () => {
  it('reports a COMPLETE delivery at full value, not zero', () => {
    // collectedAmount is null on a whole delivery — it is recorded only on
    // a partial one. Reading null as zero would report every complete sale
    // as worthless, which is the single most damaging bug possible here.
    expect(conversionValue('COLLECTED_AMOUNT', { totalAmount: 32, collectedAmount: null })).toBe(32);
  });

  it('reports a PARTIAL delivery at what was actually handed over', () => {
    expect(conversionValue('COLLECTED_AMOUNT', { totalAmount: 40, collectedAmount: 23 })).toBe(23);
    // Prisma hands back a Decimal, not a number.
    expect(conversionValue('COLLECTED_AMOUNT', { totalAmount: 40, collectedAmount: '23.50' })).toBe(23.5);
  });

  it('uses the order total when that is what the seller chose', () => {
    expect(conversionValue('ORDER_TOTAL', { totalAmount: 40, collectedAmount: 23 })).toBe(40);
  });

  it('sends no value at all when asked for none', () => {
    expect(conversionValue('NONE', { totalAmount: 40, collectedAmount: 23 })).toBeNull();
  });

  it('never produces NaN or a negative', () => {
    expect(conversionValue('ORDER_TOTAL', { totalAmount: null, collectedAmount: null })).toBe(0);
    expect(conversionValue('COLLECTED_AMOUNT', { totalAmount: null, collectedAmount: 'abc' })).toBe(0);
    expect(conversionValue('ORDER_TOTAL', { totalAmount: -5, collectedAmount: null })).toBe(0);
  });

  it('rounds to two places, because money has two', () => {
    expect(conversionValue('ORDER_TOTAL', { totalAmount: 10.005, collectedAmount: null })).toBe(10.01);
  });
});

describe('sending to Meta', () => {
  const event = {
    event_name: 'OrderDelivered',
    event_time: 1_758_700_000,
    event_id: 'abc.order-1',
    action_source: 'website' as const,
    user_data: buildUserData({ phone: '0791234567' }),
  };

  it('never puts the token in the URL', async () => {
    const calls = mockFetch({ events_received: 1, fbtrace_id: 'T1' });
    await sendEvents('123456789', 'SECRET_TOKEN', [event]);
    expect(calls[0].url).not.toContain('SECRET_TOKEN');
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer SECRET_TOKEN');
    expect(calls[0].url).toContain('/123456789/events');
  });

  it('sends the test code only when there is one', async () => {
    let calls = mockFetch({ events_received: 1 });
    await sendEvents('1', 't', [event]);
    expect(JSON.parse(String(calls[0].init?.body)).test_event_code).toBeUndefined();

    calls = mockFetch({ events_received: 1 });
    await sendEvents('1', 't', [event], 'TEST123');
    expect(JSON.parse(String(calls[0].init?.body)).test_event_code).toBe('TEST123');
  });

  it('does not call Meta at all for an empty batch', async () => {
    const calls = mockFetch({});
    const res = await sendEvents('1', 't', []);
    expect(calls.length).toBe(0);
    expect(res.received).toBe(0);
  });

  it('keeps Meta trace id, which is what they ask for when you complain', async () => {
    mockFetch({ events_received: 2, fbtrace_id: 'AbC123' });
    const res = await sendEvents('1', 't', [event, event]);
    expect(res).toEqual({ received: 2, traceId: 'AbC123' });
  });

  it('marks a rate limit retryable and a bad token not', async () => {
    mockFetch({ error: { message: 'rate limit', code: 17 } }, false, 400);
    const rate = await sendEvents('1', 't', [event]).catch((e) => e);
    expect(rate).toBeInstanceOf(CapiError);
    expect(rate.retryable).toBe(true);

    mockFetch({ error: { message: 'Invalid OAuth access token', code: 190 } }, false, 400);
    const bad = await sendEvents('1', 't', [event]).catch((e) => e);
    // Retrying a rejected token five times only delays the moment somebody
    // reads the message.
    expect(bad.retryable).toBe(false);
  });

  it('treats a 5xx as worth trying again', async () => {
    mockFetch({ error: { message: 'boom' } }, false, 503);
    const e = await sendEvents('1', 't', [event]).catch((x) => x);
    expect(e.retryable).toBe(true);
  });

  it('notices an error hidden in a 200', async () => {
    mockFetch({ error: { message: 'Unsupported post request', code: 100 } }, true, 200);
    await expect(sendEvents('1', 't', [event])).rejects.toThrow('Unsupported post request');
  });
});

describe('verifying a token before it is stored', () => {
  it('returns the pixel name when it opens', async () => {
    const calls = mockFetch({ id: '123', name: 'بكسل المتجر' });
    const res = await verifyPixelToken('123', 'SECRET');
    expect(res.name).toBe('بكسل المتجر');
    expect(calls[0].url).not.toContain('SECRET');
  });

  it('fails rather than storing a token nobody tried', async () => {
    mockFetch({ error: { message: 'Invalid OAuth access token', code: 190 } }, false, 400);
    await expect(verifyPixelToken('123', 'bad')).rejects.toBeInstanceOf(CapiError);
  });
});

describe('explaining a failure to a seller', () => {
  it('tells apart the four things that have four different fixes', () => {
    expect(explainCapiError(new CapiError('x', 190))).toContain('انتهت صلاحية الرمز');
    expect(explainCapiError(new CapiError('x', 200))).toContain('صلاحية');
    expect(explainCapiError(new CapiError('x', 803))).toContain('البكسل غير موجود');
    expect(explainCapiError(new CapiError('x', 17))).toContain('مؤقتاً');
  });

  it('names the late-delivery case, which is nobody\'s mistake', () => {
    expect(explainCapiError(new CapiError('event_time is older than 7 days'))).toContain('7 أيام');
  });

  it('passes Meta\'s own words through when we did not anticipate them', () => {
    expect(explainCapiError(new CapiError('Something entirely new', 9999))).toBe('Something entirely new');
    expect(explainCapiError(new Error('not ours'))).toBe('تعذر الاتصال بميتا');
  });
});

describe('the vocabulary is closed', () => {
  it('accepts only the three moments the orders actually announce', () => {
    expect(isTrigger('order.delivered')).toBe(true);
    expect(isTrigger('order.shipped')).toBe(false);
    expect(isTrigger('whatever')).toBe(false);
  });

  it('accepts only the three ways of valuing one', () => {
    expect(isValueSource('COLLECTED_AMOUNT')).toBe(true);
    expect(isValueSource('GUESS')).toBe(false);
  });
});
