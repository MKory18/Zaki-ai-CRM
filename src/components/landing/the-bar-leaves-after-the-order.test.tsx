// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

/**
 * «شريط اطلب الآن الثابت بيغطّي على شاشة الشكر». Once the order is in, the bar that carries people to the form
 * leaves the screen — it would only cover the offer, the suggestions and the WhatsApp button, and invite a second order.
 */

vi.mock('@/lib/leave-for', () => ({ leaveFor: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiJson: vi.fn(), apiFetch: vi.fn() }));
vi.mock('@/components/tracking/GlobalTrackingProvider', () => ({
  useTracking: () => ({ trackEvent: vi.fn(), registerPixels: vi.fn(), setPageContext: vi.fn() }),
}));

import OrderForm from './OrderForm';
import { StickyCta } from './blocks/StickyCta';

const offers = [{ id: 'o1', name: 'عبوة واحدة', quantity: 1, freeQuantity: 0, price: 12, isDefault: true }];
const recommendations = [{ id: 'r1', name: 'شامبو', price: 11, image: null }];
const answer = (windowMinutes: number) => ({
  orderNumber: 'ORD-2026-0601', total: 12, currency: 'USD', addonToken: 'x'.repeat(40),
  postOrderOffer: { id: 'po1', name: 'قطعة كمان', quantity: 1, freeQuantity: 0, price: 10, listPrice: 14 },
  postOrderWindowMinutes: windowMinutes,
});

async function orderPlaced(look?: React.ComponentProps<typeof OrderForm>['afterOrderLook'], windowMinutes = 15) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(answer(windowMinutes)), { status: 200 })));
  render(
    <>
    <StickyCta text="اطلب الآن" showPrice offers={[{ id: 'o1', price: 12, isDefault: true }]} basePrice={12} currency="USD" whatsapp="https://wa.me/962790000000" />
    <OrderForm slug="s" productName="ماء الكمأ" basePrice={12} currency="USD" offers={offers} recommendations={recommendations}
      regions={['دمشق']} afterOrderLook={look} />
    </>
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
const bar = () => document.querySelector('.lp-sticky-bar');

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the bar after the order', () => {
  it('leaves the screen once the order is in — the thank-you screen is not covered', async () => {
    await orderPlaced();
    await waitFor(() => expect(bar()).toBeNull());
    expect(document.querySelector('.lp-upsell')).toBeTruthy();
  });

  it('NEGATIVE: before the order it is there, with its WhatsApp', () => {
    render(
      <StickyCta text="اطلب الآن" showPrice offers={[{ id: 'o1', price: 12, isDefault: true }]} basePrice={12} currency="USD" whatsapp="https://wa.me/962790000000" />
    );
    expect(bar()).toBeTruthy();
    expect(screen.getByLabelText('تواصل معنا على واتساب')).toBeTruthy();
  });

  it('NEGATIVE: a frame inside the page cannot send it away — only the page’s own form', async () => {
    render(
      <StickyCta text="اطلب الآن" showPrice offers={[{ id: 'o1', price: 12, isDefault: true }]} basePrice={12} currency="USD" />
    );
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'ZAKI_ORDER_PLACED' } }));
      window.dispatchEvent(new MessageEvent('message', { data: 'zaki:order-placed' }));
    });
    expect(bar()).toBeTruthy();
  });
});
