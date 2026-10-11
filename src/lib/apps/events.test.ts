import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';

const { db, decryptSecret } = vi.hoisted(() => ({
  db: {
    appInstall: { findMany: vi.fn() },
    appDelivery: { createMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  },
  decryptSecret: vi.fn(),
}));
vi.mock('../db', () => ({ db }));
vi.mock('../secrets', () => ({ decryptSecret: (...a: unknown[]) => decryptSecret(...a) }));

import { APP_EVENTS, emitAppEvent, deliverOne, signPayload, MAX_ATTEMPTS } from './events';
import { goldenBodies, readContract, validate, type SignedDelivery } from './contract';

/**
 * Telling an app what happened.
 *
 * The failures that matter: announcing an event undoing the thing it
 * announced, a webhook failing silently so an integration stops without
 * anyone knowing, and a signature that can be replayed a week later.
 */

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  vi.clearAllMocks();
  decryptSecret.mockReturnValue('s3cret');
  db.appDelivery.update.mockResolvedValue({});
});

describe('announcing an event', () => {
  it('queues one delivery per app that asked for it', async () => {
    db.appInstall.findMany.mockResolvedValue([
      { id: 'i1', app: { events: '["order.created"]', webhookUrl: 'https://a.test/h' } },
      { id: 'i2', app: { events: '["order.delivered"]', webhookUrl: 'https://b.test/h' } },
    ]);
    const n = await emitAppEvent('c1', 'order.created', { orderId: 'o1' });
    expect(n).toBe(1);
    expect(db.appDelivery.createMany.mock.calls[0][0].data).toHaveLength(1);
  });

  it('asks only for enabled installs of active apps with a webhook', async () => {
    db.appInstall.findMany.mockResolvedValue([]);
    await emitAppEvent('c1', 'order.created', {});
    expect(db.appInstall.findMany.mock.calls[0][0].where).toMatchObject({
      companyId: 'c1',
      enabled: true,
      app: { status: 'ACTIVE', webhookUrl: { not: null } },
    });
  });

  it('writes nothing when nobody is listening', async () => {
    db.appInstall.findMany.mockResolvedValue([
      { id: 'i1', app: { events: '["order.shipped"]', webhookUrl: 'https://a.test/h' } },
    ]);
    expect(await emitAppEvent('c1', 'order.created', {})).toBe(0);
    expect(db.appDelivery.createMany).not.toHaveBeenCalled();
  });

  it('survives a broken events list instead of failing the order', async () => {
    db.appInstall.findMany.mockResolvedValue([
      { id: 'i1', app: { events: 'not json', webhookUrl: 'https://a.test/h' } },
    ]);
    expect(await emitAppEvent('c1', 'order.created', {})).toBe(0);
  });

  it('never throws — an order that saved has saved', async () => {
    // The whole reason this returns a number instead of throwing: an
    // integration's opinion must not be able to undo a write.
    db.appInstall.findMany.mockRejectedValue(new Error('database gone'));
    await expect(emitAppEvent('c1', 'order.created', {})).resolves.toBe(0);
  });
});

describe('the signature', () => {
  it('signs the timestamp together with the body', () => {
    // The timestamp is INSIDE the signed string, so a captured request
    // cannot be replayed next week with its signature still valid.
    const sig = signPayload('k', '1700000000000', '{"a":1}');
    const expected =
      'sha256=' + crypto.createHmac('sha256', 'k').update('1700000000000.{"a":1}').digest('hex');
    expect(sig).toBe(expected);
  });

  it('changes when the body changes', () => {
    expect(signPayload('k', '1', '{"a":1}')).not.toBe(signPayload('k', '1', '{"a":2}'));
  });

  it('changes when the moment changes', () => {
    expect(signPayload('k', '1', 'x')).not.toBe(signPayload('k', '2', 'x'));
  });
});

