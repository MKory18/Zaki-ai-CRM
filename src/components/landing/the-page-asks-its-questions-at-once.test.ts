import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE FIVE READS OF A BLOCK PAGE ARE ASKED AT ONCE.
 *
 * The store's fonts, the stock, the ratings, the offer's ending and the trust row each need only the page — and they
 * ran one after another, five round trips before a shopper on a Syrian phone saw anything. Asked together now; the
 * answers and the «only when the page has the block» rule are the same.
 */

const { db, gate, calls, reads } = vi.hoisted(() => {
  const calls: string[] = [];
  let open!: () => void;
  const gate = { promise: new Promise<void>((r) => (open = r)), open: () => open() };
  // Each read records that it STARTED, then waits on the one gate: if they ran in a chain, only the first could start.
  const read = <T,>(name: string, value: T) => async () => {
    calls.push(name);
    await gate.promise;
    return value;
  };
  return {
    calls,
    gate,
    reads: {
      fonts: read('fonts', { css: '' }),
      stock: read('stock', 7),
      reviews: read('reviews', null),
      endings: read('endings', []),
      facts: read('facts', { cod: true }),
    },
    db: {
      landingPage: { findFirst: vi.fn(), update: vi.fn(async () => ({})) },
      offer: { findMany: vi.fn(async () => []) },
      landingPageRecommendation: { findMany: vi.fn(async () => []) },
      region: { findMany: vi.fn(async () => []) },
      $queryRawUnsafe: vi.fn(async () => []),
    },
  };
});

vi.mock('@/lib/db', () => ({ db }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'user-agent': 'facebookexternalhit/1.1' }) }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); } }));
vi.mock('@/lib/landing-pages', () => ({ verifyPreviewToken: vi.fn(), clampStoredHtml: (h: string | null) => h ?? '' }));
vi.mock('@/lib/selling-currency', () => ({ sellingCurrency: async () => 'USD' }));
vi.mock('@/lib/tracking/tracking-config', () => ({ getTrackingPixelsForPage: async () => [] }));
vi.mock('@/lib/fonts/load-store-fonts', () => ({ loadStoreFonts: () => reads.fonts() }));
vi.mock('@/lib/reservation', () => ({ availableStock: () => reads.stock() }));
vi.mock('@/lib/product-reviews', () => ({ shownReviews: () => reads.reviews() }));
vi.mock('@/lib/selling-facts', async (orig) => ({
  ...(await orig<typeof import('@/lib/selling-facts')>()),
  sellingFacts: () => reads.facts(),
}));
vi.mock('@/lib/offers', async (orig) => ({
  ...(await orig<typeof import('@/lib/offers')>()),
  activeOffersFor: async () => [],
  offerEndings: () => reads.endings(),
}));
vi.mock('next/server', () => ({ after: () => { throw new Error('outside a request'); } }));

import { LandingPageView } from './LandingPageView';

const blocks = (types: string[]) =>
  JSON.stringify(types.map((type, i) => ({ id: `${type}-${i}`, type, enabled: true, ...(type === 'urgency' ? { countdown: 'offer' } : {}) })));

const page = (types: string[]) => ({
  id: 'lp1', name: 'العرض', slug: 'offer', isPublished: true, htmlContent: null, builderMode: 'BLOCKS', theme: null,
  sections: blocks(types), product: { id: 'p1', name: 'كريم', basePrice: 20, reviewMode: 'AUTO', image: null },
  company: { id: 'c1' }, storeId: 's1', store: null,
});

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
});

describe('a block page with ratings and an offer countdown', () => {
  it('starts all five reads before any of them answers', async () => {
    db.landingPage.findFirst.mockResolvedValue(page(['hero', 'reviews', 'urgency', 'form']));
    const rendering = LandingPageView({ target: { slug: 'offer' } });
    await vi.waitFor(() => expect(calls).toHaveLength(5));
    expect([...calls].sort()).toEqual(['endings', 'facts', 'fonts', 'reviews', 'stock']);
    gate.open();
    await rendering;
  });
});

describe('the «only when the page has the block» rule still holds', () => {
  it('NEGATIVE: a page with no ratings block and no countdown asks for neither', async () => {
    db.landingPage.findFirst.mockResolvedValue(page(['hero', 'form']));
    gate.open();
    await LandingPageView({ target: { slug: 'offer' } });
    expect(calls).not.toContain('reviews');
    expect(calls).not.toContain('endings');
    expect(calls).toEqual(expect.arrayContaining(['fonts', 'stock', 'facts']));
  });
});
