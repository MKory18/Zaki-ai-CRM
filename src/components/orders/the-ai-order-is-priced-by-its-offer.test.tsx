// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

/**
 * «سعر العرض هو اللي بيمشي بإدخال الطلب بالذكاء» — THE OWNER, 27/10 (RV151).
 *
 * The box opened on the figure the customer typed into their message
 * («السعر: 5» beside a bundle of 22), and one keystroke made it the charge.
 * Now the box is the offer's price for exactly this quantity, locked while
 * an offer covers it, following the quantity when the reviewer changes it;
 * the customer's figure is SAID, beside the box, and kept in the history.
 * And when the door prices it from the offer (a product changed by hand),
 * the box takes that price — nothing is saved at a number the button did
 * not show.
 */

const { apiFetch, toastWarn, toastFailed } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  toastWarn: vi.fn(),
  toastFailed: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a), apiJson: vi.fn() }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ done: vi.fn(), warn: toastWarn, failed: toastFailed }) }));
vi.mock('@/context/AppContext', () => ({ useApp: () => ({ t: { cancel: 'إلغاء' }, locale: 'ar', isRtl: true }) }));
vi.mock('@/context/StoreCurrency', () => ({ useStoreCurrency: () => ({ code: 'JOD', minorUnit: 2 }) }));
vi.mock('@/hooks/useRegions', () => ({
  useRegions: () => ({ regions: [{ id: 'r1', name: 'دمشق' }], countryName: 'سوريا', currency: { code: 'JOD', minorUnit: 2 } }),
}));
vi.mock('@/hooks/useProducts', () => ({
  useProducts: () => ({ products: [{ id: 'prod-a', name: 'كريم' }, { id: 'prod-b', name: 'زيت' }] }),
}));
vi.mock('@/components/ui/ProductPicker', () => ({
  ProductPicker: ({ value, onChange, products }: { value: string; onChange: (id: string) => void; products: { id: string; name: string }[] }) => (
    <select aria-label="المنتج" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {products.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  ),
}));

import { AiOrderModal } from './AiOrderModal';

const PREVIEW = {
  parsed: {
    customerName: 'عبدالله', phone: '0936654998', governorate: 'دمشق', address: 'بانياس',
    productQuery: 'كريم', quantity: 1, price: 5, notes: '', source: 'الشيت',
  },
  engine: 'deterministic',
  matchedProduct: { id: 'prod-a', name: 'كريم', score: 40 },
  productMatchConfident: true,
  suggestedPrice: 22,
  suggestedOfferName: 'قطعة',
  priceFromOffer: true,
  typedPrice: 5,
  offerPrices: [
    { quantity: 1, price: 22, name: 'قطعة' },
    { quantity: 2, price: 40, name: 'قطعتان' },
  ],
  existingCustomer: null,
  aiSkipped: null,
};

const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });
const bodies: Record<string, unknown>[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  bodies.length = 0;
  apiFetch.mockImplementation(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    bodies.push(body);
    return body.confirm ? reply(200, { success: true }) : reply(200, PREVIEW);
  });
});
afterEach(cleanup);

async function parse() {
  render(<AiOrderModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
  fireEvent.change(screen.getByPlaceholderText(/الاسم:/), { target: { value: 'الاسم: عبدالله\nالسعر: 5' } });
  fireEvent.click(screen.getByRole('button', { name: /تحليل الطلب/ }));
  await waitFor(() => expect((screen.getByLabelText(/الإجمالي/) as HTMLInputElement).value).toBe('22'));
}
const priceBox = () => screen.getByLabelText(/الإجمالي/) as HTMLInputElement;
const quantityBox = () => screen.getByLabelText('الكمية') as HTMLInputElement;

describe('the box is the offer’s price', () => {
  it('opens on the offer’s 22, not the customer’s 5, locked, with the offer named', async () => {
    await parse();
    expect(priceBox().value).toBe('22');
    expect(priceBox().disabled).toBe(true);
    expect(screen.getByText(/سعر العرض «قطعة» — يُسجَّل كما هو/)).toBeTruthy();
  });

  it('says what the customer typed, beside it', async () => {
    await parse();
    expect(screen.getByText(/الزبون كتب سعراً/)).toBeTruthy();
    expect(screen.getByText(/الزبون كتب سعراً/).textContent).toContain('5');
  });

  it('follows the quantity: two pieces is the two-piece bundle’s 40', async () => {
    await parse();
    fireEvent.change(quantityBox(), { target: { value: '2' } });
    expect(priceBox().value).toBe('40');
    expect(priceBox().disabled).toBe(true);
  });

  it('a quantity no offer covers unlocks the box for the reviewer', async () => {
    await parse();
    fireEvent.change(quantityBox(), { target: { value: '3' } });
    expect(priceBox().disabled).toBe(false);
  });

  it('sends the offer’s price, and the customer’s figure only as a record', async () => {
    await parse();
    fireEvent.click(screen.getByRole('button', { name: /تسجيل الطلب/ }));
    await waitFor(() => expect(bodies.some((b) => b.confirm)).toBe(true));
    const sent = bodies.find((b) => b.confirm)!.parsed as Record<string, unknown>;
    expect(sent.finalPrice).toBe('22');
    expect(sent.typedPrice).toBe(5);
  });

  it('when the door prices it from the offer, the box takes that price and nothing is saved yet', async () => {
    const onSuccess = vi.fn();
    apiFetch.mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      bodies.push(body);
      if (!body.confirm) return reply(200, { ...PREVIEW, offerPrices: [], priceFromOffer: false, typedPrice: null, suggestedPrice: 5 });
      return reply(409, { error: 'سعر العرض «قطعة» لهذه الكمية 22 — الطلب بالذكاء يُسجَّل بسعر العرض', code: 'OFFER_PRICE', offerPrice: 22, offerName: 'قطعة' });
    });
    render(<AiOrderModal isOpen onClose={vi.fn()} onSuccess={onSuccess} />);
    fireEvent.change(screen.getByPlaceholderText(/الاسم:/), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /تحليل الطلب/ }));
    await waitFor(() => expect(priceBox().value).toBe('5'));
    fireEvent.click(screen.getByRole('button', { name: /تسجيل الطلب/ }));
    await waitFor(() => expect(priceBox().value).toBe('22'));
    expect(priceBox().disabled).toBe(true);
    expect(toastWarn).toHaveBeenCalledWith(expect.stringContaining('سعر العرض'));
    expect(toastFailed).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('NEGATIVE: a product changed by hand drops the old product’s bundles — its box is not locked on them', async () => {
    await parse();
    fireEvent.change(screen.getByLabelText('المنتج'), { target: { value: 'prod-b' } });
    expect(priceBox().value).toBe('');
    expect(priceBox().disabled).toBe(false);
    fireEvent.change(quantityBox(), { target: { value: '2' } });
    expect(priceBox().value, 'the other product’s bundle priced this one').toBe('');
  });
});
