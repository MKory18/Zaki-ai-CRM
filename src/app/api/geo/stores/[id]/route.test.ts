import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE STORE PANEL IS THE SECOND DOOR TO OPENING A STOREFRONT.
 *
 * It used to open anything — the Single Product screen refused an empty
 * shop, this did not. Now both go through the same rule, and a store that
 * stops being Single Product lets go of its front page.
 */

const { db, logAudit } = vi.hoisted(() => ({
  db: {
    store: { findFirst: vi.fn(), update: vi.fn() },
    landingPage: { findFirst: vi.fn() },
    product: { count: vi.fn() },
  },
  logAudit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/auth', () => ({ requireCompanyTenant: async () => ({ user: { id: 'u1' }, companyId: 'c1' }) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: async () => undefined }));
vi.mock('@/lib/landing-domain', () => ({ validateDomain: (d: string) => ({ ok: true, domain: d }), forgetHost: vi.fn() }));

import { PATCH } from './route';

const ID = '11111111-1111-4111-8111-111111111111';
const patch = (body: unknown) =>
  PATCH(new Request('http://localhost/x', { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id: ID }) });

let before: Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  before = {
    id: ID, companyId: 'c1', slug: 'mine', type: 'MULTI_PRODUCT', status: 'ACTIVE',
    storefrontEnabled: false, landingPageId: null, domain: null,
  };
  db.store.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => (where.id === ID ? before : null));
  db.store.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...before, ...data }));
  db.product.count.mockResolvedValue(0);
  db.landingPage.findFirst.mockResolvedValue(null);
});

describe('opening from the panel', () => {
  it('refuses the same empty shop the Single Product screen refuses', async () => {
    const res = await patch({ storefrontEnabled: true });
    expect(res.status).toBe(400);
    expect(db.store.update).not.toHaveBeenCalled();
  });

  it('opens a shop with something to sell', async () => {
    db.product.count.mockResolvedValue(2);
    expect((await patch({ storefrontEnabled: true })).status).toBe(200);
  });

  it('closing and pausing are never refused', async () => {
    before.storefrontEnabled = true;
    expect((await patch({ storefrontEnabled: false })).status).toBe(200);
    expect((await patch({ status: 'PAUSED' })).status).toBe(200);
  });

  it('re-typing an open store checks the new type', async () => {
    before.storefrontEnabled = true;
    db.product.count.mockResolvedValue(3); // fine for many, a catalogue for one
    const res = await patch({ type: 'SINGLE_PRODUCT' });
    expect(res.status).toBe(400);
  });
});

describe('the front page follows the type', () => {
  it('a store turned into a many-products store lets go of its front page', async () => {
    before.type = 'SINGLE_PRODUCT';
    before.landingPageId = 'page-1';
    await patch({ type: 'MULTI_PRODUCT' });
    expect(db.store.update.mock.calls[0][0].data).toMatchObject({ type: 'MULTI_PRODUCT', landingPageId: null });
  });
});
