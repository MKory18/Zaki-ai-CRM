// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

/**
 * «تم من كل المتجر» — the store's checkout reports «الشراء» to the pixels, with the amount the server answered with,
 * and only once the server said the basket is an order.
 */

const { trackEvent, push, shopFetch, clear } = vi.hoisted(() => ({
  trackEvent: vi.fn(),
  push: vi.fn(),
  shopFetch: vi.fn(),
  clear: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/components/tracking/GlobalTrackingProvider', () => ({ useTracking: () => ({ trackEvent }) }));
vi.mock('@/lib/storefront-fetch', () => ({ shopFetch: (...a: unknown[]) => shopFetch(...a) }));
vi.mock('./useCart', () => ({
  useCart: () => ({
    ready: true,
    pricing: false,
    lines: [{ productId: 'p1', quantity: 1 }],
    quote: { lines: [], subtotal: 25, cod: 25, currency: 'USD', pieces: 1 },
    clear,
  }),
}));

import { CheckoutForm } from './CheckoutForm';

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const answer = (ok: boolean, body: unknown) => shopFetch.mockResolvedValue({ ok, json: async () => body });
const draw = () =>
  render(<CheckoutForm slug="sehha" minorUnit={2} fields={['name', 'phone']} required={['name', 'phone']} regions={[]} submitText="أرسل الطلب" />);

describe('the store reports its sale', () => {
  it('a placed order is reported as «الشراء» with the server’s total and currency, then the thank-you page opens', async () => {
    answer(true, { orderNumber: 'SY-0612', total: 27.5, currency: 'USD' });
    draw();
    fireEvent.click(screen.getByRole('button', { name: 'أرسل الطلب' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/s/sehha/thanks?o=SY-0612'));
    expect(trackEvent).toHaveBeenCalledWith('Purchase', { orderId: 'SY-0612', value: 27.5, currency: 'USD' });
    expect(trackEvent.mock.invocationCallOrder[0]).toBeLessThan(push.mock.invocationCallOrder[0]);
  });

  it('NEGATIVE: a refused order reports nothing — the quote on screen is never sent as a sale', async () => {
    answer(false, { error: 'هذا الرقم عليه طلب مفتوح' });
    draw();
    fireEvent.click(screen.getByRole('button', { name: 'أرسل الطلب' }));
    await screen.findByRole('alert');
    expect(trackEvent).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('NEGATIVE: an answer without an amount reports no made-up one', async () => {
    answer(true, { orderNumber: 'SY-0613' });
    draw();
    fireEvent.click(screen.getByRole('button', { name: 'أرسل الطلب' }));
    await waitFor(() => expect(trackEvent).toHaveBeenCalled());
    expect(trackEvent).toHaveBeenCalledWith('Purchase', { orderId: 'SY-0613', value: null, currency: null });
  });
});
