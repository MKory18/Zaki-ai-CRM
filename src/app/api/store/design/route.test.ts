import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE HOME PAGE: A DRAFT NOBODY SEES, AND A LIVE ONE EVERYBODY DOES.
 *
 * The failure this guards against is a save that reaches a customer. Save
 * writes the draft and only the draft; publish is the one act that moves it
 * across, and it asks for a different permission because releasing to
 * customers is a different authority from designing.
 */

const { db, requireContext, requirePermission, logAudit } = vi.hoisted(() => ({
  db: { store: { findFirst: vi.fn(), update: vi.fn() } },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

import { GET, POST, PUT } from './route';

const HERO = { id: 'h1', type: 'hero', enabled: true, headline: 'عرض', subheadline: '', showPrice: false, ctaText: 'اطلب' };

const STORE = {
  id: 's1', slug: 'seha', name: 'صحة بلس', type: 'MULTI_PRODUCT',
  theme: null as string | null, logo: null, supportPhone: null,
  homeDraft: null as string | null, homeLive: null as string | null,
  homePublishedAt: null as Date | null, landingPageId: null, storefrontEnabled: true,
  country: { currencyCode: 'USD' },
};

const put = (sections: unknown) =>
  PUT(new Request('http://localhost/api/store/design', { method: 'PUT', body: JSON.stringify({ sections }) }));

beforeEach(() => {
  vi.resetAllMocks();
  requireContext.mockResolvedValue({ user: { id: 'u1' }, companyId: 'c1', storeId: 's1' });
  requirePermission.mockResolvedValue(undefined);
  db.store.findFirst.mockResolvedValue({ ...STORE });
  db.store.update.mockResolvedValue({});
});

describe('saving never reaches a customer', () => {
  it('writes the draft and nothing else', async () => {
    await put([HERO]);
    const data = db.store.update.mock.calls[0][0].data;
    expect(Object.keys(data)).toEqual(['homeDraft']);
    expect(JSON.parse(data.homeDraft)).toHaveLength(1);
  });

  it('asks for storefront.manage, not the publish permission', async () => {
    await put([HERO]);
    expect(requirePermission).toHaveBeenCalledWith('storefront.manage');
    expect(requirePermission).not.toHaveBeenCalledWith('storefront.publish');
  });

  it('refuses sections it cannot read, rather than storing them', async () => {
    for (const bad of [[{ id: 'x', type: 'not-a-block', enabled: true }], 'a string', 42, null]) {
      const res = await put(bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    expect(db.store.update).not.toHaveBeenCalled();
  });
});

describe('publishing is the one act a customer feels', () => {
  it('copies the SAVED draft across, and stamps when', async () => {
    db.store.findFirst.mockResolvedValue({ ...STORE, homeDraft: JSON.stringify([HERO]) });
    await POST();
    const data = db.store.update.mock.calls[0][0].data;
    expect(JSON.parse(data.homeLive)).toHaveLength(1);
    expect(data.homePublishedAt).toBeInstanceOf(Date);
  });

  it('needs storefront.publish, and does nothing without it', async () => {
    requirePermission.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }));
    await POST();
    expect(db.store.update).not.toHaveBeenCalled();
  });

  it('publishing an empty draft is allowed — a seller must be able to undo a home page', async () => {
    db.store.findFirst.mockResolvedValue({ ...STORE, homeDraft: '[]', homeLive: JSON.stringify([HERO]) });
    await POST();
    expect(JSON.parse(db.store.update.mock.calls[0][0].data.homeLive)).toEqual([]);
  });

  it('records what was live before and what became live', async () => {
    db.store.findFirst.mockResolvedValue({ ...STORE, homeDraft: JSON.stringify([HERO]), homeLive: '[]' });
    await POST();
    const entry = logAudit.mock.calls[0][0];
    expect(entry.action).toBe('STORE_HOME_PUBLISHED');
    expect(entry.previousData.live).toBe('[]');
    expect(entry.newData.live).toContain('hero');
  });
});

describe('what the screen is told', () => {
  it('both versions, and whether they differ', async () => {
    db.store.findFirst.mockResolvedValue({ ...STORE, homeDraft: JSON.stringify([HERO]), homeLive: '[]' });
    const body = await (await GET()).json();
    expect(body.draft).toHaveLength(1);
    expect(body.live).toHaveLength(0);
    expect(body.hasUnpublished).toBe(true);
  });

  it('and that there is nothing unpublished when they match', async () => {
    const same = JSON.stringify([HERO]);
    db.store.findFirst.mockResolvedValue({ ...STORE, homeDraft: same, homeLive: same });
    expect((await (await GET()).json()).hasUnpublished).toBe(false);
  });

  it('whether the storefront is even on — publishing to a closed shop shows nobody anything', async () => {
    db.store.findFirst.mockResolvedValue({ ...STORE, storefrontEnabled: false });
    expect((await (await GET()).json()).store.storefrontEnabled).toBe(false);
  });
});

describe('a Single Product store has no home page to build', () => {
  const single = { ...STORE, type: 'SINGLE_PRODUCT', landingPageId: 'lp1' };

  it('is told where its front page actually is', async () => {
    db.store.findFirst.mockResolvedValue(single);
    const body = await (await GET()).json();
    expect(body.store.singleProduct).toBe(true);
    expect(body.store.landingPageId).toBe('lp1');
  });

  it('cannot save one — the refusal is at the server, not a hidden button', async () => {
    db.store.findFirst.mockResolvedValue(single);
    const res = await put([HERO]);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('SINGLE_PRODUCT');
    expect(db.store.update).not.toHaveBeenCalled();
  });

  it('cannot publish one either', async () => {
    db.store.findFirst.mockResolvedValue(single);
    expect((await POST()).status).toBe(409);
    expect(db.store.update).not.toHaveBeenCalled();
  });
});

describe('which store', () => {
  it('is the one the session is in', async () => {
    await GET();
    expect(db.store.findFirst.mock.calls[0][0].where).toMatchObject({ id: 's1', companyId: 'c1' });
  });

  it('another company’s store reads as missing', async () => {
    db.store.findFirst.mockResolvedValue(null);
    expect((await GET()).status).toBe(404);
    expect((await put([HERO])).status).toBe(404);
    expect((await POST()).status).toBe(404);
  });
});
