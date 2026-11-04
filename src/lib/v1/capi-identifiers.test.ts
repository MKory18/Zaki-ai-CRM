import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * `POST /api/v1/capi/identifiers` — the one answer at the door that carries
 * a customer (a phone, the click ids), and the `capi_ref` that points at it.
 *
 * What this file holds, running the real handlers with the REAL key guard:
 *
 *   · 401 / 403 / 429 — and no order is read before the key is proven
 *   · the scope is in nobody's default set, and the media buyer's ordinary
 *     key is refused it
 *   · the exact JSON, the frozen contract, `Cache-Control: no-store`
 *   · a reference opens for ITS company only; garbage and foreign ones are
 *     absent from the answer, not an error that names them
 *   · nothing is logged — not a phone, not a click id, not a reference —
 *     not even when the database fails
 *   · `capi_ref` on the attribution page: minted only for a key that holds
 *     the scope, opaque, and opening to the order it sits on
 *   · and, for every OTHER answer at this door, not one customer field
 * ═══════════════════════════════════════════════════════════════════════
 */

const h = vi.hoisted(() => ({
  db: {
    systemToken: { findUnique: vi.fn(), update: vi.fn() },
    order: { findMany: vi.fn(), findFirst: vi.fn() },
    orderItem: { findMany: vi.fn(), aggregate: vi.fn() },
    product: { findMany: vi.fn() },
    productionBatch: { findMany: vi.fn() },
    deliveryFee: { findMany: vi.fn() },
  },
  rateLimit: vi.fn(),
  activeOffersFor: vi.fn(),
  availableStock: vi.fn(),
  reservedElsewhere: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: h.db }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: (...a: unknown[]) => h.rateLimit(...a) }));
