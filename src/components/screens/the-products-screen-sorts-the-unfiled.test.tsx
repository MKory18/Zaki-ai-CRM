// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE PRODUCTS SCREEN SORTS THE PRODUCTS WITH NO CATEGORY — «انتا صنف افضل» (THE OWNER, 22/10).
 *
 * The screen already counted them and offered a switch that filters to exactly them; what it did not do is sort them. The button
 * «رتّبها لي» opens the dialog on the unfiled products — ALL of them, whatever the search box says — and when the dialog's press has
 * been answered the screen closes it, reads the list again (so the count falls and the products carry their shelf) and says what
 * was done. What is held here is that wiring; the rule is in `product-categories.test.ts`, the dialog in `CategoriseDialog.test.tsx`,
 * the door in `categorise/route.test.ts`.
 * ═══════════════════════════════════════════════════════════════════════
 */

const { push, tell, nav } = vi.hoisted(() => ({ push: vi.fn(), tell: vi.fn(), nav: { params: new URLSearchParams() } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), useSearchParams: () => nav.params }));
vi.mock('next/link', () => ({ default: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock('@/context/AppContext', () => ({ useApp: () => ({ t: { products: 'المنتجات', loading: 'جارٍ التحميل…' }, locale: 'ar' }) }));
vi.mock('@/context/StoreCurrency', () => ({ useStoreCurrency: () => ({ code: 'JOD', minorUnit: 3 }) }));
vi.mock('@/components/ui/Confirm', () => ({ useConfirm: () => vi.fn(async () => true), useTell: () => tell }));
vi.mock('@/components/products/CategoryPicker', () => ({ CategoryPicker: () => <div data-testid="category-picker" /> }));

import { ProductsScreen } from './ProductsScreen';

const row = (id: string, name: string, sku: string, categoryId: string | null) => ({
  id, name, nameEn: null, sku, basePrice: 10, status: 'ACTIVE', categoryId,
  category: categoryId ? { id: categoryId, name: 'العناية بالبشرة' } : null,
  images: [], offers: [], analytics: { totalRemaining: 1, totalSold: 0 },
});
const FILED = row('p1', 'غسول للبشرة الدهنية', 'SKIN-02', 'cat-skin');
const OVEN = row('p2', 'محضر الطعام', 'LEG-12', null);
const CREAM = row('p3', 'كريم سنام الجمل', 'LEG-8', null);

let list: unknown[];
let asked: Array<{ url: string; method: string; body?: string }>;
let categoriseAnswer: unknown;

/** The address bar and the router's view of it agree, the way they do when Next follows `history.replaceState`. */
function visit(search: string) {
  window.history.replaceState(null, '', `/products${search}`);
  nav.params = new URLSearchParams(search);
}

beforeEach(() => {
  visit('');
  tell.mockReset();
  list = [FILED, OVEN, CREAM];
  asked = [];
  categoriseAnswer = { filed: 2, skipped: 0, created: ['أجهزة منزلية'] };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      asked.push({ url, method: init?.method ?? 'GET', body: init?.body });
      const ok = (body: unknown) => ({ ok: true, status: 200, headers: new Headers(), json: async () => body, text: async () => JSON.stringify(body) }) as any;
      if (url.startsWith('/api/products/stats')) return { ok: false, status: 500, json: async () => ({}) } as any;
      if (url.startsWith('/api/products/grades')) return { ok: false, status: 403, json: async () => ({}) } as any;
      if (url === '/api/categories') return ok({ categories: [{ id: 'cat-skin', name: 'العناية بالبشرة' }] });
      if (url === '/api/products/categorise') return ok(categoriseAnswer);
      return ok({ products: list, uncategorised: list.filter((p: any) => !p.categoryId).length });
    })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ready = async () => {
  render(<ProductsScreen />);
  await waitFor(() => expect(screen.getAllByText('محضر الطعام').length).toBeGreaterThan(0));
};
const productReads = () => asked.filter((a) => a.url === '/api/products' && a.method === 'GET').length;
const button = () => screen.getByText('رتّبها لي').closest('button') as HTMLButtonElement;

describe('the button', () => {
  it('— is there beside the count of products with no category, and says what it does', async () => {
    await ready();
    expect(screen.getByText('2 منتجاً بلا تصنيف')).toBeTruthy();
    expect(button()).toBeTruthy();
    expect(button().type).toBe('button');
  });

  it('— is not there when every product has a category: nothing to sort, nothing offered', async () => {
    list = [FILED];
    render(<ProductsScreen />);
    await waitFor(() => expect(screen.getAllByText('غسول للبشرة الدهنية').length).toBeGreaterThan(0));
    expect(screen.queryByText('رتّبها لي')).toBeNull();
    expect(screen.queryByText(/بلا تصنيف$/)).toBeNull();
  });

  it('— opens the dialog on the products with no category and on no others', async () => {
    await ready();
    expect(screen.queryByText('ترتيب المنتجات بلا تصنيف')).toBeNull();
    await userEvent.setup().click(button());
    expect(await screen.findByText('ترتيب المنتجات بلا تصنيف')).toBeTruthy();
    expect(await screen.findByLabelText('تصنيف محضر الطعام')).toBeTruthy();
    expect(screen.getByLabelText('تصنيف كريم سنام الجمل')).toBeTruthy();
    expect(screen.queryByLabelText('تصنيف غسول للبشرة الدهنية')).toBeNull();
  });

  it('— lists ALL of them whatever the search box has narrowed the table to', async () => {
    await ready();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/بحث بالاسم/), 'غسول');
    await user.click(button());
    expect(await screen.findByLabelText('تصنيف محضر الطعام')).toBeTruthy();
    expect(screen.getByLabelText('تصنيف كريم سنام الجمل')).toBeTruthy();
  });
});

describe('closing it', () => {
  it('— “إغلاق” takes the dialog away, writes nothing and does not read the list again', async () => {
    await ready();
    const user = userEvent.setup();
    await user.click(button());
    await screen.findByLabelText('تصنيف محضر الطعام');
    const reads = productReads();
    await user.click(screen.getByText('إغلاق'));
    expect(screen.queryByText('ترتيب المنتجات بلا تصنيف')).toBeNull();
    expect(asked.some((a) => a.url === '/api/products/categorise')).toBe(false);
    expect(productReads()).toBe(reads);
    expect(tell).not.toHaveBeenCalled();
  });
});

describe('when the dialog’s press has been answered', () => {
  /** The screen, with the dialog open on the unfiled products. */
  const open = async () => {
    await ready();
    const user = userEvent.setup();
    await user.click(button());
    await screen.findByLabelText('تصنيف محضر الطعام');
    return user;
  };
  const press = async () => {
    const user = await open();
    await user.click(screen.getByText(/طبّق على/));
  };

  it('— the dialog closes, the list is read again, and what was done is said, with the shelves that were made', async () => {
    const user = await open();
    const before = productReads();
    await user.click(screen.getByText(/طبّق على/));
    await waitFor(() => expect(tell).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('ترتيب المنتجات بلا تصنيف')).toBeNull();
    expect(productReads(), 'القائمة لم تُقرأ من جديد').toBe(before + 1);
    expect(tell.mock.calls[0][0]).toEqual({ title: 'رُتِّب 2 منتجاً', body: 'أُنشئ: أجهزة منزلية.' });
  });

  it('— it posts exactly the rows the dialog showed with a shelf', async () => {
    await press();
    await waitFor(() => expect(tell).toHaveBeenCalled());
    const post = asked.find((a) => a.url === '/api/products/categorise');
    expect(post?.method).toBe('POST');
    expect(JSON.parse(post?.body as string).items).toEqual([
      { productId: 'p2', category: 'أجهزة منزلية' },
      { productId: 'p3', category: 'العناية بالبشرة' },
    ]);
  });

  it('— a skipped product is said, in the same words the door means: filed before the press, or not the caller’s to edit', async () => {
    categoriseAnswer = { filed: 1, skipped: 1, created: [] };
    await press();
    await waitFor(() => expect(tell).toHaveBeenCalled());
    expect(tell.mock.calls[0][0]).toEqual({ title: 'رُتِّب 1 منتجاً', body: '1 لم يُنقَل — صُنِّف قبل الضغط أو لا تملك تعديله.' });
  });

  it('— and when nothing was filed it says exactly that, not “done”', async () => {
    categoriseAnswer = { filed: 0, skipped: 2, created: [] };
    await press();
    await waitFor(() => expect(tell).toHaveBeenCalled());
    expect(tell.mock.calls[0][0].title).toBe('لم يُرتَّب أيّ منتج');
    expect(tell.mock.calls[0][0].body).toContain('2 لم يُنقَل');
  });

  it('— a plain success with nothing made and nothing skipped has a title and no body', async () => {
    categoriseAnswer = { filed: 2, skipped: 0, created: [] };
    await press();
    await waitFor(() => expect(tell).toHaveBeenCalled());
    expect(tell.mock.calls[0][0]).toEqual({ title: 'رُتِّب 2 منتجاً', body: undefined });
  });

  it('— the count of the products with no category falls once the list comes back with them filed', async () => {
    const user = await open();
    list = [FILED, { ...OVEN, categoryId: 'cat-home', category: { id: 'cat-home', name: 'أجهزة منزلية' } }, { ...CREAM, categoryId: 'cat-skin', category: { id: 'cat-skin', name: 'العناية بالبشرة' } }];
    await user.click(screen.getByText(/طبّق على/));
    await waitFor(() => expect(tell).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(/منتجاً بلا تصنيف/)).toBeNull());
    expect(screen.queryByText('رتّبها لي')).toBeNull();
    // The shelf is on the row now.
    const dialogGone = within(document.body);
    expect(dialogGone.queryByLabelText('تصنيف محضر الطعام')).toBeNull();
  });
});

/**
 * «+ أنشئ» IN CTRL+K OPENS THE FORM THE «إضافة منتج» BUTTON OPENS (22/10). The box goes to `/products?new=product`; the screen opens
 * «إضافة منتج جديد» and takes the word out of the address. A word that belongs to another screen's form opens nothing here.
 */
describe('the box (Ctrl+K) opens the create form', () => {
  it('— `?new=product` opens «إضافة منتج جديد», and the address is left clean', async () => {
    visit('?new=product');
    await ready();
    expect(screen.getByText('إضافة منتج جديد')).toBeTruthy();
    expect(window.location.search).toBe('');
  });

  it('— an address without the word shows no form', async () => {
    await ready();
    expect(screen.queryByText('إضافة منتج جديد')).toBeNull();
  });

  it('— and a word that belongs to another screen’s form opens nothing here', async () => {
    visit('?new=customer');
    await ready();
    expect(screen.queryByText('إضافة منتج جديد')).toBeNull();
  });
});
