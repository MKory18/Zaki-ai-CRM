import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateWebhookToken, hashWebhookToken, tokenHashEquals, webhookUrl } from '@/lib/couriers/webhook-token';

vi.mock('@/lib/db', () => ({
  db: {
    deliveryProvider: { findUnique: vi.fn(), update: vi.fn() },
    order: { findFirst: vi.fn() },
  },
}));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(() => ({ allowed: true })),
  getClientIp: vi.fn(() => '1.2.3.4'),
}));
vi.mock('@/lib/couriers', () => ({
  mapStatusFor: vi.fn((_code: string, raw: string) => (raw === 'OUT' ? 'OUT_FOR_DELIVERY' : null)),
}));
vi.mock('@/lib/couriers/apply-event', () => ({ applyCourierEvent: vi.fn(async () => 'APPLIED') }));

const { db } = await import('@/lib/db');
const { logAudit } = await import('@/lib/audit');
const { applyCourierEvent } = await import('@/lib/couriers/apply-event');
const { mapStatusFor } = await import('@/lib/couriers');
const { POST, GET } = await import('./[token]/route');

const TOKEN = 'a'.repeat(43);
const provider = {
  id: 'p1', name: 'باشا', code: 'BASHA', companyId: 'c1',
  adapterCode: 'LOGESTECHS', apiEnabled: true, apiConfig: {}, apiCredentials: null, isActive: true,
};

const call = (body: unknown, token = TOKEN) =>
  POST(new Request('https://app.example/api/webhooks/couriers/x', { method: 'POST', body: JSON.stringify(body) }),
    { params: Promise.resolve({ token }) });

beforeEach(() => {
  vi.clearAllMocks();
  (db.deliveryProvider.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(provider);
  (db.deliveryProvider.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
  (db.order.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: 'o1', companyId: 'c1', shippingStatus: 'SHIPPED',
  });
});

describe('the token is the credential', () => {
  it('is stored only as a hash, and the hash is not the token', () => {
    const t = generateWebhookToken();
    const h = hashWebhookToken(t);
    expect(h).toHaveLength(64);
    expect(h).not.toContain(t);
    expect(hashWebhookToken(t)).toBe(h); // stable
    expect(hashWebhookToken(generateWebhookToken())).not.toBe(h); // distinct
  });

  it('compares hashes without a length-mismatch crash', () => {
    expect(tokenHashEquals('abc', 'abc')).toBe(true);
    expect(tokenHashEquals('abc', 'abcd')).toBe(false);
  });

  it('puts the secret in the path, never the query string', () => {
    const u = webhookUrl('https://app.example/', 'TOK');
    expect(u).toBe('https://app.example/api/webhooks/couriers/TOK');
    expect(u).not.toContain('?');
  });

  it('refuses a token too short to be one of ours, without a database hit', async () => {
    const res = await call({ barcode: 'BC-1', status: 'OUT' }, 'short');
    expect(res.status).toBe(403);
    expect(db.deliveryProvider.findUnique).not.toHaveBeenCalled();
  });

  it('refuses an unknown token', async () => {
    (db.deliveryProvider.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    expect((await call({ barcode: 'BC-1', status: 'OUT' })).status).toBe(403);
  });

  it('refuses a courier that has been switched off', async () => {
    (db.deliveryProvider.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ ...provider, isActive: false });
    expect((await call({ barcode: 'BC-1', status: 'OUT' })).status).toBe(403);
  });
});

describe('what it does with a push', () => {
  it('applies a recognised one', async () => {
    const res = await call({ barcode: 'BC-1', status: 'OUT' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ applied: true });
    expect(applyCourierEvent).toHaveBeenCalledOnce();
  });

  it('reads a payload wrapped in `data`', async () => {
    await call({ data: { barcode: 'BC-1', status: 'OUT' } });
    expect(applyCourierEvent).toHaveBeenCalledOnce();
  });

  it('accepts the other common field names', async () => {
    await call({ tracking_number: 'BC-1', statusCode: 'OUT' });
    expect(applyCourierEvent).toHaveBeenCalledOnce();
  });

  it('answers 200 for a barcode that is not ours — a retry storm helps nobody', async () => {
    (db.order.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await call({ barcode: 'NOPE', status: 'OUT' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ applied: false, reason: 'UNKNOWN_BARCODE' });
  });

  it('records the KEY NAMES of a shape it cannot read — never the values', async () => {
    const res = await call({ mystery: 'x', customerPhone: '0912345678', customerName: 'سارة' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ reason: 'UNRECOGNISED_PAYLOAD' });

    const logged = (logAudit as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(logged.action).toBe('COURIER_WEBHOOK_UNPARSED');
    expect(logged.newData.keys).toContain('customerPhone');
    // The phone number itself must not be anywhere in the audit row.
    expect(JSON.stringify(logged)).not.toContain('0912345678');
    expect(JSON.stringify(logged)).not.toContain('سارة');
  });

  // The bug this replaces: the status was translated through an adapter
  // built from stored credentials, so a courier with no login saved yet had
  // every push silently dropped — which is the exact week a webhook is set up.
  it('translates the courier vocabulary without needing their login', async () => {
    await call({ barcode: 'BC-1', status: 'OUT' });
    expect(mapStatusFor).toHaveBeenCalledWith('LOGESTECHS', 'OUT');
  });

  it('tells a person who opens the URL in a browser that it is alive', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accepts).toBe('POST');
    // and says nothing about whether the token in the URL was valid
    expect(JSON.stringify(body)).not.toMatch(/token|صالح|invalid/i);
  });

  it('rejects a body that is not JSON', async () => {
    const res = await POST(
      new Request('https://app.example/x', { method: 'POST', body: 'not json' }),
      { params: Promise.resolve({ token: TOKEN }) }
    );
    expect(res.status).toBe(400);
  });
});
