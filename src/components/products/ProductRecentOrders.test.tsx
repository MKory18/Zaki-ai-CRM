// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '@/lib/guard-source';
import { arDate } from '@/lib/format';
import { STATE_LABEL_AR } from '@/lib/order-state';

/**
 * «أحدث الطلبات على هذا المنتج شغالة؟» — AND THIS IS WHAT «SHAGHALA» MEANS.
 *
 * The card read `product.orders`, which `GET /api/products/[id]` has never sent, so it said «لا طلبات على هذا المنتج بعد»
 * about a product with 305 orders, 124 of them delivered. What is held here: it asks ITS OWN door (the one that
 * sends a name and a city and no phone), draws what came back, and says what it could not do instead of drawing the empty
 * state — «لا تملك صلاحية» is not «لا طلبات».
 */

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { ProductRecentOrders } from './ProductRecentOrders';

const CREATED = '2026-10-20T12:00:00.000Z';
const order = (over: Record<string, unknown> = {}) => ({
  id: 'o1',
  orderNumber: 'ORD-26-0001',
  state: 'DELIVERED',
  totalAmount: 40,
  createdAt: CREATED,
  customer: { fullName: 'نور الحسن', city: 'عمّان' },
  moderator: 'سارة',
  ...over,
});
const answer = (orders: unknown[], total = orders.length) => ({
  ok: true,
  status: 200,
  json: async () => ({ total, orders, currency: { code: 'JOD', minorUnit: 3 } }),
});

beforeEach(() => {
  vi.clearAllMocks();
  apiFetch.mockResolvedValue(answer([order()]));
});
afterEach(cleanup);

describe('where it asks', () => {
  it('— its OWN door, once, for THIS product — not the orders list and not the product’s own door', async () => {
    render(<ProductRecentOrders productId="p-1" />);
    await screen.findAllByText('ORD-26-0001');
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch.mock.calls[0][0]).toBe('/api/products/p-1/orders');
  });

  it('and asks again for another product when the page moves to it — and shows nothing of the old one while it waits', async () => {
    const { rerender } = render(<ProductRecentOrders productId="p-1" />);
    await screen.findAllByText('ORD-26-0001');
    apiFetch.mockReturnValueOnce(new Promise(() => undefined));
    rerender(<ProductRecentOrders productId="p-2" />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(apiFetch.mock.calls[1][0]).toBe('/api/products/p-2/orders');
    expect(screen.getByText('جارٍ القراءة…')).toBeTruthy();
    expect(screen.queryByText('ORD-26-0001'), 'طلباتُ المنتجِ السابقِ بقيت على البطاقة').toBeNull();
  });
});

