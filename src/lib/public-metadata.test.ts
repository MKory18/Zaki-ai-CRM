import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A PUBLIC PAGE IS NAMED AND ICONED BY ITS STORE.
 *
 * Every landing page and storefront carried the dashboard's title and the
 * framework's default icon — in the tab and in every shared link's card.
 */

const { db } = vi.hoisted(() => ({ db: { landingPage: { findFirst: vi.fn() } } }));
vi.mock('./db', () => ({ db }));

import { landingPageMetadata, publicTitle, storeIcons } from './public-metadata';

beforeEach(() => vi.clearAllMocks());

describe('the title', () => {
  it('is what is sold, then the store', async () => {
    db.landingPage.findFirst.mockResolvedValue({ name: 'عرض الشتاء', product: { name: 'كريم' }, store: { name: 'صحة', favicon: null, logo: null } });
    expect((await landingPageMetadata('offer')).title).toBe('كريم — صحة');
  });

  it('falls back to the page name when it sells nothing, and skips what is missing', () => {
    expect(publicTitle('عرض', null)).toBe('عرض');
    expect(publicTitle(undefined, 'صحة')).toBe('صحة');
  });

  it('never says the store twice when its tagline already names it', () => {
    expect(publicTitle('صحة بلس', 'صحة بلس — منتجات العناية')).toBe('صحة بلس — منتجات العناية');
    expect(publicTitle('صحة بلس', 'منتجات العناية')).toBe('صحة بلس — منتجات العناية');
  });

  it('is read from the page /lp/<slug> renders: published, the oldest holding the slug', async () => {
    db.landingPage.findFirst.mockResolvedValue(null);
    expect((await landingPageMetadata('gone')).title).toBe('غير متاح');
    expect(db.landingPage.findFirst.mock.calls[0][0]).toMatchObject({ where: { slug: 'gone', isPublished: true }, orderBy: { createdAt: 'asc' } });
  });
});

describe('the icon', () => {
  it('is the store\u2019s favicon, its logo when it has none, and none rather than someone else\u2019s', () => {
    expect(storeIcons({ name: 's', favicon: '/f.webp', logo: '/l.webp' })).toEqual({ icon: '/f.webp' });
    expect(storeIcons({ name: 's', favicon: null, logo: '/l.webp' })).toEqual({ icon: '/l.webp' });
    expect(storeIcons({ name: 's', favicon: null, logo: null })).toBeUndefined();
    expect(storeIcons(null)).toBeUndefined();
  });
});
