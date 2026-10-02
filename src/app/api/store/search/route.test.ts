import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WHO MAY DESCRIBE WHICH SHELF.
 *
 * `Category` is company-wide — deliberately, and written down in
 * `storefrontCatalog`: a store shows the categories ITS OWN products
 * carry. That makes a category id something a seller with two shops can
 * type, so every read and every write here is scoped THROUGH the products,
 * never by trusting the id.
 */

const { db, requireContext, requirePermission } = vi.hoisted(() => ({
  db: {
    store: { findFirst: vi.fn(), update: vi.fn() },
    product: { findMany: vi.fn(), findFirst: vi.fn() },
    category: { findFirst: vi.fn(), update: vi.fn() },
  } as Record<string, Record<string, ReturnType<typeof vi.fn>>>,
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: () => requireContext() }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (p: string) => requirePermission(p) }));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }));

import { GET, PUT } from './route';

const put = (body: unknown) =>
  PUT(new Request('http://localhost/api/store/search', { method: 'PUT', body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  requireContext.mockResolvedValue({ user: { id: 'u1' }, storeId: 's1', companyId: 'c1' });
  db.store.findFirst.mockResolvedValue({ id: 's1', searchSynonyms: null });
  db.product.findMany.mockResolvedValue([
    { category: { id: 'cat-1', name: 'العناية', attributeSchema: null } },
  ]);
  db.product.findFirst.mockResolvedValue({ id: 'p1' });
  db.category.findFirst.mockResolvedValue({ id: 'cat-1', attributeSchema: null });
});

describe('what the screen is shown', () => {
  it('offers only the categories this store’s products carry', async () => {
    const body = await (await GET()).json();
    expect(body.categories).toEqual([{ id: 'cat-1', name: 'العناية', fields: [] }]);
    const where = db.product.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ companyId: 'c1', storeId: 's1' });
    expect(where.categoryId).toEqual({ not: null });
  });

  it('reads the shop’s own words back', async () => {
    db.store.findFirst.mockResolvedValue({
      id: 's1',
      searchSynonyms: '[{"from":"طنين","to":"صفير"}]',
    });
    const body = await (await GET()).json();
    expect(body.synonyms).toEqual([{ from: 'طنين', to: 'صفير' }]);
  });

  it('asks to be allowed to look', async () => {
    await GET();
    expect(requirePermission).toHaveBeenCalledWith('storefront.view');
  });
});

describe('what may be written', () => {
  it('saves the shop’s words', async () => {
    const res = await put({ synonyms: [{ from: 'طنين', to: 'صفير الأذن' }] });
    expect(res.status).toBe(200);
    expect(db.store.update.mock.calls[0][0].data.searchSynonyms).toContain('طنين');
    expect(requirePermission).toHaveBeenCalledWith('storefront.manage');
  });

  it('refuses a pair that says nothing after normalising', async () => {
    const res = await put({ synonyms: [{ from: 'الأذن', to: 'الاذن' }] });
    expect(res.status).toBe(400);
    expect(db.store.update).not.toHaveBeenCalled();
  });

  it('saves a category’s questions', async () => {
    const res = await put({
      categories: {
        'cat-1': [{ key: 'size', label: 'المقاس', kind: 'select', options: ['صغير', 'كبير'], unit: '' }],
      },
    });
    expect(res.status).toBe(200);
    expect(db.category.update.mock.calls[0][0].data.attributeSchema).toContain('المقاس');
  });

  /**
   * THE ONE THAT MATTERS. A category id is company-wide, so without this a
   * seller with two shops could describe a category none of this shop's
   * products carry — and the description would reach the other shop's
   * filters.
   */
  it('refuses a category none of this store’s products carry', async () => {
    db.product.findFirst.mockResolvedValue(null);
    const res = await put({ categories: { 'cat-other': [] } });
    expect(res.status).toBe(404);
    expect(db.category.update).not.toHaveBeenCalled();
  });

  it('and scopes that check through the products, not by the id alone', async () => {
    await put({ categories: { 'cat-1': [] } });
    expect(db.product.findFirst.mock.calls[0][0].where).toMatchObject({
      companyId: 'c1',
      storeId: 's1',
      categoryId: 'cat-1',
    });
  });

  it('refuses a choice field with nothing to choose', async () => {
    const res = await put({
      categories: { 'cat-1': [{ key: 'size', label: 'المقاس', kind: 'select', options: [], unit: '' }] },
    });
    expect(res.status).toBe(400);
    expect(db.category.update).not.toHaveBeenCalled();
  });

  /** The negative control: sending neither half touches neither. */
  it('touches nothing it was not sent', async () => {
    const res = await put({});
    expect(res.status).toBe(200);
    expect(db.store.update).not.toHaveBeenCalled();
    expect(db.category.update).not.toHaveBeenCalled();
  });
});
