// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '@/lib/guard-source';

/**
 * «العملاء بدي الهم فلاتر».
 *
 * The strip above the customer list counted the book five ways and let you
 * press none of them. These hold the other half — that the three dropdowns
 * under the search box are drawn without a click, that each carries the
 * book's own count, that choosing sends exactly what was chosen and nothing
 * that was not, and that the limited view (which must not see anyone's
 * history) is given neither the controls nor a way to ask for them.
 */

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a), apiJson: vi.fn() }));
// This screen calls the hook with `{ initial: false }`: it refreshes on return, and the FIRST load is the
// debounced one. A mock that loaded on mount as well would send a second, earlier request from a stale render.
vi.mock('@/hooks/useLiveRefresh', () => ({ useLiveRefresh: () => undefined }));
const { APP, REGIONS, nav } = vi.hoisted(() => ({
  APP: { t: { customers: 'العملاء' }, currentUser: { id: 'u', role: 'COMPANY_ADMIN', permissions: [] }, locale: 'ar' },
  REGIONS: { regions: [], countryName: '' },
  nav: { params: new URLSearchParams() },
}));
vi.mock('@/context/AppContext', () => ({ useApp: () => APP }));
vi.mock('@/hooks/useRegions', () => ({ useRegions: () => REGIONS }));
vi.mock('next/navigation', () => ({ usePathname: () => '/customers', useSearchParams: () => nav.params }));
vi.mock('@/components/growth/AskAi', () => ({ AskAi: () => null }));
vi.mock('@/components/orders/ContactButtons', () => ({ ContactButtons: () => null }));

import { CustomersScreen } from './CustomersScreen';

const FACTS = {
  total: 178,
  ordered: 167,
  repeat: 12,
  received: 111,
  refused: 3,
  dormant: 9,
  byGrade: { loyal: 0, good: 0, watch: 0, risky: 0, new: 0 },
  cities: [
    { city: 'عمّان', count: 90 },
    { city: 'إربد', count: 40 },
  ],
  deliveryRate: 80,
};

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
/** The server sends the NEW customer first; the grade order would put the loyal one first. */
const NEWBIE = {
  id: 'a', fullName: 'سامر الجديد', phone: '0790000001', rawPhone: '0790000001', city: 'عمّان',
  totalOrders: 0, deliveredOrders: 0, cancelledOrders: 0, totalPurchaseValue: 0, lastOrderDate: null,
};
const LOYAL = {
  id: 'b', fullName: 'ليلى الوفية', phone: '0790000002', rawPhone: '0790000002', city: 'إربد',
  totalOrders: 6, deliveredOrders: 6, cancelledOrders: 0, totalPurchaseValue: 900, lastOrderDate: iso(3),
};

function answer(over: Record<string, unknown> = {}) {
  apiFetch.mockImplementation(async () => ({
    ok: true,
    json: async () => ({
      customers: [NEWBIE, LOYAL],
      facts: FACTS,
      limited: false,
      dialCode: '962',
      pagination: { total: 2, page: 1, limit: 25, totalPages: 1 },
      ...over,
    }),
  }));
}

