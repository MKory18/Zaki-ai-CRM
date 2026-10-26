import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * «خلي العدّ بالطريقتين أسبوع» — the browser's count of a visit, beside the server's.
 *
 * A real visitor to a published page is counted, with device and campaign, into its own table. Not a link-preview
 * crawler, not a page prepared ahead of a visit, not a page that is not published, not a body that is not a page id —
 * and the answer is always 204, because a beacon has nobody to read a reason.
 */

const { db, recordBrowserView, recordLandingView, resolveCampaign, ip } = vi.hoisted(() => ({
  db: { landingPage: { findFirst: vi.fn() } },
  recordBrowserView: vi.fn(),
  recordLandingView: vi.fn(),
  resolveCampaign: vi.fn(async () => 'cmp1'),
  ip: { value: 'local' },
}));
vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/campaigns-server', () => ({ resolveCampaign }));
vi.mock('@/lib/rate-limit', async (orig) => ({
  ...(await orig<typeof import('@/lib/rate-limit')>()),
  getClientIp: () => ip.value,
}));
vi.mock('@/lib/landing-views', async (orig) => ({
  ...(await orig<typeof import('@/lib/landing-views')>()),
  recordBrowserView,
  recordLandingView,
}));

import { POST } from './route';

const PAGE = '11111111-2222-4333-8444-555555555555';
const PHONE = 'Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 Mobile Safari/537.36';
const send = (body: string, headers: Record<string, string> = {}) =>
  POST(new Request('http://x/api/public/lp-view', { method: 'POST', body, headers: { 'user-agent': PHONE, 'content-type': 'text/plain', ...headers } }));

beforeEach(() => {
  vi.clearAllMocks();
  ip.value = 'local';
  db.landingPage.findFirst.mockResolvedValue({ id: PAGE, companyId: 'c1', storeId: 's1' });
});

describe('a visit', () => {
  it('is counted into the browser\'s table, with device and campaign — and never into the server\'s', async () => {
    const res = await send(JSON.stringify({ p: PAGE, c: 'RAM' }));
    expect(res.status).toBe(204);
    expect(db.landingPage.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: PAGE, isPublished: true } }));
    expect(resolveCampaign).toHaveBeenCalledWith('c1', 's1', 'RAM');
    expect(recordBrowserView).toHaveBeenCalledWith({ companyId: 'c1', storeId: 's1', landingPageId: PAGE, campaignId: 'cmp1', device: 'mobile' });
    expect(recordLandingView).not.toHaveBeenCalled();
  });

  it('with no campaign code is counted with none', async () => {
    await send(JSON.stringify({ p: PAGE, c: null }));
    expect(resolveCampaign).not.toHaveBeenCalled();
    expect(recordBrowserView).toHaveBeenCalledWith(expect.objectContaining({ campaignId: null }));
  });
});

describe('not a visit — and still a quiet 204', () => {
  it.each([
    ['a link-preview crawler', JSON.stringify({ p: PAGE }), { 'user-agent': 'facebookexternalhit/1.1' }],
    ['Meta\'s preload', JSON.stringify({ p: PAGE }), { 'x-purpose': 'preview' }],
    ['a browser prefetch', JSON.stringify({ p: PAGE }), { 'sec-purpose': 'prefetch;prerender' }],
    ['a body that is not JSON', 'p=' + PAGE, {}],
    ['an id that is not a page id', JSON.stringify({ p: '../../etc' }), {}],
  ])('NEGATIVE: %s', async (_name, body, headers) => {
    const res = await send(body, headers as Record<string, string>);
    expect(res.status).toBe(204);
    expect(recordBrowserView).not.toHaveBeenCalled();
  });

  it('NEGATIVE: a page that is not published (a draft, a preview) — the lookup asks for published only', async () => {
    db.landingPage.findFirst.mockResolvedValue(null);
    await send(JSON.stringify({ p: PAGE }));
    expect(recordBrowserView).not.toHaveBeenCalled();
  });

  it('NEGATIVE: a campaign code with characters no code has is dropped, the visit still counted', async () => {
    await send(JSON.stringify({ p: PAGE, c: "x' OR 1=1" }));
    expect(resolveCampaign).not.toHaveBeenCalled();
    expect(recordBrowserView).toHaveBeenCalledWith(expect.objectContaining({ campaignId: null }));
  });
});

describe('a flood from one address', () => {
  it('stops counting after 60 a minute for one page — only when the address is known', async () => {
    ip.value = '203.0.113.9';
    for (let i = 0; i < 61; i++) await send(JSON.stringify({ p: PAGE }));
    expect(recordBrowserView).toHaveBeenCalledTimes(60);
  });

  it('NEGATIVE: behind no trusted proxy every visitor shares one address, so the busy hour is never cut', async () => {
    for (let i = 0; i < 80; i++) await send(JSON.stringify({ p: PAGE }));
    expect(recordBrowserView).toHaveBeenCalledTimes(80);
  });
});