describe('delivering', () => {
  const delivery = {
    id: 'd1', url: 'https://a.test/h', payload: '{"event":"order.created"}',
    event: 'order.created', attempts: 0,
    install: { app: { secret: 'enc', code: 'MY_APP' } },
  };

  it('marks a 2xx delivered and stops retrying', async () => {
    db.appDelivery.findUnique.mockResolvedValue(delivery);
    fetchMock.mockResolvedValue({ status: 200 });
    expect(await deliverOne('d1')).toBe(true);
    const data = db.appDelivery.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: 'OK', responseCode: 200, nextAttemptAt: null });
  });

  it('retries a 500 rather than losing the event', async () => {
    // A developer's server being down for an hour should not cost them a
    // day of orders.
    db.appDelivery.findUnique.mockResolvedValue(delivery);
    fetchMock.mockResolvedValue({ status: 500 });
    expect(await deliverOne('d1')).toBe(false);
    const data = db.appDelivery.update.mock.calls[0][0].data;
    expect(data.status).toBe('PENDING');
    expect(data.nextAttemptAt).toBeInstanceOf(Date);
  });

  it('gives up after the last attempt instead of retrying forever', async () => {
    db.appDelivery.findUnique.mockResolvedValue({ ...delivery, attempts: MAX_ATTEMPTS - 1 });
    fetchMock.mockResolvedValue({ status: 500 });
    await deliverOne('d1');
    const data = db.appDelivery.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: 'FAILED', nextAttemptAt: null });
  });

  it('records a network failure as a retry, not a success', async () => {
    db.appDelivery.findUnique.mockResolvedValue(delivery);
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await deliverOne('d1')).toBe(false);
    expect(db.appDelivery.update.mock.calls[0][0].data.error).toContain('ECONNREFUSED');
  });

  it('refuses to send unsigned when the secret cannot be read', async () => {
    // Sending unsigned would teach the receiver to accept unsigned.
    db.appDelivery.findUnique.mockResolvedValue(delivery);
    decryptSecret.mockImplementation(() => { throw new Error('bad key'); });
    expect(await deliverOne('d1')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.appDelivery.update.mock.calls[0][0].data).toMatchObject({
      status: 'FAILED', error: 'SECRET_UNREADABLE',
    });
  });

  it('does not follow a redirect — that is a webhook pointed elsewhere', async () => {
    db.appDelivery.findUnique.mockResolvedValue(delivery);
    fetchMock.mockResolvedValue({ status: 200 });
    await deliverOne('d1');
    expect(fetchMock.mock.calls[0][1].redirect).toBe('manual');
  });

  it('sends the signature and the event in headers', async () => {
    db.appDelivery.findUnique.mockResolvedValue(delivery);
    fetchMock.mockResolvedValue({ status: 200 });
    await deliverOne('d1');
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers['X-Zaki-Event']).toBe('order.created');
    expect(headers['X-Zaki-Signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(headers['X-Zaki-Timestamp']).toMatch(/^\d+$/);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE CONTRACT THE REPLIES SYSTEM READS.
 *
 * System 7 (`MKory18/AIresponse`) consumes these six events through a
 * signed webhook, and its side of the bargain is written down at
 * `contracts/oms-app-events.v1/` — copied into this repository verbatim
 * (see `contracts/README.md`; never edited here).
 *
 * Everything below compares THIS code to THAT file. A test that restated
 * the contract in its own words would pass while the two systems drifted,
 * which is the only failure mode a contract test has.
 * ═══════════════════════════════════════════════════════════════════════
 */
describe('the contract the replies system reads', () => {
  const schema = readContract<Record<string, unknown>>('schema.json');
  const envelope = schema.properties as Record<string, Record<string, unknown>>;

  it('the six events this code emits are exactly the six the schema names', () => {
    expect([...APP_EVENTS].sort()).toEqual([...(envelope.event.enum as string[])].sort());
  });

  it('and the signature reproduces the contract’s own worked example, byte for byte', () => {
    /*
     * The one assertion that cannot be satisfied by agreeing with myself:
     * the secret, the timestamp, the body and the expected signature were
     * all written on the other side.
     */
    const d = readContract<SignedDelivery>('signed-delivery.json');
    expect(signPayload(d.secret, d.headers['X-Zaki-Timestamp'], d.body_raw)).toBe(d.signature_example);
  });

  it('and every golden body validates against the schema', () => {
    const bad: string[] = [];
    for (const { name, body } of goldenBodies()) {
      const errors = validate(schema, body);
      if (errors.length) bad.push(`${name}: ${errors.join(' · ')}`);
    }
    expect(goldenBodies().length, 'لم يُقرأ أيّ مثال — المسح لا يمسح').toBeGreaterThanOrEqual(6);
    expect(bad, `مثال من العقد لا يطابق مخطّطه:\n${bad.join('\n')}`).toEqual([]);
  });

  it('and a broken body is refused — otherwise the validator proves nothing', () => {
    const good = readContract<Record<string, unknown>>('order.created.json');
    expect(validate(schema, { ...good, event: 'order.invented' }).length, 'حدث مخترَع مرّ').toBeGreaterThan(0);
    expect(validate(schema, { ...good, extra: 1 }).length, 'حقل زائد في الغلاف مرّ').toBeGreaterThan(0);
    const { at: _at, ...noAt } = good;
    expect(validate(schema, noAt).length, 'غلاف بلا at مرّ').toBeGreaterThan(0);
    const data = good.data as Record<string, unknown>;
    expect(validate(schema, { ...good, data: { ...data, total: '185000' } }).length, 'مبلغ نصّي مرّ').toBeGreaterThan(0);
    expect(validate(schema, { ...good, data: { ...data, currency: 'syp' } }).length, 'عملة بأحرف صغيرة مرّت').toBeGreaterThan(0);
  });

  it('and emitAppEvent queues exactly {event, at, data} — and it validates', async () => {
    db.appInstall.findMany.mockResolvedValue([
      { id: 'i1', app: { events: '["order.created"]', webhookUrl: 'https://a.test/h' } },
    ]);
    db.appDelivery.createMany.mockResolvedValue({ count: 1 });

    const data = (readContract<Record<string, unknown>>('order.created.json').data) as Record<string, unknown>;
    await emitAppEvent('c1', 'order.created', data);

    const queued = db.appDelivery.createMany.mock.calls[0][0].data[0];
    const body = JSON.parse(queued.payload);
    expect(Object.keys(body).sort(), 'الغلاف ليس {event, at, data}').toEqual(['at', 'data', 'event']);
    expect(validate(schema, body), 'ما يُرسَل لا يطابق العقد').toEqual([]);
  });

  it('and deliverOne sends the four headers, signed over «ts.body», with the body untouched', async () => {
    const payload = readContract<SignedDelivery>('signed-delivery.json').body_raw;
    /*
     * THE ROW AS `deliverOne` SELECTS IT — `url`, `attempts`, `app.secret`.
     *
     * My first fixture invented `webhookUrl`, `secretEncrypted` and
     * `attempt`, and the call never happened: a double that answers a
     * shape the code does not read proves the code wrong about nothing.
     */
    db.appDelivery.findUnique.mockResolvedValue({
      id: 'd1', url: 'https://a.test/h', payload, event: 'order.shipped', attempts: 0,
      install: { app: { secret: 'enc', code: 'REPLIES' } },
    });
    fetchMock.mockResolvedValue({ status: 200 });

    await deliverOne('d1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://a.test/h');
    expect(init.body, 'الجسم أُعيد تنسيقه — والتوقيع على النصّ حرفيّاً').toBe(payload);

    const h = init.headers as Record<string, string>;
    expect(h['X-Zaki-Event']).toBe('order.shipped');
    expect(h['X-Zaki-Delivery']).toBe('d1');
    expect(h['X-Zaki-Timestamp'], 'الطابع ليس ميلي ثانية بـ13 خانة').toMatch(/^\d{13}$/);
    expect(h['X-Zaki-Signature']).toBe(signPayload('s3cret', h['X-Zaki-Timestamp'], payload));
  });
});