beforeEach(() => {
  nav.params = new URLSearchParams();
  answer();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** The query string of the most recent request to the customers API. */
const lastQuery = () => {
  const url = String(apiFetch.mock.calls.at(-1)![0]);
  expect(url.startsWith('/api/customers?'), url).toBe(true);
  return new URLSearchParams(url.split('?')[1]);
};
const firstQuery = () => new URLSearchParams(String(apiFetch.mock.calls[0][0]).split('?')[1]);
const pick = (label: string, value: string) =>
  act(async () => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  });

describe('the dropdowns are on the screen, with the book’s own numbers', () => {
  it('— three of them, drawn without a click, named', async () => {
    render(<CustomersScreen />);
    expect(await screen.findByLabelText('الفئة')).toBeTruthy();
    expect(screen.getByLabelText('المحافظة')).toBeTruthy();
    expect(screen.getByLabelText('الترتيب')).toBeTruthy();
  });

  it('— each word carries the count the strip prints, so a number is a promise of that many rows', async () => {
    render(<CustomersScreen />);
    const category = await screen.findByLabelText('الفئة');
    const text = within(category).getAllByRole('option').map((o) => o.textContent);
    expect(text).toContain('كل العملاء (178)');
    expect(text).toContain('طلبوا (167)');
    expect(text).toContain('لم يطلبوا بعد (11)');
    expect(text).toContain('كرّروا الطلب (12)');
    expect(text).toContain('استلموا (111)');
    expect(text).toContain('رفضوا طرداً (3)');
    expect(text.some((t) => t?.startsWith('خاملون') && t.endsWith('(9)'))).toBe(true);
  });

  it('— the governorates are the book’s own, biggest first, with their counts', async () => {
    render(<CustomersScreen />);
    const city = await screen.findByLabelText('المحافظة');
    expect(within(city).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'كل المحافظات',
      'عمّان (90)',
      'إربد (40)',
    ]);
  });

  it('— and the orders to choose from are the four the server knows', async () => {
    render(<CustomersScreen />);
    const order = await screen.findByLabelText('الترتيب');
    expect(within(order).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'الأكثر طلباً',
      'الأعلى قيمة مشتريات',
      'الأحدث طلباً',
      'الأحدث إضافة',
    ]);
  });
});

describe('choosing sends what was chosen, from page one, and nothing else', () => {
  it('— nothing chosen: only the search, the page and the size', async () => {
    render(<CustomersScreen />);
    await screen.findByLabelText('الفئة');
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect([...lastQuery().keys()].sort()).toEqual(['limit', 'page', 'q']);
  });

  it('— a category', async () => {
    render(<CustomersScreen />);
    await screen.findByLabelText('الفئة');
    await pick('الفئة', 'refused');
    await waitFor(() => expect(lastQuery().get('segment')).toBe('refused'));
    expect(lastQuery().get('page')).toBe('1');
    expect(lastQuery().has('city')).toBe(false);
    expect(lastQuery().has('sort')).toBe(false);
  });

  it('— a governorate and an order ride along together, in one request', async () => {
    render(<CustomersScreen />);
    await screen.findByLabelText('الفئة');
    await pick('المحافظة', 'إربد');
    await pick('الترتيب', 'value');
    await waitFor(() => expect(lastQuery().get('sort')).toBe('value'));
    expect(lastQuery().get('city')).toBe('إربد');
    expect(lastQuery().has('segment')).toBe(false);
  });

  it('— and starts again at page one: page 3 of a different list is not where the reader was', async () => {
    answer({ pagination: { total: 178, page: 3, limit: 25, totalPages: 8 } });
    render(<CustomersScreen />);
    await screen.findByLabelText('الفئة');
    await waitFor(() => expect(document.body.textContent).toContain('صفحة 3 من 8'));
    await pick('الفئة', 'repeat');
    await waitFor(() => expect(lastQuery().get('segment')).toBe('repeat'));
    expect(lastQuery().get('page')).toBe('1');
  });

  it('— choosing «كل» again is choosing nothing: the parameter goes away', async () => {
    render(<CustomersScreen />);
    await screen.findByLabelText('الفئة');
    await pick('الفئة', 'repeat');
    await waitFor(() => expect(lastQuery().get('segment')).toBe('repeat'));
    await pick('الفئة', 'all');
    await waitFor(() => expect(lastQuery().has('segment')).toBe(false));
  });
});

