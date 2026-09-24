import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizeAccountId, verifyAccount, listCampaigns, fetchSpend, metaDate,
  explainMetaError, MetaError,
} from './meta';

/**
 * THE TOKEN, AND THE MONEY.
 *
 * Two things worth testing hard here. The token must never leave the server
 * by a route nobody thought about — and a URL is such a route, because URLs
 * end up in logs, proxies and error reports. And the spend must survive
 * Meta's habit of returning money as a string, sometimes as an empty one:
 * a NaN reaching a Decimal column is a write that throws halfway through a
 * sync, leaving some campaigns updated and some not.
 */

const originalFetch = globalThis.fetch;
let calls: { url: string; init: RequestInit }[] = [];

function mockMeta(body: unknown, ok = true) {
  calls = [];
  globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return { ok, status: ok ? 200 : 400, json: async () => body } as Response;
  }) as typeof fetch;
}

beforeEach(() => { calls = []; });
afterEach(() => { globalThis.fetch = originalFetch; });

describe('the account id a seller pastes', () => {
  it('accepts it with the prefix and without', () => {
    expect(normalizeAccountId('act_1234567890')).toBe('act_1234567890');
    expect(normalizeAccountId('1234567890')).toBe('act_1234567890');
    expect(normalizeAccountId('  act_1234567890  ')).toBe('act_1234567890');
  });

  it('refuses anything that is not an account id', () => {
    // Being lenient about the prefix is not being lenient about the rest:
    // a path here becomes a path in a URL we then call.
    for (const bad of ['', 'act_', 'abc', 'act_12', '123/../x', 'act_12a34', '12345678901234567890123456']) {
      expect(normalizeAccountId(bad), bad).toBeNull();
    }
  });
});

describe('where the token rides', () => {
  it('goes in the header and never in the URL', async () => {
    mockMeta({ id: 'act_1234567890', name: 'متجري', currency: 'USD', account_status: 1 });
    await verifyAccount('SECRET-TOKEN-VALUE', 'act_1234567890');

    expect(calls).toHaveLength(1);
    // The one assertion that matters: a URL ends up in logs, in proxies and
    // in error reports, and a token in any of those is a token to rotate.
    expect(calls[0].url).not.toContain('SECRET-TOKEN-VALUE');
    expect(calls[0].url).not.toContain('access_token');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer SECRET-TOKEN-VALUE');
  });

  it('keeps it out of the URL on every call, not just the first', async () => {
    mockMeta({ data: [] });
    await listCampaigns('SECRET', 'act_1234567890');
    await fetchSpend('SECRET', 'act_1234567890', '2026-09-01', '2026-09-30');
    for (const c of calls) expect(c.url).not.toContain('SECRET');
  });
});

describe('checking an account before anything is stored', () => {
  it('reads back its name, currency and whether it is live', async () => {
    mockMeta({ id: 'act_99', name: 'صحة بلس', currency: 'USD', account_status: 1 });
    const acc = await verifyAccount('t', '99999999');
    expect(acc).toEqual({ id: 'act_99', name: 'صحة بلس', currency: 'USD', active: true });
  });

  it('reports a disabled account as not active rather than failing', async () => {
    // A disabled account still connects; the seller needs to be told why it
    // reports nothing, not handed a connection error.
    mockMeta({ id: 'act_99', name: 'x', currency: 'USD', account_status: 2 });
    expect((await verifyAccount('t', '99999999')).active).toBe(false);
  });

  it('refuses a malformed id without calling Meta at all', async () => {
    mockMeta({});
    await expect(verifyAccount('t', 'nonsense')).rejects.toThrow(/غير صالح/);
    expect(calls).toHaveLength(0);
  });

  it('passes Meta’s own error through', async () => {
    mockMeta({ error: { message: 'Error validating access token: Session has expired', code: 190 } }, false);
    await expect(verifyAccount('t', '99999999')).rejects.toThrow(/Session has expired/);
  });
});

describe('the spend', () => {
  it('asks per campaign, not per account', async () => {
    // Four campaigns need four numbers. One total tells a seller the month
    // was expensive and nothing about which advert to switch off.
    mockMeta({ data: [] });
    await fetchSpend('t', 'act_1234567890', '2026-09-01', '2026-09-30');
    expect(calls[0].url).toContain('level=campaign');
    expect(calls[0].url).toContain('insights');
  });

  it('reads money that arrives as a string', async () => {
    mockMeta({
      data: [{ campaign_id: '1', campaign_name: 'أ', spend: '250.75', impressions: '10000', clicks: '320' }],
    });
    const [row] = await fetchSpend('t', 'act_1234567890', '2026-09-01', '2026-09-30');
    expect(row.spend).toBe(250.75);
    expect(row.impressions).toBe(10000);
    expect(row.clicks).toBe(320);
  });

  it('never produces NaN, whatever is missing', async () => {
    // A NaN reaching a Decimal column throws halfway through a sync, leaving
    // some campaigns updated and some not.
    mockMeta({
      data: [
        { campaign_id: '1', campaign_name: 'أ' },
        { campaign_id: '2', campaign_name: 'ب', spend: '' },
        { campaign_id: '3', campaign_name: 'ج', spend: 'not-a-number' },
      ],
    });
    for (const row of await fetchSpend('t', 'act_1234567890', '2026-09-01', '2026-09-30')) {
      expect(Number.isFinite(row.spend), row.campaignId).toBe(true);
      expect(Number.isFinite(row.impressions)).toBe(true);
    }
  });

  it('survives an empty answer', async () => {
    mockMeta({});
    expect(await fetchSpend('t', 'act_1234567890', '2026-09-01', '2026-09-30')).toEqual([]);
  });

  it('sends the window in the only shape Meta accepts', async () => {
    mockMeta({ data: [] });
    await fetchSpend('t', 'act_1234567890', '2026-09-01', '2026-09-30');
    expect(decodeURIComponent(calls[0].url)).toContain('{"since":"2026-09-01","until":"2026-09-30"}');
  });
});

describe('dates', () => {
  it('formats as Meta wants them', () => {
    expect(metaDate(new Date('2026-09-24T22:00:00Z'))).toBe('2026-09-24');
  });
});

describe('errors a seller can act on', () => {
  it('tells an expired token from a missing permission', () => {
    // Different fixes. Telling them apart is the difference between a seller
    // solving it and a seller calling you.
    expect(explainMetaError(new MetaError('Session has expired', 190))).toMatch(/انتهت صلاحية الرمز/);
    expect(explainMetaError(new MetaError('permissions error', 200))).toMatch(/ads_read/);
    expect(explainMetaError(new MetaError('Unsupported get request', 100))).toMatch(/غير موجود/);
    expect(explainMetaError(new MetaError('rate limit reached', 17))).toMatch(/أعد المحاولة/);
  });

  it('passes an unfamiliar message through rather than flattening it', () => {
    // A message we did not anticipate is still one the seller can search for.
    expect(explainMetaError(new MetaError('Something new Meta invented', 999)))
      .toBe('Something new Meta invented');
  });

  it('says something useful for a failure that is not Meta’s', () => {
    expect(explainMetaError(new Error('socket hang up'))).toBe('تعذر الاتصال بميتا');
  });
});
