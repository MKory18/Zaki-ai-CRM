// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import React from 'react';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * «افتح الطلب» DID NOTHING WHEN YOU PRESSED IT ON THE ORDERS SCREEN.
 *
 * An order's address is `/orders/<id>`, a door to `/orders?highlight=<id>`,
 * which opens that order's panel over the list. The screen read the
 * `highlight` parameter ONCE, at mount — right for a page load, wrong for
 * the link that matters most: the toast after making an order, offered on
 * the very screen the order was made from. Next keeps the page mounted when
 * only the query changes, so nothing re-read it and the button was dead.
 *
 * And closing the panel left `?highlight=` in the address, so a refresh
 * reopened a panel nobody asked for, and a second link to the SAME order
 * changed nothing — the address already said what it was being asked to say.
 * ═══════════════════════════════════════════════════════════════════════
 */

const { params, replace } = vi.hoisted(() => ({
  params: { current: new URLSearchParams() },
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => params.current,
  usePathname: () => '/orders',
  useRouter: () => ({ push: vi.fn(), replace }),
}));
vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(async () => ({
    ok: true,
    json: async () => ({ orders: [], pagination: { page: 1, pages: 1, total: 0 } }),
  })),
  apiJson: vi.fn(async () => ({})),
}));
vi.mock('@/context/AppContext', () => ({
  useApp: () => ({
    locale: 'ar',
    t: { orders: 'الطلبات', export: 'تصدير CSV', quickCreateOrder: 'إدخال طلب سريع' },
    currentUser: { id: 'u1', name: 'سارة', role: 'MODERATOR', permissions: ['orders.view'], status: 'ACTIVE' },
  }),
}));
vi.mock('@/hooks/useRegions', () => ({ useRegions: () => ({ regions: [] }) }));
vi.mock('@/hooks/useProducts', () => ({ useProducts: () => ({ products: [] }) }));
vi.mock('@/components/ui/Confirm', () => ({ useTell: () => vi.fn(), useConfirm: () => vi.fn() }));
vi.mock('@/components/labels/LabelSize', () => ({ useLabelSize: () => 'thermal', LabelSizePicker: () => null }));
vi.mock('@/components/labels/openWaybills', () => ({
  openWaybills: vi.fn(),
  describeRefused: () => '',
  WaybillError: class extends Error {},
}));
vi.mock('@/components/orders/CreateOrderModal', () => ({ CreateOrderModal: () => null }));
vi.mock('@/components/orders/AiOrderModal', () => ({ AiOrderModal: () => null }));
vi.mock('@/components/orders/ImportOrdersDialog', () => ({ ImportOrdersDialog: () => null }));
vi.mock('@/components/scan/ScanButton', () => ({ ScanButton: () => null }));
vi.mock('@/components/ui/ProductPicker', () => ({ ProductPicker: () => null }));
vi.mock('@/components/ui/SavedViews', () => ({ SavedViews: () => null }));
vi.mock('@/components/orders/CustomerHistory', () => ({ CustomerHistoryButton: () => null }));

/**
 * The panel, reduced to what this is about: which order it is open on, and a
 * way to close it. Everything inside the real one is somebody else's test.
 */
vi.mock('@/components/orders/OrderDetailModal', () => ({
  OrderDetailModal: ({ orderId, isOpen, onClose }: { orderId: string | null; isOpen: boolean; onClose: () => void }) => (
    <div data-testid="panel" data-open={String(isOpen)} data-order={orderId ?? ''}>
      <button onClick={onClose}>close-panel</button>
    </div>
  ),
}));

import { OrdersScreen } from './OrdersScreen';

const ID = '3f2b8c1e-7a4d-4e65-9b0a-1c2d3e4f5a6b';
const OTHER = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const panel = () => screen.getByTestId('panel');

beforeEach(() => {
  vi.clearAllMocks();
  params.current = new URLSearchParams();
});
afterEach(cleanup);

describe('a link to an order, followed on the orders screen', () => {
  it('— opens the order when the screen is loaded by it, as it always did', () => {
    params.current = new URLSearchParams(`highlight=${ID}`);
    render(<OrdersScreen />);
    expect(panel().getAttribute('data-open')).toBe('true');
    expect(panel().getAttribute('data-order')).toBe(ID);
  });

  it('and opens it when the link is followed while the screen is ALREADY open', () => {
    /*
     * THE CLAIM THAT FAILED BEFORE THE FIX.
     *
     * Mounted with no parameter, then the query changes under it — exactly
     * what a toast's «افتح الطلب» does on the screen the order was made
     * from. The state used to be initialised from the URL once and never
     * looked at it again.
     */
    const view = render(<OrdersScreen />);
    expect(panel().getAttribute('data-open')).toBe('false');

    params.current = new URLSearchParams(`highlight=${ID}`);
    view.rerender(<OrdersScreen />);

    expect(panel().getAttribute('data-open'), 'الرابط ما فتح الطلب').toBe('true');
    expect(panel().getAttribute('data-order')).toBe(ID);
  });

  it('and a second link, to a DIFFERENT order, moves the panel to that one', () => {
    params.current = new URLSearchParams(`highlight=${ID}`);
    const view = render(<OrdersScreen />);
    params.current = new URLSearchParams(`highlight=${OTHER}`);
    view.rerender(<OrdersScreen />);
    expect(panel().getAttribute('data-order')).toBe(OTHER);
  });
});

describe('closing the panel', () => {
  it('— clears the order from the address, so a refresh does not reopen it', async () => {
    params.current = new URLSearchParams(`highlight=${ID}`);
    render(<OrdersScreen />);

    await act(async () => {
      screen.getByText('close-panel').click();
    });

    expect(panel().getAttribute('data-open')).toBe('false');
    expect(replace, 'العنوان بقي يحمل الطلب').toHaveBeenCalledWith('/orders', { scroll: false });
  });

  it('and does not touch the address when the panel was opened by the list, not a link', async () => {
    // Nothing in the URL asked for it, so nothing in the URL needs clearing —
    // and a needless replace is a navigation the person did not make.
    const view = render(<OrdersScreen />);
    // Open it the way a row does: through the same state, with no parameter.
    params.current = new URLSearchParams();
    view.rerender(<OrdersScreen />);
    await act(async () => {
      screen.getByText('close-panel').click();
    });
    expect(replace).not.toHaveBeenCalled();
  });

  it('and the SAME link works again afterwards, because the address changed in between', () => {
    params.current = new URLSearchParams(`highlight=${ID}`);
    const view = render(<OrdersScreen />);

    // Closed: the address is cleared (what `replace` does in the browser)…
    act(() => {
      screen.getByText('close-panel').click();
    });
    params.current = new URLSearchParams();
    view.rerender(<OrdersScreen />);
    expect(panel().getAttribute('data-open')).toBe('false');

    // …so the same order, asked for again, is a CHANGE, and fires.
    params.current = new URLSearchParams(`highlight=${ID}`);
    view.rerender(<OrdersScreen />);
    expect(panel().getAttribute('data-open'), 'نفس الرابط ما اشتغل مرتين').toBe('true');
  });
});