describe('the reset', () => {
  it('— appears only when something is chosen, counts what is, and puts all three back', async () => {
    render(<CustomersScreen />);
    await screen.findByLabelText('الفئة');
    expect(screen.queryByRole('button', { name: /إعادة تعيين/ })).toBeNull();

    await pick('الفئة', 'refused');
    await pick('المحافظة', 'إربد');
    const reset = await screen.findByRole('button', { name: 'إعادة تعيين (2)' });
    await act(async () => {
      fireEvent.click(reset);
    });
    await waitFor(() => expect(lastQuery().has('segment')).toBe(false));
    expect(lastQuery().has('city')).toBe(false);
    expect(screen.queryByRole('button', { name: /إعادة تعيين/ })).toBeNull();
    expect((screen.getByLabelText('الفئة') as HTMLSelectElement).value).toBe('all');
  });

  it('— a list that is empty BECAUSE of a filter says so, and the way out is the reset', async () => {
    render(<CustomersScreen />);
    await screen.findByLabelText('الفئة');
    answer({ customers: [], pagination: { total: 0, page: 1, limit: 25, totalPages: 1 } });
    await pick('الفئة', 'refused');
    const empty = (await screen.findByText('لا عميلَ يطابق الفلاتر')).parentElement as HTMLElement;
    // Not «أضف أول عميل»: the book is not empty, the filter is narrow.
    expect(within(empty).queryByRole('button', { name: 'أضف أول عميل' })).toBeNull();
    await act(async () => {
      fireEvent.click(within(empty).getByRole('button', { name: 'امسح الفلاتر' }));
    });
    await waitFor(() => expect(lastQuery().has('segment')).toBe(false));
  });
});

describe('what points here is read once, from the address', () => {
  it('— the WhatsApp inbox’s link («?search=<the number>») fills the search box and asks for it', async () => {
    nav.params = new URLSearchParams('search=0791234567');
    render(<CustomersScreen />);
    await screen.findByLabelText('الفئة');
    expect((screen.getByPlaceholderText(/بحث بالاسم/) as HTMLInputElement).value).toBe('0791234567');
    expect(firstQuery().get('q')).toBe('0791234567');
  });

  it('— a category, a governorate and an order in the address are chosen from the first request', async () => {
    nav.params = new URLSearchParams(`segment=refused&city=${encodeURIComponent('إربد')}&sort=recent`);
    render(<CustomersScreen />);
    await screen.findByLabelText('الفئة');
    expect(firstQuery().get('segment')).toBe('refused');
    expect(firstQuery().get('city')).toBe('إربد');
    expect(firstQuery().get('sort')).toBe('recent');
    expect((screen.getByLabelText('الفئة') as HTMLSelectElement).value).toBe('refused');
    expect(screen.getByRole('button', { name: 'إعادة تعيين (3)' })).toBeTruthy();
  });

  it('— a value this screen does not know is dropped, not sent to be refused with a 400', async () => {
    nav.params = new URLSearchParams('segment=whales&sort=luck');
    render(<CustomersScreen />);
    await screen.findByLabelText('الفئة');
    expect(firstQuery().has('segment')).toBe(false);
    expect(firstQuery().has('sort')).toBe(false);
  });

  it('— a governorate the book has none of still shows in the box, so «كل» never sits over a list narrowed to nothing', async () => {
    nav.params = new URLSearchParams(`city=${encodeURIComponent('الزرقاء')}`);
    render(<CustomersScreen />);
    const city = await screen.findByLabelText('المحافظة');
    expect((city as HTMLSelectElement).value).toBe('الزرقاء');
    expect(within(city).getAllByRole('option').map((o) => o.textContent)).toContain('الزرقاء (0)');
  });
});