describe('what it draws', () => {
  it('— the order (a link that opens it), the customer and the city, the amount in the store’s currency, the state in words, the moderator, the date', async () => {
    render(<ProductRecentOrders productId="p-1" />);
    const link = (await screen.findAllByText('ORD-26-0001'))[0].closest('a')!;
    expect(link.getAttribute('href')).toBe('/orders?highlight=o1');
    const card = link.closest('table') ?? link.closest('div')!.parentElement!;
    const text = (card as HTMLElement).textContent ?? '';
    for (const expected of ['نور الحسن', 'عمّان', '40.000 JOD', STATE_LABEL_AR.DELIVERED, 'سارة', arDate(CREATED)]) expect(text, expected).toContain(expected);
  });

  it('and an order with no moderator and a customer with no city says a dash, and never «null»', async () => {
    apiFetch.mockResolvedValue(answer([order({ moderator: null, customer: { fullName: 'ليلى', city: null } })]));
    const { container } = render(<ProductRecentOrders productId="p-1" />);
    await screen.findAllByText('ORD-26-0001');
    expect(container.textContent).not.toContain('null');
    expect(container.textContent).toContain('—');
  });

  it('and a customer with no NAME is a dash too — a blank cell reads as a row that failed to load', async () => {
    apiFetch.mockResolvedValue(answer([order({ moderator: 'سارة', customer: { fullName: null, city: 'عمّان' } })]));
    render(<ProductRecentOrders productId="p-1" />);
    await screen.findAllByText('ORD-26-0001');
    const name = screen.getAllByText('—').find((el) => el.getAttribute('dir') === 'auto');
    expect(name, 'خانةُ العميلِ بلا اسمٍ فارغةٌ لا شرطة').toBeTruthy();
  });

  it('and a name or a city in Latin letters is read as Latin: each takes the direction of its own first letter', async () => {
    apiFetch.mockResolvedValue(answer([order({ customer: { fullName: 'John Smith', city: 'Amman' } })]));
    render(<ProductRecentOrders productId="p-1" />);
    await screen.findAllByText('ORD-26-0001');
    for (const text of ['John Smith', 'Amman']) {
      for (const el of screen.getAllByText(text)) expect(el.getAttribute('dir'), text).toBe('auto');
    }
  });

  it('and says how many there are in all, with a way to see them all — only when there are more than are shown', async () => {
    apiFetch.mockResolvedValue(answer([order(), order({ id: 'o2', orderNumber: 'ORD-26-0002' })], 131));
    render(<ProductRecentOrders productId="p-1" />);
    await screen.findAllByText('ORD-26-0001');
    expect(screen.getByText('2 من 131 طلب')).toBeTruthy();
    const all = screen.getByText('كل الطلبات (131)').closest('a')!;
    expect(all.getAttribute('href'), 'الشاشةُ تفتحُ على المرشِّح الذي بُنيت منه البطاقة').toBe('/orders?productId=p-1');
    cleanup();
    apiFetch.mockResolvedValue(answer([order()], 1));
    render(<ProductRecentOrders productId="p-1" />);
    await screen.findAllByText('ORD-26-0001');
    expect(screen.queryByText(/كل الطلبات/)).toBeNull();
  });
});

describe('when there is nothing, or it cannot say', () => {
  it('— a product nobody ordered says so, with its reason', async () => {
    apiFetch.mockResolvedValue(answer([], 0));
    render(<ProductRecentOrders productId="p-1" />);
    expect(await screen.findByText('لا طلبات على هذا المنتج بعد')).toBeTruthy();
  });

  it('and the empty state is NOT drawn while the answer is still on its way — no flash of «لا طلبات» over a product that has some', () => {
    apiFetch.mockReturnValue(new Promise(() => undefined));
    render(<ProductRecentOrders productId="p-1" />);
    expect(screen.getByText('جارٍ القراءة…')).toBeTruthy();
    expect(screen.queryByText('لا طلبات على هذا المنتج بعد')).toBeNull();
  });

  it('and a refusal is said as a refusal — «لا تملك صلاحية عرض الطلبات» — and never as the empty state', async () => {
    apiFetch.mockResolvedValue({ ok: false, status: 403, json: async () => ({ errorAr: 'لا تملك صلاحية عرض الطلبات.' }) });
    render(<ProductRecentOrders productId="p-1" />);
    expect(await screen.findByText('لا تملك صلاحية عرض الطلبات.')).toBeTruthy();
    expect(screen.queryByText('لا طلبات على هذا المنتج بعد')).toBeNull();
  });

  it('and a failure says what failed, in the door’s own words when it has them', async () => {
    apiFetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'المنتج غير موجود' }) });
    render(<ProductRecentOrders productId="p-1" />);
    expect(await screen.findByText('المنتج غير موجود')).toBeTruthy();
    cleanup();
    apiFetch.mockRejectedValue(new Error('انقطع الاتصال'));
    render(<ProductRecentOrders productId="p-1" />);
    expect(await screen.findByText('انقطع الاتصال')).toBeTruthy();
  });
});

describe('how it is built', () => {
  const src = () => stripComments(readFileSync(join(process.cwd(), 'src/components/products/ProductRecentOrders.tsx'), 'utf8'));

  it('— it reads its own door and nothing of the customer’s contact: no phone, no address, no orders list', () => {
    expect(src()).toContain('/api/products/');
    expect(src()).not.toMatch(/\/api\/orders\?/);
    expect(src()).not.toMatch(/phone|rawPhone|address/i);
  });

  it('and it adds up nothing and decides nothing: the state, the amount and the date arrive from the door', () => {
    expect(src()).not.toMatch(/\.reduce\(|\.sort\(|getTime\(|Date\.now\(|new Date\(/);
  });
});

