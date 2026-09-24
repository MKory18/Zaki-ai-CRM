import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A LANDING PAGE'S IMAGES REACH THE VISITOR.
 *
 * Blocks, theme and add-ons stored their images as /api/media links, which
 * need a session — so a hero, a gallery, a slider and an upsell's photo were
 * broken for every visitor. The page is built with public links that name
 * it. A preview is the signed-in seller in the dashboard's frame and keeps
 * the private links, which work for them and never expire.
 */

const { db, verifyPreviewToken } = vi.hoisted(() => ({
  db: {
    landingPage: { findFirst: vi.fn(), update: vi.fn() },
    offer: { findMany: vi.fn(async () => []) },
    landingPageRecommendation: { findMany: vi.fn(async () => []) },
    region: { findMany: vi.fn(async () => []) },
  },
  verifyPreviewToken: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'user-agent': 'Googlebot/2.1' }) }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); } }));
vi.mock('@/lib/landing-pages', () => ({
  verifyPreviewToken: (...a: unknown[]) => verifyPreviewToken(...a),
  clampStoredHtml: (h: string | null) => h ?? '',
}));
vi.mock('@/lib/selling-currency', () => ({ sellingCurrency: async () => 'SYP' }));
vi.mock('@/lib/tracking/tracking-config', () => ({ getTrackingPixelsForPage: async () => [] }));
vi.mock('@/lib/fonts/load-store-fonts', () => ({ loadStoreFonts: async () => ({ css: '' }) }));
vi.mock('@/lib/reservation', () => ({ availableStock: async () => null }));

import { LandingPageView } from './LandingPageView';

const CO = 'e4fcc15a-05de-48e5-80d9-37bfd191adae';
const LP = '11111111-1111-4111-8111-111111111111';
const PRODUCT = '22222222-2222-4222-8222-222222222222';
const FILE = '77fca75e-9831-4147-b8ef-9431e970e963.webp';
const privateUrl = (owner: string) => `/api/media/companies/${CO}/products/${owner}/${FILE}`;

const blocks = [
  { id: 'h', type: 'hero', enabled: true, image: privateUrl(LP), headline: 'عرض', subheadline: '', showPrice: false, ctaText: 'اطلب' },
  { id: 'g', type: 'gallery', enabled: true, title: '', images: [privateUrl(LP)] },
  { id: 'f', type: 'form', enabled: true, title: 'اطلب', subtitle: '' },
];

const page = {
  id: LP, name: 'العرض', slug: 'offer', isPublished: true, htmlContent: '', builderMode: 'BLOCKS',
  theme: JSON.stringify({ accent: '#b8256e', mood: 'light', font: 'tajawal', corners: 'soft', pageImage: privateUrl(LP) }),
  sections: JSON.stringify(blocks),
  product: { id: PRODUCT, name: 'كريم', basePrice: 10 }, company: { id: CO }, storeId: 's1', store: null,
};

/** Every prop value of every element in a rendered tree, as one string. */
function renderedProps(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) { node.forEach((n) => renderedProps(n, out)); return out; }
  if (node && typeof node === 'object' && 'props' in node) {
    const props = (node as { props: Record<string, unknown> }).props;
    for (const [k, v] of Object.entries(props)) {
      if (k === 'children') renderedProps(v, out);
      else out.push(JSON.stringify(v, (_key, val) => (typeof val === 'function' ? undefined : val)) ?? '');
    }
  }
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.landingPage.findFirst.mockResolvedValue(page);
  db.landingPageRecommendation.findMany.mockResolvedValue([
    { id: 'r1', product: { name: 'مرطب', basePrice: 5, image: privateUrl(PRODUCT) } },
  ] as never);
  verifyPreviewToken.mockResolvedValue(null);
});

describe('a published block page', () => {
  it('renders no private image link — blocks, theme background and add-ons alike, each naming the page', async () => {
    const tree = await LandingPageView({ target: { slug: 'offer' } });
    const text = renderedProps(tree).join('\n');
    expect(text).not.toContain('/api/media/');
    expect(text).toContain(`/api/public/media/${LP}/${LP}/${FILE}`);
    expect(text).toContain(`/api/public/media/${LP}/${PRODUCT}/${FILE}`);
  });

  it('keeps the page background photo: the public link passes the backdrop path rule', async () => {
    const tree = await LandingPageView({ target: { slug: 'offer' } });
    expect(renderedProps(tree).join('\n')).toContain(`/api/public/media/${LP}/${LP}/${FILE}\\")`);
  });
});

describe('a preview of a draft', () => {
  it('keeps the private links: the signed-in seller can see them, and they never expire', async () => {
    db.landingPage.findFirst.mockResolvedValue({ ...page, isPublished: false });
    verifyPreviewToken.mockResolvedValue({ lpId: LP });
    const tree = await LandingPageView({ target: { slug: 'offer', previewToken: 'tok' } });
    const text = renderedProps(tree).join('\n');
    expect(text).toContain(privateUrl(LP));
    expect(text).not.toContain('?p=tok');
  });
});