vi.mock('@/lib/offers', () => ({ activeOffersFor: (...a: unknown[]) => h.activeOffersFor(...a) }));
vi.mock('@/lib/reservation', () => ({
  availableStock: (...a: unknown[]) => h.availableStock(...a),
  reservedElsewhere: (...a: unknown[]) => h.reservedElsewhere(...a),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validate } from '../apps/contract';
import { POST as postIdentifiers } from '@/app/api/v1/capi/identifiers/route';
import { GET as getAttribution } from '@/app/api/v1/orders/attribution/route';
import { GET as getProducts } from '@/app/api/v1/products/route';
import { MAX_REFS, mintCapiRef, openCapiRef } from './capi-identifiers';
import { encryptSecret } from '../secrets';
import { MEDIABUYER_SCOPES, V1_SCOPES, V1_SCOPE_AR, V1_SYSTEMS, type V1Scope } from './system-token';
import { keyScopeLacks } from './token-granter';

const KEY = 'a'.repeat(64);
const PHONE_LOCAL = '936654998'; // stored canonical: no trunk zero, no dial code
const PHONE_E164 = '+963936654998';
const FBC = 'fb.1.1762200000000.IwAR_the_click';
const FBP = 'fb.1.1762200000000.1234567890';
const CTWA = 'ARAk_ctwa_click';

const tokenRow = (scopes: readonly string[], over: Record<string, unknown> = {}) => ({
  id: 'tok_mb',
  companyId: 'c1',
  system: 'mediabuyer',
  scopes: JSON.stringify(scopes),
  rateLimitPerMin: 60,
  expiresAt: new Date(Date.now() + 86_400_000),
  revokedAt: null,
  lastUsedAt: new Date(),
  ...over,
});

const WITH_CAPI: V1Scope[] = [...MEDIABUYER_SCOPES, 'capi.identifiers'];

const post = (body: unknown, headers: Record<string, string> = { authorization: 'Bearer zk1_test' }) =>
  new Request('https://oms.test/api/v1/capi/identifiers', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': 'mb_capi', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const get = (path: string) =>
  new Request(`https://oms.test${path}`, { headers: { authorization: 'Bearer zk1_test', 'x-request-id': 'mb_1' } });

/** What `readCapiIdentifiers` selects, with a customer and sealed ids on it. */
function idRow(over: Record<string, unknown> = {}) {
  return {
    id: 'o1',
    customerId: 'cust-1',
    ctwaClidEnc: null,
    psidEnc: null,
    pageId: null,
    wabaId: null,
    fbcEnc: encryptSecret(FBC),
    fbpEnc: encryptSecret(FBP),
    customer: { phone: PHONE_LOCAL, rawPhone: '0936654998', country: 'SY' },
    store: { country: { code: 'SY' } },
    ...over,
  };
}

function attrRow(over: Record<string, unknown> = {}) {
  return {
    id: 'o1',
    orderNumber: 'SY-0001',
    confirmationStatus: 'CONFIRMED',
    shippingStatus: 'NOT_READY',
    claimedById: null,
    shippedAt: null,
    labelPrintedAt: null,
    confirmedAt: new Date('2026-11-03T05:00:00Z'),
    deliveredAt: null,
    returnedAt: null,
    createdAt: new Date('2026-11-03T04:00:00Z'),
    updatedAt: new Date('2026-11-03T05:00:00Z'),
    totalAmount: 20,
    collectedAmount: null,
    currency: 'USD',
    rejectionReason: null,
    source: 'Landing Page',
    externalChannel: null,
    adId: '120211000000000001',
    adsetId: '120212000000000007',
    landingPageId: 'lp1',
    product: { sku: 'TRF01' },
    channel: { kind: 'LANDING_PAGE' },
    campaign: { externalId: '120210000000000009' },
    landingPage: { slug: 'kamaa-eye-water', domain: null, domainVerifiedAt: null },
    store: { country: { code: 'SY', timezone: 'Asia/Damascus', minorUnit: 2 } },
    statusLogs: [],
    contactAttempts: [],
    ...over,
  };
}

const SINCE = '/api/v1/orders/attribution?updated_since=2026-11-02T00:00:00Z';
const refFor = (orderId = 'o1', companyId = 'c1') => mintCapiRef(companyId, orderId)!;

const logs = () => [
  vi.spyOn(console, 'log').mockImplementation(() => {}),
  vi.spyOn(console, 'info').mockImplementation(() => {}),
  vi.spyOn(console, 'warn').mockImplementation(() => {}),
  vi.spyOn(console, 'error').mockImplementation(() => {}),
  vi.spyOn(console, 'debug').mockImplementation(() => {}),
];

let savedKey: string | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  savedKey = process.env.APP_ENCRYPTION_KEY;
  process.env.APP_ENCRYPTION_KEY = KEY;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-04T12:00:00Z'));
  h.rateLimit.mockReturnValue({ allowed: true, remaining: 59, retryAfterSec: 0 });
  h.db.systemToken.update.mockResolvedValue({});
  h.db.systemToken.findUnique.mockResolvedValue(tokenRow(WITH_CAPI));
  h.db.order.findMany.mockResolvedValue([idRow()]);
  h.db.order.findFirst.mockResolvedValue(null);
  h.db.orderItem.findMany.mockResolvedValue([]);
  h.db.product.findMany.mockResolvedValue([]);
  h.db.productionBatch.findMany.mockResolvedValue([]);
  h.db.deliveryFee.findMany.mockResolvedValue([]);
  h.activeOffersFor.mockResolvedValue([]);
  h.availableStock.mockResolvedValue(20);
  h.reservedElsewhere.mockResolvedValue(0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (savedKey === undefined) delete process.env.APP_ENCRYPTION_KEY;
  else process.env.APP_ENCRYPTION_KEY = savedKey;
});

describe('the scope', () => {
  it('exists, has an Arabic name, needs the keys that read orders and customers, and is nobody’s default', () => {
    expect(V1_SCOPES).toContain('capi.identifiers');
    expect(V1_SCOPE_AR['capi.identifiers']).toMatch(/[؀-ۿ]/);
    for (const s of V1_SYSTEMS) expect(s.scopes).not.toContain('capi.identifiers');
    // The granter: a person without the customers key cannot mint it.
    const orders = { permissions: [] } as never;
    expect(typeof keyScopeLacks(orders, 'capi.identifiers')).toBe('string');
  });

  it('the media buyer’s ordinary key is refused: 403 SCOPE_MISSING, before any order is read', async () => {
    h.db.systemToken.findUnique.mockResolvedValue(tokenRow(MEDIABUYER_SCOPES));
    const res = await postIdentifiers(post({ refs: [refFor()] }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatchObject({ code: 'SCOPE_MISSING', details: { required: 'capi.identifiers' } });
    expect(h.db.order.findMany).not.toHaveBeenCalled();
  });
});

describe('401 · 403 · 429', () => {
  it('no header → 401 TOKEN_MISSING; unknown, revoked or expired → 401 TOKEN_INVALID', async () => {
    const none = await postIdentifiers(post({ refs: [refFor()] }, {}));
    expect(none.status).toBe(401);
    expect((await none.json()).error.code).toBe('TOKEN_MISSING');

    for (const row of [null, tokenRow(WITH_CAPI, { revokedAt: new Date() }), tokenRow(WITH_CAPI, { expiresAt: new Date(Date.now() - 1) })]) {
      h.db.systemToken.findUnique.mockResolvedValue(row);
      const res = await postIdentifiers(post({ refs: [refFor()] }));
      expect(res.status).toBe(401);
      expect((await res.json()).error.code).toBe('TOKEN_INVALID');
    }
    expect(h.db.order.findMany).not.toHaveBeenCalled();
  });

  it('over the key’s allowance → 429 with Retry-After, and no order read', async () => {
    h.rateLimit.mockReturnValue({ allowed: false, remaining: 0, retryAfterSec: 17 });
    const res = await postIdentifiers(post({ refs: [refFor()] }));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('17');
    expect((await res.json()).error.code).toBe('RATE_LIMITED');
    expect(h.db.order.findMany).not.toHaveBeenCalled();
  });

  it('the replies system’s key (no such scope) is refused', async () => {
    h.db.systemToken.findUnique.mockResolvedValue(tokenRow(['orders.read', 'products.read'], { system: 'replies' }));
    expect((await postIdentifiers(post({ refs: [refFor()] }))).status).toBe(403);
  });
});

describe('the answer — the exact JSON', () => {
  it('a web order: the phone in E.164, the two cookies opened, the rest null', async () => {
    const ref = refFor();
    const res = await postIdentifiers(post({ refs: [ref] }));
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Request-Id')).toBe('mb_capi');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({
      items: [
        {
          ref,
          phone_e164: PHONE_E164,
          fbc: FBC,
          fbp: FBP,
          external_ref: 'cust-1',
          ctwa_clid: null,
          waba_id: null,
          page_id: null,
          psid: null,
        },
      ],
    });
  });

  it('a click-to-WhatsApp order: the sealed click id and chat account are opened too', async () => {
    h.db.order.findMany.mockResolvedValue([
      idRow({ fbcEnc: null, fbpEnc: null, ctwaClidEnc: encryptSecret(CTWA), psidEnc: encryptSecret('psid-1'), wabaId: 'w1', pageId: 'p1' }),
    ]);
    const { items } = await (await postIdentifiers(post({ refs: [refFor()] }))).json();
    expect(items[0]).toMatchObject({ fbc: null, fbp: null, ctwa_clid: CTWA, psid: 'psid-1', waba_id: 'w1', page_id: 'p1' });
  });

  it('a Jordanian number, and a country with no dial code known (no phone — never a guess)', async () => {
    h.db.order.findMany.mockResolvedValue([idRow({ customer: { phone: '791234567', rawPhone: '0791234567', country: 'JO' }, store: { country: { code: 'JO' } } })]);
    expect((await (await postIdentifiers(post({ refs: [refFor()] }))).json()).items[0].phone_e164).toBe('+962791234567');

    h.db.order.findMany.mockResolvedValue([idRow({ customer: { phone: '791234567', rawPhone: '0791234567', country: 'ZZ' }, store: { country: { code: 'ZZ' } } })]);
    expect((await (await postIdentifiers(post({ refs: [refFor()] }))).json()).items[0].phone_e164).toBeNull();
  });

  it('a column that will not open (wrong key) is null, not an error', async () => {
    h.db.order.findMany.mockResolvedValue([idRow({ fbcEnc: 'v1:00:00:00', fbpEnc: 'garbage' })]);
    const res = await postIdentifiers(post({ refs: [refFor()] }));
    expect(res.status).toBe(200);
    expect((await res.json()).items[0]).toMatchObject({ fbc: null, fbp: null });
  });

  it('fits the frozen contract', async () => {
    const DIR = join(process.cwd(), 'contracts', 'oms-mediabuyer.v1');
    const schema = JSON.parse(readFileSync(join(DIR, 'capi-identifiers.schema.json'), 'utf8'));
    const example = JSON.parse(readFileSync(join(DIR, 'capi-identifiers.example.json'), 'utf8'));
    const item = schema.properties.items.items;
    const check = (value: { items: unknown[] }) => [
      ...validate(schema, value),
      ...value.items.flatMap((i, n) => validate(item, i, `items[${n}]`)),
    ];
    expect(check(example)).toEqual([]);
    expect(check(await (await postIdentifiers(post({ refs: [refFor()] }))).json())).toEqual([]);
    // Not vacuous: a name, a missing key and a bare phone all fail.
    const one = example.items[0];
    expect(check({ items: [{ ...one, full_name: 'x' }] }).length).toBeGreaterThan(0);
    expect(check({ items: [{ ...one, phone_e164: '0936654998' }] }).length).toBeGreaterThan(0);
    const { psid: _omit, ...short } = one;
    expect(check({ items: [short] }).length).toBeGreaterThan(0);
  });
});

describe('a reference opens for its company only', () => {
  it('round-trips for the minting company, and for no other', () => {
    const ref = refFor('o9', 'c1');
    expect(ref).toMatch(/^enc:[A-Za-z0-9_-]+$/);
    expect(openCapiRef(ref, 'c1')).toBe('o9');
    expect(openCapiRef(ref, 'c2')).toBeNull();
    expect(openCapiRef('enc:' + 'A'.repeat(40), 'c1')).toBeNull();
    expect(openCapiRef('o9', 'c1')).toBeNull();
    expect(openCapiRef('enc:', 'c1')).toBeNull();
  });

  it('a reference sealed under another key is garbage here', () => {
    const ref = refFor();
    process.env.APP_ENCRYPTION_KEY = 'b'.repeat(64);
    expect(openCapiRef(ref, 'c1')).toBeNull();
  });

  it('with no encryption key there is no reference at all — null, never plaintext', () => {
    delete process.env.APP_ENCRYPTION_KEY;
    delete process.env.WHATSAPP_ENCRYPTION_KEY;
    expect(mintCapiRef('c1', 'o1')).toBeNull();
  });

  it('another company’s reference, a garbage one and a deleted order are all simply absent', async () => {
    const mine = refFor('o1', 'c1');
    const foreign = refFor('o1', 'c2');
    const gone = refFor('o404', 'c1');
    const res = await postIdentifiers(post({ refs: ['not-a-ref', foreign, gone, mine] }));
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items.map((i: { ref: string }) => i.ref)).toEqual([mine]);
    // The company in the WHERE is the token's, and only the openable ids were asked for.
    const where = h.db.order.findMany.mock.calls[0][0].where;
    expect(where.companyId).toBe('c1');
    expect([...where.id.in].sort()).toEqual(['o1', 'o404']);
  });

  it('nothing openable → no query at all', async () => {
    const res = await postIdentifiers(post({ refs: ['junk', refFor('o1', 'c2')] }));
    expect(await res.json()).toEqual({ items: [] });
    expect(h.db.order.findMany).not.toHaveBeenCalled();
  });

  it('a body that names a company is refused, not obeyed', async () => {
    const res = await postIdentifiers(post({ refs: [refFor()], companyId: 'c2' }));
    expect(res.status).toBe(422);
    expect(h.db.order.findMany).not.toHaveBeenCalled();
  });
});

describe('the body is bounded, and a refusal never repeats it', () => {
  it.each([
    ['not JSON', '{nope'],
    ['no refs', {}],
    ['empty refs', { refs: [] }],
    ['too many', { refs: Array.from({ length: MAX_REFS + 1 }, (_, i) => `enc:${i}`) }],
    ['a non-string', { refs: [123] }],
    ['a huge ref', { refs: ['x'.repeat(5000)] }],
  ])('%s → 422 VALIDATION_FAILED', async (_n, body) => {
    const res = await postIdentifiers(post(body as never));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe('VALIDATION_FAILED');
    expect(h.db.order.findMany).not.toHaveBeenCalled();
  });

  it('exactly MAX_REFS is fine', async () => {
    const refs = Array.from({ length: MAX_REFS }, (_, i) => refFor(`o${i}`));
    expect((await postIdentifiers(post({ refs }))).status).toBe(200);
  });

  it('the refusal body does not carry what was sent', async () => {
    const secret = 'enc:SECRET-LOOKING-VALUE';
    const text = await (await postIdentifiers(post({ refs: [secret, 5] }))).text();
    expect(text).not.toContain('SECRET-LOOKING-VALUE');
  });
});

describe('nothing is logged', () => {
  const SENSITIVE = [PHONE_LOCAL, PHONE_E164, FBC, FBP, CTWA, 'cust-1', '0936654998'];

  const everythingLogged = (spies: ReturnType<typeof logs>) => JSON.stringify(spies.flatMap((s) => s.mock.calls));

  it('not on success', async () => {
    const spies = logs();
    const ref = refFor();
    await postIdentifiers(post({ refs: [ref] }));
    const out = everythingLogged(spies);
    for (const v of [...SENSITIVE, ref]) expect(out).not.toContain(v);
  });

  it('and not when the database fails — a bare 500 with a fixed sentence', async () => {
    const spies = logs();
    h.db.order.findMany.mockRejectedValue(new Error('connection lost'));
    const ref = refFor();
    const res = await postIdentifiers(post({ refs: [ref] }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toEqual({ code: 'INTERNAL', message: 'Internal error', details: null });
    const out = everythingLogged(spies);
    for (const v of [...SENSITIVE, ref]) expect(out).not.toContain(v);
  });

  it('and the route and its library write to no log at all', () => {
    const files = ['src/app/api/v1/capi/identifiers/route.ts', 'src/lib/v1/capi-identifiers.ts'];
    for (const f of files) {
      const src = readFileSync(join(process.cwd(), f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/console\s*\.|logger|\blog\(/);
    }
  });
});

describe('capi_ref on the attribution page', () => {
  it('a key WITHOUT the scope gets null — exactly as before the scope existed', async () => {
    h.db.systemToken.findUnique.mockResolvedValue(tokenRow(MEDIABUYER_SCOPES));
    h.db.order.findMany.mockResolvedValue([attrRow()]);
    const { items } = await (await getAttribution(get(SINCE))).json();
    expect(items[0].capi_ref).toBeNull();
  });

  it('a key WITH it gets an opaque reference that opens to that order — and to nothing for another company', async () => {
    h.db.order.findMany.mockResolvedValue([attrRow(), attrRow({ id: 'o2' })]);
    const { items } = await (await getAttribution(get(SINCE))).json();
    for (const i of items) expect(i.capi_ref).toMatch(/^enc:[A-Za-z0-9_-]+$/);
    expect(openCapiRef(items[0].capi_ref, 'c1')).toBe('o1');
    expect(openCapiRef(items[1].capi_ref, 'c1')).toBe('o2');
    expect(openCapiRef(items[0].capi_ref, 'c2')).toBeNull();
    // Opaque: no phone, no order id, no company in the clear.
    const text = JSON.stringify(items);
    expect(text).not.toContain('c1|');
    expect(text).not.toMatch(/9639[0-9]{8}|09[0-9]{8}/);
  });

  it('and with no server key, null — the page still answers', async () => {
    delete process.env.APP_ENCRYPTION_KEY;
    delete process.env.WHATSAPP_ENCRYPTION_KEY;
    h.db.order.findMany.mockResolvedValue([attrRow()]);
    const res = await getAttribution(get(SINCE));
    expect(res.status).toBe(200);
    expect((await res.json()).items[0].capi_ref).toBeNull();
  });

  it('the reference from the page is the one the identifiers door opens (end to end)', async () => {
    h.db.order.findMany.mockResolvedValueOnce([attrRow()]);
    const { items } = await (await getAttribution(get(SINCE))).json();
    h.db.order.findMany.mockResolvedValueOnce([idRow()]);
    const res = await postIdentifiers(post({ refs: [items[0].capi_ref] }));
    expect((await res.json()).items[0]).toMatchObject({ ref: items[0].capi_ref, phone_e164: PHONE_E164 });
  });

  it('adset_id comes from the order’s own column, null when it has none', async () => {
    h.db.order.findMany.mockResolvedValue([attrRow(), attrRow({ id: 'o2', adsetId: null, adId: null })]);
    const { items } = await (await getAttribution(get(SINCE))).json();
    expect(items[0]).toMatchObject({ ad_id: '120211000000000001', adset_id: '120212000000000007' });
    expect(items[1]).toMatchObject({ ad_id: null, adset_id: null });
  });
});

describe('not one customer field in any OTHER answer — even for the strongest key and a row that carries one', () => {
  const FORBIDDEN_KEY = /^(?:name|full_?name|customer\w*|phone\w*|raw_?phone|alt_?phone|address|delivery_?address|city|email|fbc|fbp|psid|ctwa_?clid|\w*_enc|\w*Enc)$/i;
  const keysDeep = (v: unknown, out: string[] = []): string[] => {
    if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out));
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        out.push(k);
        keysDeep(x, out);
      }
    }
    return out;
  };
  const LEAK = new RegExp([PHONE_LOCAL, '0936654998', FBC, FBP, CTWA, 'أبو أحمد', 'حلب', 'psid-1', 'cust-1'].join('|'));

  it('the attribution page', async () => {
    h.db.order.findMany.mockResolvedValue([
      attrRow({
        customerId: 'cust-1',
        customer: { fullName: 'أبو أحمد', phone: PHONE_LOCAL, rawPhone: '0936654998', altPhone: '0944000000', address: 'حلب' },
        deliveryAddress: 'حلب',
        fbcEnc: encryptSecret(FBC),
        fbpEnc: encryptSecret(FBP),
        ctwaClidEnc: encryptSecret(CTWA),
        psidEnc: encryptSecret('psid-1'),
        customerNotes: 'اتصلوا مساءً',
      }),
    ]);
    const body = await (await getAttribution(get(SINCE))).json();
    expect(keysDeep(body).filter((k) => FORBIDDEN_KEY.test(k))).toEqual([]);
    expect(JSON.stringify(body)).not.toMatch(LEAK);
  });

  it('the catalogue, with every optional field', async () => {
    h.db.product.findMany.mockResolvedValue([
      {
        id: 'p1',
        sku: 'TRF01',
        name: 'ماء الكمأة',
        nameEn: 'KamaaEye',
        basePrice: 20,
        storeId: 's1',
        customer: { fullName: 'أبو أحمد', phone: PHONE_LOCAL },
        store: { countryId: 'k1', country: { currencyCode: 'USD', minorUnit: 2 } },
      },
    ]);
    h.db.order.findMany.mockResolvedValue([]);
    const res = await getProducts(
      get('/api/v1/products?fields=code,name,aliases,unit_cost_usd,price_options,stock_days,delivery_fee,return_fee,cod_fee_pct')
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // `name` here is the PRODUCT's name (the catalogue's own field), not a person's.
    expect(keysDeep(body).filter((k) => k !== 'name' && FORBIDDEN_KEY.test(k))).toEqual([]);
    expect(JSON.stringify(body)).not.toMatch(LEAK);
  });
});
