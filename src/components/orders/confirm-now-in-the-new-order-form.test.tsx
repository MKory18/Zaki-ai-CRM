// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { stripComments, repoFile } from '@/lib/guard-source';

/**
 * «الزبون على الخط — أكّده الآن» — AN OPTION OF THE ONE FORM, NOT A BUTTON ON ANOTHER SCREEN.
 *
 * The shipping-batches screen carried «أضف طلباً مؤكداً»: a second button that opened a second
 * copy of the new-order form and then confirmed the result. The option lives in the form now:
 *
 *   · it is drawn only for somebody who holds `orders.confirm` (the door asks the same);
 *   · ticked, the order is created as ever and THEN confirmed through the ordinary
 *     confirmation door — the same two requests the batches screen made;
 *   · unticked, nothing about creating an order is different;
 *   · if confirming is refused the order still exists and the message says exactly that.
 */

const { apiFetch, apiJson, toast, user } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  apiJson: vi.fn(),
  toast: { done: vi.fn(), warn: vi.fn(), failed: vi.fn() },
  user: { current: null as unknown },
}));

vi.mock('@/lib/api-client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a), apiJson: (...a: unknown[]) => apiJson(...a) }));
vi.mock('@/context/AppContext', () => ({
  useApp: () => ({ t: (k: string) => k, locale: 'ar', isRtl: true, currentUser: user.current }),
}));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => toast }));
vi.mock('@/hooks/useMayOpen', () => ({ useMayOpen: () => () => true }));
vi.mock('@/hooks/useRegions', () => ({
  useRegions: () => ({
    regions: [{ id: 'r1', name: 'عمّان', delivery: null, deliveryAr: null }],
    countryName: 'الأردن',
    currency: { code: 'JOD', minorUnit: 3 },
    loading: false,
  }),
}));
vi.mock('@/hooks/useDeliveryEta', () => ({ useDeliveryEta: () => ({ eta: null, loading: false }) }));
vi.mock('@/hooks/useProducts', () => ({
  useProducts: () => ({ products: [{ id: 'p1', name: 'كريم', basePrice: 10, offers: [] }], loading: false }),
}));

import { CreateOrderModal } from './CreateOrderModal';

const CONFIRMER = { id: 'u1', status: 'ACTIVE', role: 'MANAGER', permissions: ['orders.create', 'orders.confirm'] };
const ENTRY_ONLY = { id: 'u2', status: 'ACTIVE', role: 'MODERATOR', permissions: ['orders.create'] };
const ORDER = { id: 'o-1', orderNumber: 'ORD-26-0001' };

const onSuccess = vi.fn<(order?: { id: string; orderNumber?: string }) => void>();
let confirmRefusal: string | null;

beforeEach(() => {
  vi.clearAllMocks();
  user.current = CONFIRMER;
  confirmRefusal = null;
  apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === '/api/orders' && init?.method === 'POST') return { ok: true, json: async () => ({ order: ORDER }) };
    return { ok: true, json: async () => ({}) };
  });
  apiJson.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      if (confirmRefusal) throw new Error(confirmRefusal);
      return {};
    }
    return { order: { version: 4 } };
  });
});
afterEach(cleanup);

const open = async () => {
  render(<CreateOrderModal isOpen onClose={() => {}} onSuccess={onSuccess} />);
  await screen.findByLabelText('المحافظة');
};
const fill = () => {
  fireEvent.change(screen.getByPlaceholderText('مثال: 0936654998'), { target: { value: '0791234567' } });
  fireEvent.change(screen.getByPlaceholderText('مثال: عبدالله عبدالقادر'), { target: { value: 'سامر أحمد' } });
  fireEvent.change(screen.getByPlaceholderText('الشارع، البناء، المنطقة...'), { target: { value: 'عمّان - الجبيهة' } });
  fireEvent.change(screen.getByLabelText('المحافظة'), { target: { value: 'r1' } });
};
const submit = async () => {
  const button = await screen.findByRole('button', { name: /إنشاء الطلب/ });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  await act(async () => {
    fireEvent.click(button);
  });
};
const confirmCalls = () => apiJson.mock.calls.filter((c) => String(c[0]).endsWith('/confirmation'));

