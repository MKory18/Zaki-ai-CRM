import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ONE SHELL. ONE HEADER. ONE FOOTER.
 *
 * `/s/<store>/p/<handle>` renders the product's shown landing page inside
 * the store's own shell, because only that route knows the «كل المنتجات»
 * back link belongs in it. `LandingPageView` ALSO wrapped a shell of its
 * own whenever the store template said `header.onFrontPage` — which is
 * true by default — so an open store's product page drew two headers, two
 * footers, and inlined the shell stylesheet twice. On the page a shopper
 * reaches from an advert.
 *
 * ── WHY THIS IS MARKUP AND NOT A GREP ──
 *
 * The bug was not in either file. Each one was right on its own: the route
 * draws a shell because it has a back link, the view draws a shell because
 * a front page needs one. It was in the JOIN, and a guard that reads
 * either source sees nothing wrong. So the two are put together here and
 * the rendered HTML is counted.
 *
 * The shell is a stub — a real one needs menus, fonts and a database — but
 * the DECISION is the real `wearsShopChrome`, called with the real default
 * theme. Which is the half that can regress: delete `inStore: true` from
 * the route and this fails with two headers.
 * ═══════════════════════════════════════════════════════════════════════
 */

const { getStorefront, storefrontProduct, storeShelf, db, notFound, redirect } = vi.hoisted(() => ({
  getStorefront: vi.fn(),
  storefrontProduct: vi.fn(),
  storeShelf: vi.fn(async (..._a: unknown[]) => [] as unknown[]),
  db: { landingPage: { findFirst: vi.fn() }, country: { findUnique: vi.fn(async () => ({ minorUnit: 2 })) } },
  notFound: vi.fn(() => { throw new Error('NOT_FOUND'); }),
  redirect: vi.fn((url: string) => { throw Object.assign(new Error('REDIRECT'), { url }); }),
}));

vi.mock('next/navigation', () => ({ notFound: () => notFound(), redirect: (u: string) => redirect(u) }));
vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/storefront', () => ({
  getStorefront: (...a: unknown[]) => getStorefront(...a),
  storefrontProduct: (...a: unknown[]) => storefrontProduct(...a),
  storeShelf: (...a: unknown[]) => storeShelf(...a),
}));

/**
 * THE SHELL, REDUCED TO WHAT IS BEING COUNTED.
 *
 * `<header>` and `<footer>` and nothing else. `footer` is honoured because
 * the real one honours it — the page's own footer block is meant to win
 * over the shop's, and a stub that always drew one would hide a second
 * footer rather than report it.
 */
vi.mock('@/components/storefront/StorefrontShell', () => ({
  StorefrontShell: ({ children, footer = true }: { children?: unknown; footer?: boolean }) => (
    <div data-shell>
      <header data-shell-header>متجر</header>
      {children as React.ReactNode}
      {footer ? <footer data-shell-footer>حقوق</footer> : null}
    </div>
  ),
}));

/**
 * THE VIEW, WITH ITS REAL DECISION AND A STUB BODY.
 *
 * `wearsShopChrome` is the shipped function, asked the same question
 * `LandingPageView` asks it, with the DEFAULT theme — the one every store
 * has until a seller changes it, and the one the bug rode in on.
 */
vi.mock('@/components/landing/LandingPageView', async () => {
  const { wearsShopChrome, DEFAULT_STORE_THEME } = await import('@/lib/store-theme');
  const { StorefrontShell } = await import('@/components/storefront/StorefrontShell');
  return {
    LandingPageView: ({ target }: { target: Record<string, unknown> }) => {
      const body = <main data-page>صفحة المنتج</main>;
      return wearsShopChrome({
        asFront: 'frontPageId' in target,
        inStore: target.inStore === true,
        hasSlug: true,
        theme: DEFAULT_STORE_THEME,
      })
        ? <StorefrontShell store={{} as never}>{body}</StorefrontShell>
        : body;
    },
  };
});

vi.mock('@/components/tracking/LandingTrackingPixels', () => ({ LandingTrackingPixels: () => null }));
vi.mock('@/lib/tracking/tracking-config', () => ({ getTrackingPixelsForPage: async () => [] }));

import { DEFAULT_STORE_THEME } from '@/lib/store-theme';
import ProductPage from './[store]/p/[sku]/page';

const store = {
  id: 's1', slug: 'sehha', companyId: 'c1', countryId: 'k1', type: 'MULTI_PRODUCT',
  landingPageId: null, currencyCode: 'SYP', countryCode: 'SY', name: 'صحة',
  theme: DEFAULT_STORE_THEME,
};

beforeEach(() => {
  vi.clearAllMocks();
  getStorefront.mockResolvedValue(store);
  storefrontProduct.mockResolvedValue({
    id: 'p1', sku: 'SKU1', handle: 'SKU1', name: 'كريم', description: null,
    image: null, basePrice: 1000, fromPrice: 1000, gallery: [], category: null, attributes: [],
  });
  db.landingPage.findFirst.mockResolvedValue({ id: 'lp1' });
  db.country.findUnique.mockResolvedValue({ minorUnit: 2 });
});

const render = async () =>
  renderToStaticMarkup(
    (await ProductPage({
      params: Promise.resolve({ store: 'sehha', sku: 'SKU1' }),
      searchParams: Promise.resolve({}),
    })) as React.ReactElement
  );

describe('a product page inside an open store', () => {
  it('draws exactly one header and one footer', async () => {
    const html = await render();
    const headers = html.match(/<header/g)?.length ?? 0;
    const footers = html.match(/<footer/g)?.length ?? 0;
    expect(headers, `ترويسة مكرّرة — عددها ${headers}`).toBe(1);
    expect(footers, `تذييل مكرّر — عددهما ${footers}`).toBe(1);
  });

  it('and exactly one shell, so the shell stylesheet goes out once', async () => {
    const html = await render();
    // The real shell inlines ~25 KB of CSS. Two of them is the same
    // stylesheet twice, on the page that decides how fast the shop feels.
    expect((html.match(/data-shell(?![-a-z])/g) ?? []).length, 'قشرتان').toBe(1);
  });

  it('and it is the store’s shell, with the way back to the shelf in it', async () => {
    // The reason this route owns the shell at all: «كل المنتجات» is a fact
    // about where the shopper is, which the page itself cannot know.
    const el = (await ProductPage({
      params: Promise.resolve({ store: 'sehha', sku: 'SKU1' }),
      searchParams: Promise.resolve({}),
    })) as { props: { back?: { href: string; label: string } } };
    expect(el.props.back).toEqual({ href: '/s/sehha', label: 'كل المنتجات' });
  });

  it('and the page still gets the campaign code and its own page id', async () => {
    // The shell must not cost the attribution: ?c= is how an advert gets
    // the credit for the sale.
    const el = (await ProductPage({
      params: Promise.resolve({ store: 'sehha', sku: 'SKU1' }),
      searchParams: Promise.resolve({ c: 'SUMMER' }),
    })) as { props: { children: { props: { target: unknown } } } };
    expect(el.props.children.props.target).toEqual({
      frontPageId: 'lp1',
      storeId: 's1',
      campaign: 'SUMMER',
      inStore: true,
    });
  });
});
