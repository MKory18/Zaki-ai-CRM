// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

/**
 * «ارقام الهواتف بالادخال بال ai حولها برمجيا من عربي لانجليزي» — THE OWNER, 22/10 — AT THE BOX THE REVIEWER TYPES IN.
 *
 * The assistant's answer is made Latin by the door (`the-numbers-reach-the-review-in-latin-digits.test.ts`); this is the
 * other half: the «الرقم» box of the review form is editable, an Arabic keypad types Arabic-Indic digits, and what it
 * holds is what the confirm sends. The box turns each digit Latin AS IT IS TYPED — so the reviewer sees what is stored,
 * and the dialler, the blacklist and the duplicate check are never asked to guess the script.
 */

const { apiFetch, apiJson } = vi.hoisted(() => ({ apiFetch: vi.fn(), apiJson: vi.fn() }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ done: vi.fn(), warn: vi.fn(), failed: vi.fn() }) }));
vi.mock('@/lib/api-client', () => ({ apiFetch, apiJson }));
vi.mock('@/context/AppContext', () => ({ useApp: () => ({ t: { cancel: 'إلغاء' }, locale: 'ar', isRtl: true }) }));
vi.mock('@/context/StoreCurrency', () => ({ useStoreCurrency: () => ({ code: 'JOD', minorUnit: 2 }) }));
vi.mock('@/components/ui/ProductPicker', () => ({
  ProductPicker: ({ value, onChange, products }: { value: string; onChange: (id: string) => void; products: { id: string; name: string }[] }) => (
    <select aria-label="المنتج" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {products.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  ),
}));

import { AiOrderModal } from './AiOrderModal';

const PRODUCT = { id: 'prod-aaaaaaaaaa', name: 'كريم', sku: 'KR-1', image: null, basePrice: 14, companyId: 'c1', batches: [], offers: [] };
const PARSED = { customerName: 'عبدالله', phone: '0936654998', governorate: 'دمشق', address: 'بانياس', productQuery: 'كريم', quantity: 2, price: null, notes: '-', source: 'الشيت' };

let sent: { url: string; body: any }[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  sent = [];
  apiJson.mockImplementation(async (path: string) => {
    if (path.startsWith('/api/products')) return { products: [PRODUCT] };
    if (path.startsWith('/api/geo/regions')) {
      return { country: { name: 'سوريا', currencyCode: 'JOD', minorUnit: 2 }, regions: [{ id: '11111111-1111-4111-8111-111111111111', name: 'دمشق' }] };
    }
    return {};
  });
  apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (body?.confirm) {
      sent.push({ url, body });
      return new Response(JSON.stringify({ success: true, order: { id: 'ord-1' } }), { status: 200 });
    }
    return new Response(
      JSON.stringify({
        parsed: PARSED,
        engine: 'parser',
        matchedProduct: { id: PRODUCT.id, name: PRODUCT.name, score: 1 },
        productMatchConfident: true,
        suggestedPrice: null,
        suggestedOfferName: null,
        existingCustomer: null,
      }),
      { status: 200 }
    );
  });
});

afterEach(cleanup);

async function openForm() {
  const user = userEvent.setup();
  render(<AiOrderModal isOpen onClose={() => {}} onSuccess={() => {}} />);
  await user.type(screen.getByRole('textbox'), 'الاسم: عبدالله');
  await user.click(screen.getByText(/تحليل الطلب بالذكاء الاصطناعي/));
  await waitFor(() => expect(screen.getByLabelText('الكمية')).toBeTruthy());
  return user;
}

const phoneBox = () => screen.getByLabelText('الرقم') as HTMLInputElement;

async function retype(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.clear(phoneBox());
  await user.type(phoneBox(), text);
}

describe('the number box of the review form', () => {
  it('— Arabic-Indic digits typed in it are Latin in the box, as they are typed', async () => {
    const user = await openForm();
    await retype(user, '٠٧٩١٢٣٤٥٦٧');
    expect(phoneBox().value).toBe('0791234567');
  });

  it('and so are Persian ones', async () => {
    const user = await openForm();
    await retype(user, '۰۷۹۱۲۳۴۵۶۷');
    expect(phoneBox().value).toBe('0791234567');
  });

  it('and a number that mixes the scripts is Latin throughout, with its «+», its spaces and its brackets untouched', async () => {
    const user = await openForm();
    await retype(user, '+٩٦٢ (٧٩) 1234٥٦٧');
    expect(phoneBox().value).toBe('+962 (79) 1234567');
  });

  it('and one typed in Latin digits is exactly what it was', async () => {
    const user = await openForm();
    await retype(user, '0936654998');
    expect(phoneBox().value).toBe('0936654998');
  });

  it('and the box opens on what the door sent, unchanged — the conversion is not a rewrite of what is already Latin', async () => {
    await openForm();
    expect(phoneBox().value).toBe('0936654998');
  });

  it('and the confirm carries the Latin number the box shows — never the digits the keypad typed', async () => {
    const user = await openForm();
    await retype(user, '٠٧٩١٢٣٤٥٦٧');
    await user.click(screen.getByText(/تسجيل الطلب/));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].body.parsed.phone).toBe('0791234567');
    expect(/[٠-٩۰-۹]/.test(JSON.stringify(sent[0].body.parsed.phone))).toBe(false);
  });
});

describe('only the number is converted', () => {
  it('— the name box keeps the digits it was typed with', async () => {
    const user = await openForm();
    const name = screen.getByLabelText('الاسم') as HTMLInputElement;
    await user.clear(name);
    await user.type(name, 'مكتب ٣');
    expect(name.value).toBe('مكتب ٣');
  });
});
