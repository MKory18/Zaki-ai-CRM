// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { landingSectionSchema, newSection } from '@/lib/landing-sections';

/**
 * «بدي ميزة متى اقدر اظهر زر الواتس بعد الشراء — آخر شي بعد ما ينهي الطلب، التوقيت — وكمان اقدر اتحكم بشكل الزر،
 * اشكالو والوانو». The thank-you screen's WhatsApp button: when it appears, and what it looks like.
 */

const { apiJson, leaveFor } = vi.hoisted(() => ({ apiJson: vi.fn(), leaveFor: vi.fn() }));
vi.mock('@/lib/leave-for', () => ({ leaveFor }));
vi.mock('@/lib/api-client', () => ({ apiJson, apiFetch: vi.fn() }));
vi.mock('@/components/tracking/GlobalTrackingProvider', () => ({
  useTracking: () => ({ trackEvent: vi.fn(), registerPixels: vi.fn(), setPageContext: vi.fn() }),
}));

import OrderForm, { whatsappButtonStyle } from './OrderForm';
import { AfterOrderPanel } from '@/components/landing-editor/AfterOrderPanel';

const offers = [{ id: 'o1', name: 'عبوة واحدة', quantity: 1, freeQuantity: 0, price: 12, isDefault: true }];
const recommendations = [{ id: 'r1', name: 'شامبو', price: 11, image: null }];
const answer = {
  orderNumber: 'ORD-2026-0601', total: 12, currency: 'USD', addonToken: 'x'.repeat(40),
  postOrderOffer: { id: 'po1', name: 'قطعة كمان', quantity: 1, freeQuantity: 0, price: 10, listPrice: 14 },
  postOrderWindowMinutes: 15,
};
type Wa = NonNullable<React.ComponentProps<typeof OrderForm>['afterOrderWhatsapp']>;

