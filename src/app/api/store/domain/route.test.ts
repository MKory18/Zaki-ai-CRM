import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE DOMAIN API.
 *
 * The property that matters: `domainVerifiedAt` is written by a real lookup
 * and by nothing else. Binding a hostname, re-binding it, or asking nicely
 * must never produce a «متحقَّق» badge.
 */

const { db, requireContext, requirePermission, logAudit, checkDomain, forgetHost } = vi.hoisted(() => ({
  db: { store: { findFirst: vi.fn(), update: vi.fn() }, landingPage: { findFirst: vi.fn() } },
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

import { GET, POST, PUT } from './route';

const STORE = {
  id: 's1', slug: 'seha', domain: 'shop.example.com',
  domainVerifiedAt: null as Date | null, domainCheck: null as string | null, storefrontEnabled: true,
};

const put = (domain: string) =>
  PUT(new Request('http://localhost/api/store/domain', {
    method: 'PUT',
    headers: { host: 'app.example.com' },
    body: JSON.stringify({ domain }),
  }));

const PASS = {
  status: 'VERIFIED', detail: 'ok', ownership: true, routing: true,
  ssl: 'VALID', found: { txt: [], a: [], cname: [] }, checkedAt: new Date().toISOString(),
};
const PENDING = { ...PASS, status: 'PENDING', ownership: true, routing: false, ssl: 'UNKNOWN' };

beforeEach(() => {
  vi.resetAllMocks();
  process.env.APP_DOMAIN = 'zaki.app';
  requireContext.mockResolvedValue({ user: { id: 'u1' }, companyId: 'c1', storeId: 's1' });
  requirePermission.mockResolvedValue(undefined);
  // The route asks store.findFirst two different questions: "which store am
  // I in" (by id) and "does another store hold this hostname" (id: not mine).
  // A blunt mock answers yes to both and every bind looks like a clash.
  db.store.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
    where.id && typeof where.id === 'object' ? null : { ...STORE }
  );
  db.store.update.mockResolvedValue({});
  db.landingPage.findFirst.mockResolvedValue(null);
  checkDomain.mockResolvedValue(PASS);
});

describe('only a real lookup can verify a domain', () => {
  it('binding one leaves it unverified', async () => {
    db.store.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      where.id && typeof where.id === 'object' ? null : { ...STORE, domain: null }
    );
    await put('shop.example.com');
    expect(db.store.update.mock.calls[0][0].data).toMatchObject({
      domain: 'shop.example.com', domainVerifiedAt: null, domainCheck: null,
    });
    expect(checkDomain).not.toHaveBeenCalled();
  });

  it('re-binding a different hostname drops what the old one had earned', async () => {
    db.store.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      where.id && typeof where.id === 'object' ? null : { ...STORE, domainVerifiedAt: new Date(), domainCheck: '{}' }
    );
    await put('other.example.com');
    expect(db.store.update.mock.calls[0][0].data.domainVerifiedAt).toBeNull();
  });

  it('a passing check stamps it', async () => {
    await POST();
    const data = db.store.update.mock.calls[0][0].data;
    expect(data.domainVerifiedAt).toBeInstanceOf(Date);
    expect(JSON.parse(data.domainCheck).status).toBe('VERIFIED');
  });

  it('a check that does not pass clears it — a domain that stopped resolving is not verified', async () => {
    checkDomain.mockResolvedValue(PENDING);
    db.store.findFirst.mockResolvedValue({ ...STORE, domainVerifiedAt: new Date() });
    await POST();
    expect(db.store.update.mock.calls[0][0].data.domainVerifiedAt).toBeNull();
  });

  it('clearing the domain clears the verification with it', async () => {
    db.store.findFirst.mockResolvedValue({ ...STORE, domainVerifiedAt: new Date(), domainCheck: '{}' });
    await put('');
    expect(db.store.update.mock.calls[0][0].data).toMatchObject({
      domain: null, domainVerifiedAt: null, domainCheck: null,
    });
  });

  it('checking with no domain bound does nothing', async () => {
    db.store.findFirst.mockResolvedValue({ ...STORE, domain: null });
    expect((await POST()).status).toBe(400);
    expect(checkDomain).not.toHaveBeenCalled();
    expect(db.store.update).not.toHaveBeenCalled();
  });
});

describe('one host, one owner', () => {
  it('refuses a hostname another store holds', async () => {
    db.store.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      where.id && typeof where.id === 'object' ? { id: 'other-store' } : { ...STORE, domain: null }
    );
    expect((await put('taken.example.com')).status).toBe(409);
    expect(db.store.update).not.toHaveBeenCalled();
  });

  it('refuses a hostname a landing page holds', async () => {
    db.landingPage.findFirst.mockResolvedValue({ id: 'a-page' });
    expect((await put('taken.example.com')).status).toBe(409);
    expect(db.store.update).not.toHaveBeenCalled();
  });

  it('refuses the dashboard’s own hostname', async () => {
    expect((await put('app.example.com')).status).toBe(400);
    expect(db.store.update).not.toHaveBeenCalled();
  });
});

describe('who may do it', () => {
  it('reading is storefront.view; binding and checking are storefront.domain', async () => {
    await GET();
    expect(requirePermission).toHaveBeenCalledWith('storefront.view');
    vi.clearAllMocks();
    requirePermission.mockResolvedValue(undefined);
    db.store.findFirst.mockResolvedValue({ ...STORE });
    db.store.update.mockResolvedValue({});
    checkDomain.mockResolvedValue(PASS);
    await POST();
    expect(requirePermission).toHaveBeenCalledWith('storefront.domain');
  });

  it('writes nothing when the permission is refused', async () => {
    requirePermission.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }));
    await put('shop.example.com');
    await POST();
    expect(db.store.update).not.toHaveBeenCalled();
    expect(checkDomain).not.toHaveBeenCalled();
  });
});

describe('what the screen is handed', () => {
  it('the records to create, and the routing target', async () => {
    const body = await (await GET()).json();
    expect(body.target).toEqual({ kind: 'CNAME', value: 'zaki.app' });
    expect(body.records.map((r: { type: string }) => r.type)).toEqual(['CNAME', 'TXT']);
  });

  it('no routing row, and a null target, when the deployment has not been told where it lives', async () => {
    delete process.env.APP_DOMAIN;
    delete process.env.APP_PUBLIC_IP;
    const body = await (await GET()).json();
    expect(body.target).toBeNull();
    expect(body.records.map((r: { type: string }) => r.type)).toEqual(['TXT']);
  });

  it('whether the storefront is even switched on — a verified domain serving nothing is still nothing', async () => {
    db.store.findFirst.mockResolvedValue({ ...STORE, storefrontEnabled: false });
    expect((await (await GET()).json()).storefrontEnabled).toBe(false);
  });

  it('a corrupt stored check reads as no check, not as a crash', async () => {
    db.store.findFirst.mockResolvedValue({ ...STORE, domainCheck: '}{' });
    expect((await (await GET()).json()).lastCheck).toBeNull();
  });
});

describe('the host cache', () => {
  it('is dropped for the old and the new hostname on a rebind', async () => {
    await put('other.example.com');
    expect(forgetHost).toHaveBeenCalledWith('shop.example.com');
    expect(forgetHost).toHaveBeenCalledWith('other.example.com');
  });
});
