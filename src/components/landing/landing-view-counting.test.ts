import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WHICH RENDERS OF A LANDING PAGE ARE VISITS.
 *
 * A real visitor, counted in the lifetime total and in the day's row with
 * their device and campaign. Not the seller's preview, and not the crawler
 * that draws a link's card in a chat.
 */

const { db, ua, recordLandingView, resolveCampaign, verifyPreviewToken } = vi.hoisted(() => ({
  db: {
    landingPage: { findFirst: vi.fn(), update: vi.fn() },
    offer: { findMany: vi.fn(async () => []) },
    landingPageRecommendation: { findMany: vi.fn(async () => []) },
    region: { findMany: vi.fn(async () => []) },
  },
  ua: { value: 'Mozilla/5.0 (iPhone) Mobile Safari' as string | null },
  recordLandingView: vi.fn(),
  resolveCampaign: vi.fn(),
  verifyPreviewToken: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('next/headers', () => ({ headers: async () => new Headers(ua.value ? { 'user-agent': ua.value } : {}) }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); } }));
vi.mock('@/lib/landing-views', async (orig) => ({
  ...(await orig<typeof import('@/lib/landing-views')>()),
  recordLandingView: (...a: unknown[]) => recordLandingView(...a),
}));
vi.mock('@/lib/campaigns-server', () => ({ resolveCampaign: (...a: unknown[]) => resolveCampaign(...a) }));
vi.mock('@/lib/landing-pages', () => ({
  verifyPreviewToken: (...a: unknown[]) => verifyPreviewToken(...a),
  clampStoredHtml: (h: string | null) => h ?? '',
}));
vi.mock('@/lib/selling-currency', () => ({ sellingCurrency: async () => 'SYP' }));
vi.mock('@/lib/tracking/tracking-config', () => ({ getTrackingPixelsForPage: async () => [] }));
vi.mock('@/lib/fonts/load-store-fonts', () => ({ loadStoreFonts: async () => ({ css: '' }) }));
vi.mock('@/lib/reservation', () => ({ availableStock: async () => null }));
// No request scope in a test: afterResponse runs the work at once.
vi.mock('next/server', () => ({ after: () => { throw new Error('outside a request'); } }));

import { LandingPageView } from './LandingPageView';

const page = {
  id: 'lp1', name: 'العرض', slug: 'offer', isPublished: true, htmlContent: '<p>hi</p>', builderMode: 'HTML',
  theme: null, sections: null, product: null, company: { id: 'c1' }, storeId: 's1', store: null,
};

const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  ua.value = 'Mozilla/5.0 (iPhone) Mobile Safari';
  db.landingPage.findFirst.mockResolvedValue(page);
  db.landingPage.update.mockResolvedValue({});
  resolveCampaign.mockResolvedValue('cmp1');
  recordLandingView.mockResolvedValue(undefined);
});

describe('a visit', () => {
  it('is counted — lifetime and the day\'s row, with device and campaign', async () => {
    await LandingPageView({ target: { slug: 'offer', campaign: 'RAM' } });
    await settle();
    expect(db.landingPage.update).toHaveBeenCalledWith({ where: { id: 'lp1' }, data: { viewsCount: { increment: 1 } } });
    expect(resolveCampaign).toHaveBeenCalledWith('c1', 's1', 'RAM');
    expect(recordLandingView).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'c1', storeId: 's1', landingPageId: 'lp1', campaignId: 'cmp1', device: 'mobile' })
    );
  });

  it('through a Single Product store\'s address counts the same way', async () => {
    await LandingPageView({ target: { frontPageId: 'lp1', storeId: 's1' } });
    await settle();
    expect(recordLandingView).toHaveBeenCalledWith(expect.objectContaining({ landingPageId: 'lp1', campaignId: null }));
  });
});

describe('not a visit', () => {
  it('a link-preview crawler', async () => {
    ua.value = 'facebookexternalhit/1.1';
    await LandingPageView({ target: { slug: 'offer' } });
    await settle();
    expect(db.landingPage.update).not.toHaveBeenCalled();
    expect(recordLandingView).not.toHaveBeenCalled();
  });

  it('the seller\'s preview', async () => {
    verifyPreviewToken.mockResolvedValue({ lpId: 'lp1' });
    await LandingPageView({ target: { slug: 'offer', previewToken: 'tok' } });
    await settle();
    expect(db.landingPage.update).not.toHaveBeenCalled();
    expect(recordLandingView).not.toHaveBeenCalled();
  });
});
