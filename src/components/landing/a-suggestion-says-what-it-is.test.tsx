// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

/**
 * «وصف بسيط للمنتجات بالكروس سيل، او رابط بيثير الفضول لصفحة المنتج او صفحة الهبوط».
 * A suggestion on the thank-you screen says what it is, and can be looked at — beside the order, not instead of it.
 */

vi.mock('@/lib/leave-for', () => ({ leaveFor: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiJson: vi.fn(), apiFetch: vi.fn() }));
vi.mock('@/components/tracking/GlobalTrackingProvider', () => ({
  useTracking: () => ({ trackEvent: vi.fn(), registerPixels: vi.fn(), setPageContext: vi.fn() }),
}));

import OrderForm from './OrderForm';

const offers = [{ id: 'o1', name: 'عبوة واحدة', quantity: 1, freeQuantity: 0, price: 12, isDefault: true }];
const recommendations = [
  { id: 'r1', name: 'شامبو', price: 11, image: null, blurb: 'بيخلّي شعرك ناعم من أول غسلة', pageUrl: 'https://app.example.com/lp/shampoo' },
  { id: 'r2', name: 'زيت', price: 9, image: null },
];
const answer = (windowMinutes: number) => ({
  orderNumber: 'ORD-2026-0601', total: 12, currency: 'USD', addonToken: 'x'.repeat(40),
  postOrderOffer: { id: 'po1', name: 'قطعة كمان', quantity: 1, freeQuantity: 0, price: 10, listPrice: 14 },
  postOrderWindowMinutes: windowMinutes,
});

async function orderPlaced(look?: React.ComponentProps<typeof OrderForm>['afterOrderLook'], windowMinutes = 15) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(answer(windowMinutes)), { status: 200 })));
  render(
    <OrderForm slug="s" productName="ماء الكمأ" basePrice={12} currency="USD" offers={offers} recommendations={recommendations}
      regions={['دمشق']} afterOrderLook={look} />
  );
  const field = (name: string) => document.querySelector(`[name="${name}"]`) as HTMLInputElement;
  fireEvent.change(field('full_name'), { target: { value: 'زبون تجربة' } });
  fireEvent.change(field('phone'), { target: { value: '0999999999' } });
  fireEvent.change(field('address'), { target: { value: 'شارع 5' } });
  fireEvent.click(screen.getByRole('button', { name: /المدينة|المحافظة/ }));
  fireEvent.click(screen.getByRole('button', { name: 'دمشق' }));
  fireEvent.submit(document.querySelector('form')!);
  await screen.findByText(/ORD-2026-0601/);
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('a suggestion that says what it is', () => {
  it('carries its one line under the name', async () => {
    await orderPlaced();
    expect(screen.getByText('بيخلّي شعرك ناعم من أول غسلة')).toBeTruthy();
  });

  it('and «شوف المنتج» opens the product’s page in a new tab — the order screen stays where it is', async () => {
    await orderPlaced();
    const link = screen.getByRole('link', { name: /شوف المنتج/ }) as HTMLAnchorElement;
    expect(link.href).toBe('https://app.example.com/lp/shampoo');
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
  });

  it('NEGATIVE: a suggestion with no line and no page shows neither — nothing invented, no dead link', async () => {
    await orderPlaced();
    expect(screen.getAllByRole('link', { name: /شوف المنتج/ })).toHaveLength(1);
    const oil = screen.getByText('زيت').closest('div')!;
    expect(oil.querySelector('.lp-xsell-blurb')).toBeNull();
  });
});
