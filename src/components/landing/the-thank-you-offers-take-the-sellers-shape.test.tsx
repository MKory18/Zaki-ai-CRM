// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { landingSectionSchema, newSection } from '@/lib/landing-sections';
import { BLOCK_CSS } from '@/components/landing/blocks/styles';

/**
 * «خيار يكونو يا مع بعض الأب سيل والكروس سيل يا ورا بعض» · «شريط: مبروك، حابين نهديك عرض — أو عدّاد» ·
 * «اشكال الأب سيل واشكال الكروس سيل». The thank-you screen's two offers, as the form block's «بعد الطلب» shapes them —
 * and as they always were when the seller chose nothing.
 */

vi.mock('@/lib/leave-for', () => ({ leaveFor: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiJson: vi.fn(), apiFetch: vi.fn() }));
vi.mock('@/components/tracking/GlobalTrackingProvider', () => ({
  useTracking: () => ({ trackEvent: vi.fn(), registerPixels: vi.fn(), setPageContext: vi.fn() }),
}));

import OrderForm from './OrderForm';

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
const upsell = () => document.querySelector('.lp-upsell');
const crossSell = () => screen.queryByText('شامبو');

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('as it always was — when the seller chose nothing', () => {
  it('shows both at once, no strip, the card and the list', async () => {
    await orderPlaced();
    expect(upsell()?.getAttribute('data-look')).toBe('card');
    expect(crossSell()).toBeTruthy();
    expect(document.querySelector('.lp-xsell-items')?.getAttribute('data-look')).toBe('list');
    expect(document.querySelector('.lp-after-banner')).toBeNull();
  });

  it('a saved form block reads as that screen', () => {
    expect(landingSectionSchema.parse({ ...newSection('form') })).toMatchObject({
      afterOrderFlow: 'together', afterOrderBanner: 'none', upsellLook: 'card', crossSellLook: 'list',
    });
  });
});

describe('«ورا بعض»', () => {
  it('holds the suggestions back until the offer is answered — then shows them', async () => {
    await orderPlaced({ flow: 'sequence' });
    expect(upsell()).toBeTruthy();
    expect(crossSell()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'لا شكراً' }));
    expect(crossSell()).toBeTruthy();
  });
});

describe('the strip on top', () => {
  it('«مبروك» in the seller’s words', async () => {
    await orderPlaced({ banner: 'congrats', bannerText: 'مبروك! هدية صغيرة إلك' });
    expect(screen.getByText('مبروك! هدية صغيرة إلك')).toBeTruthy();
  });

  it('the countdown counts the REAL window, and at zero the offers leave the screen', async () => {
    await orderPlaced({ banner: 'countdown' }, 1);
    expect(screen.getByText(/العرض متاح لمدة/).textContent).toMatch(/[01]:\d\d/);
    // A minute and a second later, by the page's own clock — the next tick reads it.
    const start = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(start + 61_000);
    await act(() => new Promise((r) => setTimeout(r, 1100)));
    expect(upsell()).toBeNull();
    expect(crossSell()).toBeNull();
    expect(screen.getByText(/انتهت مهلة الإضافة/)).toBeTruthy();
  });

  it('NEGATIVE: with no window from the server there is no countdown to invent', async () => {
    await orderPlaced({ banner: 'countdown' }, 0);
    expect(screen.queryByText(/العرض متاح لمدة/)).toBeNull();
    expect(upsell()).toBeTruthy();
  });
});

describe('the shapes', () => {
  it('the upsell as a coloured strip or one compact row, the suggestions as cards', async () => {
    await orderPlaced({ upsellLook: 'banner', crossSellLook: 'cards' });
    expect(upsell()?.getAttribute('data-look')).toBe('banner');
    expect(document.querySelector('.lp-xsell-items')?.getAttribute('data-look')).toBe('cards');
  });

  it('each shape is a rule in the page’s own sheet', () => {
    expect(BLOCK_CSS).toMatch(/\.lp-upsell\[data-look=banner\] \{[^}]*background: var\(--store-accent\)/);
    expect(BLOCK_CSS).toMatch(/\.lp-upsell\[data-look=compact\] \{[^}]*display: flex/);
    expect(BLOCK_CSS).toMatch(/\.lp-xsell-items\[data-look=cards\] \{[^}]*grid-template-columns: 1fr 1fr/);
  });

  it('NEGATIVE: a shape that is not one of the choices is refused', () => {
    expect(landingSectionSchema.safeParse({ ...newSection('form'), upsellLook: 'popup' }).success).toBe(false);
    expect(landingSectionSchema.safeParse({ ...newSection('form'), afterOrderBanner: 'fake-timer' }).success).toBe(false);
  });
});