describe('the limited view', () => {
  it('— has no dropdowns and no figures', async () => {
    answer({ limited: true, facts: null });
    render(<CustomersScreen />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    await screen.findByPlaceholderText(/بحث بالاسم/);
    await waitFor(() => expect(document.body.textContent).toContain('سامر الجديد'));
    expect(screen.queryByLabelText('الفئة')).toBeNull();
    expect(screen.queryByLabelText('المحافظة')).toBeNull();
    expect(screen.queryByLabelText('الترتيب')).toBeNull();
    expect(screen.queryByRole('button', { name: /إعادة تعيين/ })).toBeNull();
  });

  it('— and asks for none even if the address does: the first request could not know, every one after it does', async () => {
    nav.params = new URLSearchParams('segment=refused&sort=value');
    answer({ limited: true, facts: null });
    render(<CustomersScreen />);
    await waitFor(() => expect(document.body.textContent).toContain('سامر الجديد'));
    // The first request carried the address's filters (the server ignores them for this view)…
    expect(firstQuery().get('segment')).toBe('refused');
    // …and the next, once the screen knows what it is, carries none.
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/بحث بالاسم/), { target: { value: 'سامر' } });
    });
    await waitFor(() => expect(lastQuery().get('q')).toBe('سامر'));
    expect(lastQuery().has('segment')).toBe(false);
    expect(lastQuery().has('sort')).toBe(false);
  });
});

describe('the order the rows come in', () => {
  const namesInOrder = (container: HTMLElement) => {
    const text = container.textContent ?? '';
    return [text.indexOf('سامر الجديد'), text.indexOf('ليلى الوفية')];
  };

  it('— by default the people worth seeing first are first, as before (the loyal one over the new one)', async () => {
    const { container } = render(<CustomersScreen />);
    await screen.findByLabelText('الفئة');
    const [newbie, loyal] = namesInOrder(container);
    expect(loyal, 'الترتيب الافتراضي تغيّر').toBeLessThan(newbie);
  });

  it('— a chosen order is kept as the server gave it: re-sorting a page by grade would undo «الأعلى قيمة»', async () => {
    const { container } = render(<CustomersScreen />);
    await screen.findByLabelText('الفئة');
    await pick('الترتيب', 'value');
    await waitFor(() => expect(lastQuery().get('sort')).toBe('value'));
    const [newbie, loyal] = namesInOrder(container);
    expect(newbie, 'الصفحة أُعيد ترتيبها بالدرجة رغم اختيار القارئ').toBeLessThan(loyal);
  });
});

describe('how it is written', () => {
  const src = () => stripComments(readFileSync(join(process.cwd(), 'src/components/screens/CustomersScreen.tsx'), 'utf8'));

  it('the screen takes its words and its checks from the one module the server uses', () => {
    expect(src()).toContain("from '@/lib/customer-filters'");
    // No second list of segments typed into the screen.
    expect(src()).not.toMatch(/'refused'/);
  });

  it('and the strip’s figures are not recounted here — the options print the server’s own', () => {
    expect(src()).toContain('segmentCount(s, facts)');
  });
});

/**
 * «+ أنشئ» IN CTRL+K OPENS THE FORM THE «إضافة عميل» BUTTON OPENS (22/10). The box goes to `/customers?new=customer`; the screen opens
 * «إضافة عميل جديد» and takes the word out of the address.
 */
describe('the box (Ctrl+K) opens the create form', () => {
  const visit = (search: string) => {
    window.history.replaceState(null, '', `/customers${search}`);
    nav.params = new URLSearchParams(search);
  };

  it('— `?new=customer` opens «إضافة عميل جديد», and the address is left clean', async () => {
    visit('?new=customer');
    render(<CustomersScreen />);
    expect(await screen.findByText('إضافة عميل جديد')).toBeTruthy();
    expect(window.location.search).toBe('');
  });

  it('— an address without the word shows no form', async () => {
    visit('');
    render(<CustomersScreen />);
    await screen.findByLabelText('الفئة');
    expect(screen.queryByText('إضافة عميل جديد')).toBeNull();
  });

  it('— and a word that belongs to another screen’s form opens nothing here', async () => {
    visit('?new=product');
    render(<CustomersScreen />);
    await screen.findByLabelText('الفئة');
    expect(screen.queryByText('إضافة عميل جديد')).toBeNull();
  });
});
