import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tiktokAdapter } from './tiktok';
import { snapchatAdapter } from './snapchat';
import { metaAdapter } from './meta';
import { AdsError, money, adDate } from './types';

/**
 * What these tests are for.
 *
 * Not "does TikTok's API work" — that is TikTok's business and it cannot be
 * asked from a test run. What is ours is the three places each adapter can
 * silently lie:
 *
 *   TikTok answers 200 for everything and puts the failure in the body, so
 *   a naive client reports a permission error as a success and then crashes
 *   twenty lines later on a missing field.
 *
 *   Snapchat reports money in MICROS, so a $500 campaign becomes
 *   500,000,000 and every ROAS on the screen is absurd.
 *
 *   All three return money as TEXT, and sometimes as an empty string, and a
 *   NaN reaching a Decimal column fails a sync halfway through.
 *
 * Each of those is a wrong NUMBER rather than an error, which is the only
 * kind of bug a seller cannot see.
 */

const realFetch = globalThis.fetch;

function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = handler(url, init);
    return { ok: true, status: 200, json: async () => body } as Response;
  }) as unknown as typeof fetch;
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => { globalThis.fetch = realFetch; });

describe('shared helpers', () => {
  it('money survives the empty string, undefined and nonsense', () => {
    expect(money('12.34')).toBe(12.34);
    expect(money('')).toBe(0);
    expect(money(undefined)).toBe(0);
    expect(money(null)).toBe(0);
    expect(money('abc')).toBe(0);
  });

  it('adDate is YYYY-MM-DD', () => {
    expect(adDate(new Date('2026-09-24T22:00:00Z'))).toBe('2026-09-24');
  });
});

describe('tiktok', () => {
  it('accepts a bare advertiser id and refuses anything else', () => {
    expect(tiktokAdapter.normalizeAccountId('7012345678901234567')).toBe('7012345678901234567');
    expect(tiktokAdapter.normalizeAccountId('  7012345678901234567 ')).toBe('7012345678901234567');
    expect(tiktokAdapter.normalizeAccountId('act_7012345678')).toBeNull();
    expect(tiktokAdapter.normalizeAccountId('12345')).toBeNull();
    expect(tiktokAdapter.normalizeAccountId('')).toBeNull();
  });

  it('treats a non-zero code in a 200 body as a failure', async () => {
    mockFetch(() => ({ code: 40001, message: 'Access token is invalid', data: {} }));
    await expect(
      tiktokAdapter.verifyAccount({ token: 't' }, '7012345678901234567')
    ).rejects.toThrow('Access token is invalid');
  });

  it('sends the token in a header, never in the URL', async () => {
    let seenUrl = '';
    let seenHeaders: Record<string, string> = {};
    mockFetch((url, init) => {
      seenUrl = url;
      seenHeaders = (init?.headers ?? {}) as Record<string, string>;
      return { code: 0, message: 'OK', data: { list: [{ advertiser_id: '7012345678901234567', advertiser_name: 'X', currency: 'USD', status: 'STATUS_ENABLE' }] } };
    });
    await tiktokAdapter.verifyAccount({ token: 'SECRET' }, '7012345678901234567');
    expect(seenUrl).not.toContain('SECRET');
    expect(seenHeaders['Access-Token']).toBe('SECRET');
  });

  it('JSON-encodes array parameters, which is the shape that returns data', async () => {
    let seenUrl = '';
    mockFetch((url) => {
      seenUrl = url;
      return { code: 0, message: 'OK', data: { list: [] } };
    });
    await tiktokAdapter.fetchSpend({ token: 't' }, '7012345678901234567', '2026-09-01', '2026-09-24');
    const q = new URL(seenUrl).searchParams;
    expect(q.get('dimensions')).toBe('["campaign_id"]');
    expect(q.get('data_level')).toBe('AUCTION_CAMPAIGN');
    expect(q.get('start_date')).toBe('2026-09-01');
  });

  it('reads spend out of metrics as numbers', async () => {
    mockFetch(() => ({
      code: 0,
      message: 'OK',
      data: {
        list: [
          { dimensions: { campaign_id: '111' }, metrics: { campaign_name: 'حملة', spend: '250.50', impressions: '12000', clicks: '340' } },
          { dimensions: { campaign_id: '222' }, metrics: { campaign_name: 'أخرى', spend: '', impressions: '', clicks: '' } },
        ],
      },
    }));
    const rows = await tiktokAdapter.fetchSpend({ token: 't' }, '7012345678901234567', '2026-09-01', '2026-09-24');
    expect(rows).toEqual([
      { campaignId: '111', campaignName: 'حملة', spend: 250.5, impressions: 12000, clicks: 340 },
      { campaignId: '222', campaignName: 'أخرى', spend: 0, impressions: 0, clicks: 0 },
    ]);
  });

  it('normalises campaign status so the screen needs no TikTok vocabulary', async () => {
    mockFetch(() => ({
      code: 0,
      message: 'OK',
      data: {
        list: [
          { campaign_id: '1', campaign_name: 'a', operation_status: 'ENABLE' },
          { campaign_id: '2', campaign_name: 'b', operation_status: 'DISABLE' },
        ],
      },
    }));
    const list = await tiktokAdapter.listCampaigns({ token: 't' }, '7012345678901234567');
    expect(list.map((c) => c.status)).toEqual(['ACTIVE', 'PAUSED']);
  });

  it('tells an expired token apart from a missing permission', () => {
    expect(tiktokAdapter.explainError(new AdsError('x', 40001))).toContain('انتهى');
    expect(tiktokAdapter.explainError(new AdsError('x', 40100))).toContain('صلاحية');
    expect(tiktokAdapter.explainError(new Error('x'))).toBe('تعذر الاتصال بتيك توك');
  });
});

