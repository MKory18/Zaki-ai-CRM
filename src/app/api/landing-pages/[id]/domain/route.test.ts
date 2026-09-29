import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A LANDING PAGE'S DOMAIN.
 *
 * The property that matters is the same one the store's domain has: a
 * «متحقَّق» stamp is written by a REAL LOOKUP and by nothing else. Before
 * this endpoint existed, `LandingPage.domainVerifiedAt` could only ever be
 * set to null — the column was a promise with nothing behind it.
 *
 * The negative half is what is tested hardest: who may NOT ask, which page
 * may NOT be reached, and what is NOT accepted.
 */

const { db, requireContext, requirePermission, logAudit, checkDomain, forgetHost } = vi.hoisted(() => ({
  db: { landingPage: { findFirst: vi.fn(), update: vi.fn() } },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  logAudit: vi.fn(),
  checkDomain: vi.fn(),
  forgetHost: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/landing-domain', async (orig) => ({
  ...(await orig<typeof import('@/lib/landing-domain')>()),
  forgetHost,
}));
vi.mock('@/lib/domain-verify', async (orig) => ({
  ...(await orig<typeof import('@/lib/domain-verify')>()),
  checkDomain,
}));

import { GET, POST } from './route';

const PAGE = {
  id: 'lp1', slug: 'offer-1', domain: 'page.example.com',
  domainVerifiedAt: null as Date | null, isPublished: true,
};

const PASS = {
  status: 'VERIFIED', detail: 'ok', ownership: true, routing: true,
  ssl: 'VALID', found: { txt: [], a: [], cname: [] }, checkedAt: new Date().toISOString(),
};
const HALF = { ...PASS, status: 'PENDING', ownership: true, routing: false, ssl: 'UNKNOWN' };

const ctx = { params: Promise.resolve({ id: 'lp1' }) };
const req = () => new Request('http://localhost/api/landing-pages/lp1/domain', { method: 'POST' });
const post = () => POST(req(), { params: Promise.resolve({ id: 'lp1' }) });

beforeEach(() => {
  vi.resetAllMocks();
  process.env.APP_DOMAIN = 'zaki.app';
  requireContext.mockResolvedValue({ user: { id: 'u1' }, companyId: 'c1', storeId: 's1' });
  requirePermission.mockResolvedValue(undefined);
  db.landingPage.findFirst.mockResolvedValue({ ...PAGE });
  db.landingPage.update.mockResolvedValue({});
  checkDomain.mockResolvedValue(PASS);
});

describe('only a real lookup can verify a page’s domain', () => {
  it('a passing lookup stamps it', async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(checkDomain).toHaveBeenCalledWith('page.example.com');
    expect(db.landingPage.update.mock.calls[0][0].data.domainVerifiedAt).toBeInstanceOf(Date);
  });

  it('a lookup that is only HALF there does NOT stamp it — and clears an old stamp', async () => {
    // Ownership proved, routing absent: the page is somebody's domain that
    // does not point here. That is not verified.
    checkDomain.mockResolvedValue(HALF);
    db.landingPage.findFirst.mockResolvedValue({ ...PAGE, domainVerifiedAt: new Date('2026-01-01') });
    await post();
    expect(db.landingPage.update.mock.calls[0][0].data.domainVerifiedAt).toBeNull();
  });

  it('the check result is returned as it came back, not summarised into a yes', async () => {
    checkDomain.mockResolvedValue(HALF);
    const body = await (await post()).json();
    expect(body.lastCheck).toMatchObject({ status: 'PENDING', ownership: true, routing: false });
  });

  it('and the proxy is told to forget the host, so the answer is not a minute old', async () => {
    await post();
    expect(forgetHost).toHaveBeenCalledWith('page.example.com');
  });

  it('every check is written to the audit log', async () => {
    await post();
    expect(logAudit.mock.calls[0][0]).toMatchObject({
      action: 'LANDING_PAGE_DOMAIN_CHECKED', entity: 'LandingPage', entityId: 'lp1',
    });
  });
});

describe('what is refused', () => {
  it('a page with NO domain cannot be checked', async () => {
    db.landingPage.findFirst.mockResolvedValue({ ...PAGE, domain: null });
    const res = await post();
    expect(res.status).toBe(400);
    expect(checkDomain).not.toHaveBeenCalled();
    expect(db.landingPage.update).not.toHaveBeenCalled();
  });

  it('a page that is not this company’s and this store’s is not found', async () => {
    // The WHERE carries companyId and storeId, so another tenant's page
    // cannot be reached even with its id in hand.
    db.landingPage.findFirst.mockResolvedValue(null);
    const res = await post();
    expect(res.status).toBe(404);
    expect(db.landingPage.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'lp1', companyId: 'c1', storeId: 's1',
    });
    expect(checkDomain).not.toHaveBeenCalled();
  });

  it('checking demands the edit permission, and refuses without it', async () => {
    // The real guard throws with this message contract (authorization.ts);
    // api-error maps it to 403.
    requirePermission.mockRejectedValue(new Error('Forbidden: missing required permission landing_pages.edit'));
    const res = await post();
    expect(res.status).toBe(403);
    expect(requirePermission).toHaveBeenCalledWith('landing_pages.edit');
    expect(db.landingPage.update).not.toHaveBeenCalled();
  });

  it('reading demands only the view permission', async () => {
    await GET(new Request('http://localhost/api/landing-pages/lp1/domain'), ctx);
    expect(requirePermission).toHaveBeenCalledWith('landing_pages.view');
  });

  it('reading never writes and never looks anything up', async () => {
    await GET(new Request('http://localhost/api/landing-pages/lp1/domain'), ctx);
    expect(db.landingPage.update).not.toHaveBeenCalled();
    expect(checkDomain).not.toHaveBeenCalled();
  });
});

describe('what the screen is told', () => {
  it('the records the seller must create, with the TXT token among them', async () => {
    const body = await GET(new Request('http://localhost/api/landing-pages/lp1/domain'), ctx).then((r) => r.json());
    expect(body.records.map((r: { type: string }) => r.type)).toContain('TXT');
    expect(body.records.find((r: { type: string }) => r.type === 'TXT').name)
      .toBe('_zaki-verify.page.example.com');
    expect(body.target).toEqual({ kind: 'CNAME', value: 'zaki.app' });
  });

  it('no domain means no records — not a record with an empty value in it', async () => {
    db.landingPage.findFirst.mockResolvedValue({ ...PAGE, domain: null });
    const body = await GET(new Request('http://localhost/api/landing-pages/lp1/domain'), ctx).then((r) => r.json());
    expect(body.records).toEqual([]);
  });

  it('and the internal address, which never stops working', async () => {
    const body = await GET(new Request('http://localhost/api/landing-pages/lp1/domain'), ctx).then((r) => r.json());
    expect(body.publicPath).toBe('/lp/offer-1');
  });

  it('with the server’s own address unset it says so by withholding the target', async () => {
    // Not the seller's fault and not something they can fix in DNS: inventing
    // a value here would take their page off the air.
    delete process.env.APP_DOMAIN;
    delete process.env.APP_PUBLIC_IP;
    const body = await GET(new Request('http://localhost/api/landing-pages/lp1/domain'), ctx).then((r) => r.json());
    expect(body.target).toBeNull();
    expect(body.records.some((r: { type: string }) => r.type === 'CNAME' || r.type === 'A')).toBe(false);
  });
});