async function orderPlaced(wa: Wa, withOffers = true) {
  const body = withOffers ? answer : { orderNumber: answer.orderNumber, total: 12, currency: 'USD' };
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
  render(
    <OrderForm slug="s" productName="ماء الكمأ" basePrice={12} currency="USD" offers={offers}
      recommendations={withOffers ? recommendations : []} regions={['دمشق']} whatsapp="+963999000111" afterOrderWhatsapp={wa} />
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
const button = () => document.querySelector<HTMLAnchorElement>('.lp-wa-after');

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('when it appears', () => {
  it('«فوراً» — as it always did, above the offers', async () => {
    await orderPlaced({ when: 'now' });
    expect(button()).toBeTruthy();
    expect(button()!.compareDocumentPosition(document.querySelector('.lp-upsell')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('«آخر شي» — hidden while the offers wait for an answer, then under them', async () => {
    await orderPlaced({ when: 'end' });
    expect(button()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'لا شكراً' }));
    expect(button(), 'the suggestions are still waiting').toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /لا شكراً، أكمل بطلبي/ }));
    expect(button()).toBeTruthy();
    expect(button()!.textContent).toContain('أكّد طلبك على واتساب');
  });

  it('«آخر شي» with no offers at all is simply there', async () => {
    await orderPlaced({ when: 'end' }, false);
    expect(button()).toBeTruthy();
  });

  it('«بعد ثواني» — after the seller’s seconds, not before', async () => {
    await orderPlaced({ when: 'delay', delaySeconds: 1 });
    expect(button()).toBeNull();
    await act(() => new Promise((r) => setTimeout(r, 1100)));
    expect(button()).toBeTruthy();
  });

  it('NEGATIVE: «يفتح لحاله» waits for the button — with «آخر شي» nothing opens while the offers are on the screen', async () => {
    await orderPlaced({ when: 'end', autoOpen: true });
    await act(() => new Promise((r) => setTimeout(r, 3200)));
    expect(leaveFor).not.toHaveBeenCalled();
  }, 10_000);
});

describe('what it looks like', () => {
  it('a saved page draws the button it always drew: outlined, words only', async () => {
    await orderPlaced({});
    expect(button()!.getAttribute('data-look')).toBe('outline');
    expect(button()!.style.border).toContain('1px solid');
    expect(button()!.querySelector('svg')).toBeNull();
  });

  it('WhatsApp green with its icon, the full width, a capsule', async () => {
    await orderPlaced({ look: 'green', icon: true, wide: true, shape: 'pill' });
    const s = button()!.style;
    expect(s.background).toMatch(/rgb\(37, 211, 102\)|#25D366/i);
    expect(s.width).toBe('100%');
    expect(s.borderRadius).toBe('999px');
    expect(button()!.querySelector('svg')).toBeTruthy();
  });

  it('the seller’s own colour wins over the look’s', () => {
    expect(whatsappButtonStyle({ look: 'solid', color: '#123456' }, false).background).toBe('#123456');
    expect(whatsappButtonStyle({ look: 'outline', color: '#123456' }, false)).toMatchObject({ color: '#123456', border: '1px solid #123456' });
  });

  it('the round corner button: fixed, the icon alone, its words still read aloud', async () => {
    await orderPlaced({ look: 'floating', label: 'كلّمنا' });
    expect(button()!.style.position).toBe('fixed');
    expect(button()!.getAttribute('aria-label')).toBe('كلّمنا');
    expect(button()!.textContent).toBe('');
  });

  it('NEGATIVE: the movement is dropped for a visitor whose device asks for less', () => {
    expect(whatsappButtonStyle({ pulse: true }, false).animation).toContain('lp-bounce');
    expect(whatsappButtonStyle({ pulse: true }, true).animation).toBeUndefined();
  });

  it('NEGATIVE: a colour that is not a colour is refused at the door and ignored on the page', () => {
    expect(landingSectionSchema.safeParse({ ...newSection('form'), whatsappColor: 'red;background:url(x)' }).success).toBe(false);
    expect(landingSectionSchema.safeParse({ ...newSection('form'), whatsappWhen: 'never' }).success).toBe(false);
    expect(landingSectionSchema.safeParse({ ...newSection('form'), whatsappDelay: 500 }).success).toBe(false);
    expect(whatsappButtonStyle({ look: 'green', color: 'url(x)' }, false).background).toBe('#25D366');
  });

  it('a saved form block reads as the button it was', () => {
    expect(landingSectionSchema.parse(newSection('form'))).toMatchObject({
      whatsappWhen: 'now', whatsappDelay: 5, whatsappLook: 'outline', whatsappShape: 'curved',
      whatsappWide: false, whatsappColor: '', whatsappIcon: false, whatsappPulse: false,
    });
  });
});

describe('the editor panel', () => {
  const section = {
    whatsappAfter: true, whatsappLabel: 'أكّد طلبك على واتساب', whatsappMessage: 'طلبي {رقم_الطلب}', whatsappNumber: '', whatsappAutoOpen: false,
    afterOrderFlow: 'together' as const, afterOrderBanner: 'none' as const, afterOrderBannerText: 'مبروك!', upsellLook: 'card' as const, crossSellLook: 'list' as const,
  };

  it('the timing and the look are the seller’s to pick, and the button is shown as it will look', async () => {
    apiJson.mockResolvedValue({});
    const patch = vi.fn();
    render(<AfterOrderPanel section={section} patch={patch} ctx={{}} />);
    fireEvent.click(screen.getByRole('button', { name: 'آخر شي' }));
    fireEvent.click(screen.getByRole('button', { name: 'أخضر واتساب' }));
    fireEvent.click(screen.getByRole('button', { name: 'كبسولة' }));
    fireEvent.change(screen.getByLabelText('لون زر واتساب'), { target: { value: '#123456' } });
    fireEvent.click(screen.getByLabelText('بعرض الشاشة'));
    fireEvent.click(screen.getByLabelText('أيقونة واتساب'));
    expect(patch.mock.calls.map((c) => c[0])).toEqual([
      { whatsappWhen: 'end' }, { whatsappLook: 'green' }, { whatsappShape: 'pill' }, { whatsappColor: '#123456' },
      { whatsappWide: true }, { whatsappIcon: true },
    ]);
    expect(screen.getByLabelText('معاينة زر واتساب').textContent).toContain('أكّد طلبك على واتساب');
    await act(async () => {});
  });

  it('«بعد ثواني» asks how many, and keeps it between 1 and 120', async () => {
    apiJson.mockResolvedValue({});
    const patch = vi.fn();
    render(<AfterOrderPanel section={{ ...section, whatsappWhen: 'delay' as const, whatsappDelay: 5 }} patch={patch} ctx={{}} />);
    fireEvent.change(screen.getByLabelText('عدد الثواني قبل ما يطلع زر واتساب'), { target: { value: '900' } });
    expect(patch).toHaveBeenLastCalledWith({ whatsappDelay: 120 });
    await act(async () => {});
  });
});