describe('snapchat', () => {
  it('accepts a uuid and refuses anything else', () => {
    expect(snapchatAdapter.normalizeAccountId('8ADC3DB7-BB9B-4D3B-9B0A-4B8B3B8B3B8B')).toBe(
      '8adc3db7-bb9b-4d3b-9b0a-4b8b3b8b3b8b'
    );
    expect(snapchatAdapter.normalizeAccountId('act_123456')).toBeNull();
    expect(snapchatAdapter.normalizeAccountId('7012345678901234567')).toBeNull();
  });

  it('mints a fresh access token from the refresh token before every call', async () => {
    const calls: string[] = [];
    mockFetch((url) => {
      calls.push(url);
      if (url.includes('accounts.snapchat.com')) return { access_token: 'FRESH' };
      return {
        adaccounts: [{ adaccount: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', name: 'متجري', currency: 'USD', status: 'ACTIVE' } }],
      };
    });
    const acc = await snapchatAdapter.verifyAccount(
      { clientId: 'c', clientSecret: 's', refreshToken: 'r' },
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    );
    expect(calls[0]).toContain('accounts.snapchat.com');
    expect(acc.name).toBe('متجري');
    expect(acc.active).toBe(true);
  });

  it('divides spend by a million, because Snapchat reports micros', async () => {
    mockFetch((url) => {
      if (url.includes('accounts.snapchat.com')) return { access_token: 'FRESH' };
      if (url.includes('/campaigns')) {
        return { campaigns: [{ campaign: { id: 'c1', name: 'حملة سناب', status: 'ACTIVE' } }] };
      }
      return {
        total_stats: [
          { total_stat: { id: 'c1', stats: { spend: 500_000_000, impressions: 90000, swipes: 1200 } } },
        ],
      };
    });
    const rows = await snapchatAdapter.fetchSpend(
      { clientId: 'c', clientSecret: 's', refreshToken: 'r' },
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      '2026-09-01',
      '2026-09-24'
    );
    expect(rows).toEqual([
      { campaignId: 'c1', campaignName: 'حملة سناب', spend: 500, impressions: 90000, clicks: 1200 },
    ]);
  });

  it('says plainly when the refresh itself failed, which is a different fix', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error_description: 'Invalid refresh token' }),
    })) as unknown as typeof fetch;

    const err = await snapchatAdapter
      .verifyAccount({ clientId: 'c', clientSecret: 's', refreshToken: 'bad' }, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
      .catch((e) => e);
    expect(err).toBeInstanceOf(AdsError);
    expect(snapchatAdapter.explainError(err)).toContain('refresh token');
  });

  it('never puts the minted token in a URL', async () => {
    const urls: string[] = [];
    mockFetch((url) => {
      urls.push(url);
      if (url.includes('accounts.snapchat.com')) return { access_token: 'FRESH' };
      return { campaigns: [] };
    });
    await snapchatAdapter.listCampaigns(
      { clientId: 'c', clientSecret: 's', refreshToken: 'r' },
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    );
    expect(urls.some((u) => u.includes('FRESH'))).toBe(false);
  });
});

describe('every adapter keeps the same contract', () => {
  const all = [metaAdapter, tiktokAdapter, snapchatAdapter];

  it('asks for at least one field and takes its hint from one of them', () => {
    for (const a of all) {
      expect(a.fields.length).toBeGreaterThan(0);
      expect(a.fields.map((f) => f.key)).toContain(a.hintField);
    }
  });

  it('marks every field that holds a secret as secret', () => {
    for (const a of all) {
      for (const f of a.fields) {
        if (/secret|token|key/i.test(f.key)) expect(f.secret).toBe(true);
      }
    }
  });

  it('gives a seller somewhere to go and something to do', () => {
    for (const a of all) {
      expect(a.help.url).toMatch(/^https:\/\//);
      expect(a.help.steps.length).toBeGreaterThan(1);
    }
  });

  it('refuses an empty account id rather than calling out with one', () => {
    for (const a of all) expect(a.normalizeAccountId('')).toBeNull();
  });
});
