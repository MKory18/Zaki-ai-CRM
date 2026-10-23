// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * «الطلبات» — A PRINTED BATCH GETS ITS MOMENT, AND NOTHING ELSE CHANGES.
 *
 * The one screen that renders BulkBar, and the one bulk action on it that
 * FINISHES with a count: printing the waybills. The moment is display
 * only, so these tests prove two things at once — the picture appears for
 * a clean batch of ten or more, and the print itself is the very same call
 * it always was (same ids, same mode, called once).
 *
 * ── THE MUTATIONS THIS WAS RUN AGAINST (each turned it red) ──
 *   · `done={batchDone}` removed from the BulkBar    → «a clean batch of twelve»
 *   · the `mode === 'print'` condition dropped       → «PDF marks nothing printed»
 *   · the `refused.length === 0` condition dropped   → «a batch with refusals»
 * ═══════════════════════════════════════════════════════════════════════
 */

const { apiFetch, currentUser, openWaybills } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  currentUser: { value: null as unknown },
  openWaybills: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/orders',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
  apiJson: vi.fn(async () => ({})),
}));
vi.mock('@/context/AppContext', () => ({
  useApp: () => ({
    locale: 'ar',
    t: { orders: 'الطلبات', export: 'تصدير CSV', quickCreateOrder: 'إدخال طلب سريع' },
    currentUser: currentUser.value,
  }),
}));
vi.mock('@/hooks/useRegions', () => ({ useRegions: () => ({ regions: [] }) }));
vi.mock('@/hooks/useProducts', () => ({ useProducts: () => ({ products: [] }) }));
vi.mock('@/components/ui/Confirm', () => ({ useTell: () => vi.fn(), useConfirm: () => vi.fn() }));
vi.mock('@/components/labels/LabelSize', () => ({ useLabelSize: () => 'thermal', LabelSizePicker: () => null }));
vi.mock('@/components/labels/openWaybills', () => ({
  openWaybills: (...a: unknown[]) => openWaybills(...a),
  describeRefused: () => '',
  WaybillError: class extends Error {},
}));
vi.mock('@/components/orders/CreateOrderModal', () => ({ CreateOrderModal: () => null }));
vi.mock('@/components/orders/AiOrderModal', () => ({ AiOrderModal: () => null }));
vi.mock('@/components/orders/OrderDetailModal', () => ({ OrderDetailModal: () => null }));
vi.mock('@/components/orders/ImportOrdersDialog', () => ({ ImportOrdersDialog: () => null }));
vi.mock('@/components/scan/ScanButton', () => ({ ScanButton: () => null }));
vi.mock('@/components/ui/ProductPicker', () => ({ ProductPicker: () => null }));
vi.mock('@/components/ui/SavedViews', () => ({ SavedViews: () => null }));
vi.mock('@/components/orders/CustomerHistory', () => ({ CustomerHistoryButton: () => null }));

import { OrdersScreen } from './OrdersScreen';

// Twelve synthetic rows — no real person in any of them.
const ROWS = Array.from({ length: 12 }, (_, i) => ({
  id: `o${i + 1}`,
  orderNumber: `ORD-26-${5000 + i}`,
  state: 'CONFIRMED',
  customer: { id: `c${i + 1}`, fullName: `زبون تجريبي ${i + 1}`, city: 'عمّان' },
  region: { name: 'إربد' },
  productNameSnapshot: 'منتج تجريبي',
  quantity: 1,
  source: 'Sheet import',
  moderator: { name: 'سارة' },
  createdAt: '2026-10-20T09:00:00.000Z',
  totalAmount: 40,
  confirmationStatus: 'NEW',
  deliveryProvider: { kind: 'COMPANY', name: 'ناقل' },
}));

beforeEach(() => {
  vi.clearAllMocks();
  currentUser.value = { id: 'u1', name: 'سارة', role: 'SUPER_ADMIN', permissions: ['orders.view', 'ops.labels'], status: 'ACTIVE' };
  apiFetch.mockImplementation(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () =>
      String(url).startsWith('/api/orders?')
        ? { orders: ROWS, pagination: { page: 1, limit: 25, total: 12, totalPages: 1 } }
        : { orders: [], pagination: { page: 1, pages: 1, total: 0 } },
  }));
});
afterEach(cleanup);

async function selectAllAndPress(label: string) {
  render(<OrdersScreen />);
  // The rows first: the header box exists before they arrive, and ticking
  // it over an empty page selects nothing.
  await screen.findByLabelText(`تحديد الطلب ${ROWS[11].orderNumber}`);
  fireEvent.click(screen.getByLabelText('تحديد كل الطلبات في هذه الصفحة'));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: label }));
  });
}
const moment = () => document.querySelector('[data-phase]');

describe('«الطلبات» — the printed batch and its moment', () => {
  it('— a clean batch of twelve: the moment, with the count the server returned — and the print unchanged', async () => {
    openWaybills.mockResolvedValue({ count: 12, refused: [] });
    await selectAllAndPress('طباعة البوالص');
    expect(openWaybills).toHaveBeenCalledTimes(1);
    expect(openWaybills.mock.calls[0][0].orderIds).toEqual(ROWS.map((r) => r.id));
    expect(openWaybills.mock.calls[0][1]).toBe('print');
    expect(moment(), 'دفعة نظيفة من 12 بلا لحظة').not.toBeNull();
    expect(document.querySelector('[data-bulk-moment]')?.textContent).toContain('12');
  });

  it('— PDF marks nothing printed, so nothing finished: no moment', async () => {
    openWaybills.mockResolvedValue({ count: 12, refused: [] });
    await selectAllAndPress('PDF');
    expect(openWaybills.mock.calls[0][1]).toBe('pdf');
    expect(moment()).toBeNull();
  });

  it('— a batch with refusals: the refusal dialog is the message, not a celebration', async () => {
    openWaybills.mockResolvedValue({ count: 11, refused: [{ id: 'o12', orderNumber: 'ORD-26-5011', reason: 'x' }] });
    await selectAllAndPress('طباعة البوالص');
    expect(moment()).toBeNull();
  });

  it('— a small batch is a click: the moment\'s own floor decides, not the screen', async () => {
    openWaybills.mockResolvedValue({ count: 3, refused: [] });
    await selectAllAndPress('طباعة البوالص');
    expect(moment()).toBeNull();
  });
});
