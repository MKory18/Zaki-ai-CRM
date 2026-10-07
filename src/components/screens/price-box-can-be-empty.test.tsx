// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

/**
 * CLEARING THE PRICE BOX IS NOT TYPING A ZERO — THE BROWSER HALF.
 *
 * `82ecac3` closed both product doors against a price that is not a number:
 * `readBasePrice` refuses it and answers 400, and a typed `0` is kept
 * because a sample or a gift has a real price of nothing. Then the screen
 * did this in both dialogs:
 *
 *     onChange={(e) => setBasePrice(parseFloat(e.target.value) || 0)}
 *
 * `e.target.value` of a cleared `<input type="number">` is the empty string,
 * and `parseFloat('') || 0` is **0**. So the browser converted the one input
 * the door is obliged to refuse into the one value the door is obliged to
 * accept: the box redrew as `0`, and saving stored a FREE PRODUCT and
 * answered 200. `basePrice` is the price a landing page shows a shopper,
 * the AI intake's fallback price, and the figure `ProductOffers` multiplies
 * to propose the ladder — so that zero does not stay on the product card.
 *
 * These read THE BODY ON THE WIRE, and the figures in it:
 *
 *   · clearing the box sends `''`, which the door refuses — not `0`;
 *   · a typed `0` still sends `0`, because zero is a real price;
 *   · opening the edit dialog on a product stored at `0` shows `0`;
 *   · a decimal price survives unchanged, digit for digit.
 *
 * Put `parseFloat(…) || 0` back and the first reads `0` where it expects
 * `''`, and the third reads `0` where the state is a number again.
 */

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({
  default: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('@/context/AppContext', () => ({
  useApp: () => ({ t: { products: 'المنتجات' }, locale: 'ar' }),
}));
vi.mock('@/components/ui/Confirm', () => ({
  useConfirm: () => vi.fn(async () => true),
  useTell: () => vi.fn(),
}));
// A category tree is a second fetch and a second question; this test is
// about one box.
vi.mock('@/components/products/CategoryPicker', () => ({
  CategoryPicker: () => <div data-testid="category-picker" />,
}));

import { ProductsScreen } from './ProductsScreen';

/** One product, stored at a price of exactly zero — a real value. */
const FREE_PRODUCT = {
  id: 'p1',
  name: 'عيّنة كريم',
  nameEn: 'Sample',
  sku: 'SMP-1',
  description: '',
  descriptionEn: '',
  basePrice: 0,
  status: 'ACTIVE',
  categoryId: null,
  images: [],
  analytics: {},
};

/** Every POST/PATCH body the screen sent, in order. */
let sent: { url: string; method: string; body: any }[] = [];

beforeEach(() => {
  sent = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method !== 'GET') {
        sent.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
        return { ok: true, json: async () => ({ product: { id: 'new' } }) } as any;
      }
      if (url.startsWith('/api/products/grades')) {
        // `readiness` is dereferenced unconditionally by the screen, so a
        // null here crashes the render for a reason that has nothing to do
        // with a price box. An empty catalogue's real answer.
        return {
          ok: true,
          json: async () => ({
            window: { start: null, end: null, days: null },
            minSample: 5,
            salesVisible: false,
            costVisible: false,
            grades: [],
            readiness: {
              total: 0, graded: 0, thinSample: 0, neverConfirmed: 0, neverOrdered: 0,
              salesHidden: 0, notSellable: 0, incomplete: 0, gaps: [], why: '',
            },
          }),
        } as any;
      }
      return { ok: true, json: async () => ({ products: [FREE_PRODUCT] }) } as any;
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The price box inside whichever dialog is open. */
const priceBox = () => screen.getByDisplayValue((v, el) =>
  el instanceof HTMLInputElement && el.type === 'number' && el.step === '0.01'
    ? true
    : false
) as HTMLInputElement;

describe('what the old line did to a cleared price box', () => {
  it('turned an empty box into a free product, and said nothing', () => {
    // The value an `<input type="number">` reports when it is cleared.
    expect(parseFloat('')).toBeNaN();
    expect(parseFloat('') || 0).toBe(0);
    // And the two the door would have refused with a sentence.
    expect(parseFloat('abc') || 0).toBe(0);
    expect(parseFloat('3,5') || 0).toBe(3); // three and a half typed, three kept
  });
});

describe('the create dialog', () => {
  it('cannot be saved with an empty price box at all — and that is the gain', async () => {
    /*
     * THE BOX WAS ALREADY MARKED `required` AND THE OLD READING DEFEATED IT.
     *
     * `parseFloat('') || 0` wrote `0` into the state, the box redrew showing
     * `0`, and `required` was satisfied by the character the code had just
     * invented — so the form submitted and a free product was stored. With
     * the box holding what was typed, an empty box is empty, `required`
     * fires, and NOTHING is sent. The person is stopped at the box instead
     * of being told 200 about a price they never gave.
     */
    const user = userEvent.setup();
    render(<ProductsScreen />);
    await waitFor(() => expect(screen.getAllByText('عيّنة كريم').length).toBeGreaterThan(0));

    await user.click(screen.getByText('إضافة منتج'));
    const box = await waitFor(() => priceBox());
    // It opens pre-filled at 20, as a string — not as the number 20.
    expect(box.value).toBe('20');

    await user.clear(box);
    await user.type(screen.getByPlaceholderText(/كريم إزالة الندبات/), 'كريم');
    await user.type(screen.getByPlaceholderText('SCAR-DE-05'), 'KR-1');
    await user.click(screen.getByText('حفظ المنتج'));

    // NOTHING LEFT THE BROWSER, and this is the assertion that prints the
    // defect: restore `parseFloat(e.target.value) || 0` and it reads
    // `[{ basePrice: '0', … }]` — the free product on the wire, answered 200.
    expect(sent).toEqual([]);
    // And the box the person is looking at is still empty, so `required`
    // is the thing that stopped them rather than a value nobody typed.
    expect(box.value).toBe('');
    expect(box.required).toBe(true);
    expect(box.checkValidity()).toBe(false);
  });

  it('and a typed zero is still sent, because a sample has a real price', async () => {
    const user = userEvent.setup();
    render(<ProductsScreen />);
    await waitFor(() => expect(screen.getAllByText('عيّنة كريم').length).toBeGreaterThan(0));

    await user.click(screen.getByText('إضافة منتج'));
    const box = await waitFor(() => priceBox());
    await user.clear(box);
    await user.type(box, '0');
    expect(box.value).toBe('0');

    await user.type(screen.getByPlaceholderText(/كريم إزالة الندبات/), 'عيّنة');
    await user.type(screen.getByPlaceholderText('SCAR-DE-05'), 'SM-2');
    await user.click(screen.getByText('حفظ المنتج'));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].body.basePrice).toBe('0');
  });

  it('and a decimal price arrives digit for digit', async () => {
    const user = userEvent.setup();
    render(<ProductsScreen />);
    await waitFor(() => expect(screen.getAllByText('عيّنة كريم').length).toBeGreaterThan(0));

    await user.click(screen.getByText('إضافة منتج'));
    const box = await waitFor(() => priceBox());
    await user.clear(box);
    await user.type(box, '12.5');

    await user.type(screen.getByPlaceholderText(/كريم إزالة الندبات/), 'كريم');
    await user.type(screen.getByPlaceholderText('SCAR-DE-05'), 'KR-3');
    await user.click(screen.getByText('حفظ المنتج'));

    await waitFor(() => expect(sent).toHaveLength(1));
    // The characters, not a number the browser re-derived: `readBasePrice`
    // reads `'12.5'` as 12.5, and would have refused `'12,5'`.
    expect(sent[0].body.basePrice).toBe('12.5');
    expect(Number(sent[0].body.basePrice)).toBe(12.5);
  });
});

describe('the edit dialog', () => {
  it('shows a stored zero as zero, not as a blank and not as a default', async () => {
    const user = userEvent.setup();
    render(<ProductsScreen />);
    await waitFor(() => expect(screen.getAllByText('عيّنة كريم').length).toBeGreaterThan(0));

    await user.click(screen.getAllByTitle('تعديل المنتج')[0]);
    const box = await waitFor(() => priceBox());
    expect(box.value).toBe('0');
  });

  it('and sends a cleared box as empty, so the door refuses instead of zeroing the price', async () => {
    const user = userEvent.setup();
    render(<ProductsScreen />);
    await waitFor(() => expect(screen.getAllByText('عيّنة كريم').length).toBeGreaterThan(0));

    await user.click(screen.getAllByTitle('تعديل المنتج')[0]);
    const box = await waitFor(() => priceBox());
    await user.clear(box);
    await user.click(screen.getByText('حفظ التعديلات'));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].method).toBe('PATCH');
    expect(sent[0].body.basePrice).toBe('');
  });
});