describe('who is offered it', () => {
  it('somebody who may confirm sees the option, unticked', async () => {
    await open();
    const box = screen.getByRole('checkbox', { name: /الزبون على الخط/ }) as HTMLInputElement;
    expect(box.checked).toBe(false);
  });

  it('NEGATIVE: an entry-only moderator is not offered it — confirming is not theirs', async () => {
    user.current = ENTRY_ONLY;
    await open();
    expect(screen.queryByRole('checkbox', { name: /الزبون على الخط/ })).toBeNull();
    expect(screen.queryByText(/أكّده الآن/)).toBeNull();
  });
});

describe('ticked', () => {
  it('creates the order, then confirms it through the ordinary door — with the version it read', async () => {
    await open();
    fill();
    fireEvent.click(screen.getByRole('checkbox', { name: /الزبون على الخط/ }));
    expect(screen.getByRole('button', { name: /إنشاء الطلب وتأكيده/ })).toBeTruthy();
    await submit();
    await waitFor(() => expect(confirmCalls()).toHaveLength(1));
    const [url, init] = confirmCalls()[0];
    expect(url).toBe('/api/orders/o-1/confirmation');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ action: 'confirm', expectedVersion: 4 });
    expect(toast.done).toHaveBeenCalledTimes(1);
    expect(toast.done.mock.calls[0][0]).toContain('ORD-26-0001');
    expect(toast.done.mock.calls[0][0]).toContain('وتأكيده');
    expect(onSuccess).toHaveBeenCalledWith(ORDER);
  });

  it('a refusal to confirm leaves the order made, and says so', async () => {
    confirmRefusal = 'الطلب مقفول';
    await open();
    fill();
    fireEvent.click(screen.getByRole('checkbox', { name: /الزبون على الخط/ }));
    await submit();
    await waitFor(() => expect(toast.warn).toHaveBeenCalled());
    expect(toast.warn.mock.calls[0][0]).toContain('أُنشئ ORD-26-0001 لكن تعذّر تأكيده');
    expect(toast.warn.mock.calls[0][0]).toContain('الطلب مقفول');
    expect(toast.done).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith(ORDER);
  });

  it('NEGATIVE: if the order itself could not be created nothing is confirmed', async () => {
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) =>
      url === '/api/orders' && init?.method === 'POST'
        ? { ok: false, json: async () => ({ error: 'رقم محظور' }) }
        : { ok: true, json: async () => ({}) }
    );
    await open();
    fill();
    fireEvent.click(screen.getByRole('checkbox', { name: /الزبون على الخط/ }));
    await submit();
    await waitFor(() => expect(toast.failed).toHaveBeenCalledWith('رقم محظور'));
    expect(apiJson).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

describe('unticked', () => {
  it('creating an order is exactly what it was — no confirmation request at all', async () => {
    await open();
    fill();
    await submit();
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(ORDER));
    expect(apiJson).not.toHaveBeenCalled();
    expect(toast.done.mock.calls[0][0]).toBe('تم إنشاء الطلب ORD-26-0001 بنجاح');
  });

  it('and the option does not carry over to the next time the form opens', async () => {
    const { rerender } = render(<CreateOrderModal isOpen onClose={() => {}} onSuccess={onSuccess} />);
    await screen.findByLabelText('المحافظة');
    fireEvent.click(screen.getByRole('checkbox', { name: /الزبون على الخط/ }));
    rerender(<CreateOrderModal isOpen={false} onClose={() => {}} onSuccess={onSuccess} />);
    rerender(<CreateOrderModal isOpen onClose={() => {}} onSuccess={onSuccess} />);
    await screen.findByLabelText('المحافظة');
    expect((screen.getByRole('checkbox', { name: /الزبون على الخط/ }) as HTMLInputElement).checked).toBe(false);
  });
});

describe('the batches screen', () => {
  it('no longer carries its own button, its own copy of the form, or its own confirmation call', () => {
    const src = stripComments(repoFile('src/components/screens/ShippingBatchesScreen.tsx'));
    expect(src).not.toContain('CreateOrderModal');
    expect(src).not.toContain('أضف طلباً مؤكداً');
    expect(src).not.toContain("action: 'confirm'");
  });

  it('and the confirmation call is written once', () => {
    const src = stripComments(repoFile('src/lib/confirm-now.ts'));
    expect(src).toContain("action: 'confirm'");
    expect(stripComments(repoFile('src/components/orders/CreateOrderModal.tsx'))).not.toContain("action: 'confirm'");
  });
});
