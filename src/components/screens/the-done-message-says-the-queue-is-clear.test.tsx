// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

/**
 * «تمّت المهمة!» MEANS THE QUEUE IS CLEAR — NOT THAT THE LIST HAPPENS TO BE EMPTY.
 *
 * Two screens said it when it was not true, and one of them never said it
 * when it was:
 *
 *   · «شحن جديد» treated the courier dropdown as a FILTER. It is not one — the
 *     courier is the shipment's target, used to price each row and sent as
 *     `courier=` only for that (`/api/ops/shipments` says so in a comment) —
 *     and a clerk has to pick one to ship at all. So after shipping the last
 *     order the list emptied, the screen read itself as «filtered», and the
 *     person saw «لا طلبات جاهزة للشحن بهذه الفلاتر» with no tick and no way
 *     on, in the one flow the button was written for.
 *
 *   · «دفعات الشحن» drew the tick for any empty TAB: a person looking at
 *     «قيد التجميع» with thirty handed-over batches beside it was told the
 *     job was done.
 *
 * These render the screens and read what a person reads. Treat the courier as
 * a filter again and the first test finds the filters message; draw the tick
 * for a tab again and the fourth finds «تمّت المهمة!» over a non-empty book.
 */

const { apiJson } = vi.hoisted(() => ({ apiJson: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiJson: (...a: unknown[]) => apiJson(...a), apiFetch: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/ops/shipments/new',
}));
vi.mock('@/components/ui/Confirm', () => ({
  useAsk: () => async () => null,
  useConfirm: () => async () => false,
  useTell: () => vi.fn(),
}));
vi.mock('@/hooks/useMayOpen', () => ({ useMayOpen: () => () => true }));
vi.mock('@/hooks/useLiveRefresh', () => ({
  useLiveRefresh: (load: () => Promise<void>, opts?: { initial?: boolean }) => {
    React.useEffect(() => {
      if (opts?.initial !== false) void load();
    }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  },
}));
vi.mock('@/components/labels/LabelSize', () => ({ useLabelSize: () => 'thermal', LabelSizePicker: () => null }));
vi.mock('@/components/labels/openWaybills', () => ({
  describeRefused: vi.fn(),
  openWaybills: vi.fn(),
  WaybillError: class extends Error {},
}));
vi.mock('@/components/orders/CreateOrderModal', () => ({ CreateOrderModal: () => null }));
vi.mock('@/components/scan/ScanButton', () => ({ ScanSheet: () => null }));
vi.mock('@/components/orders/CustomerHistory', () => ({ CustomerHistoryButton: () => null }));
vi.mock('@/components/screens/confirmation/ActionDialogs', () => ({ RejectDialog: () => null }));
vi.mock('@/components/ops/DelayShipmentDialog', () => ({ DelayShipmentDialog: () => null }));

import { ShipmentsNewScreen } from './ShipmentsNewScreen';
import { ShippingBatchesScreen } from './ShippingBatchesScreen';

const DONE = 'تمّت المهمة!';
const FILTERED = 'لا طلبات جاهزة للشحن بهذه الفلاتر';

/** Nothing is ready to ship; one courier exists to pick. */
function nothingReady() {
  apiJson.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/ops/references')) {
      return { providers: [{ id: 'dp1', name: 'Basha Delivery' }], regions: [] };
    }
    if (url.startsWith('/api/ops/shipments')) return { orders: [], heldCount: 0 };
    throw new Error(`unexpected ${url}`);
  });
}

beforeEach(() => {
  apiJson.mockReset();
});
afterEach(cleanup);

describe('«شحن جديد» — the courier is the target, not a filter', () => {
  it('with a courier picked and nothing left to ship, it says the task is done', async () => {
    nothingReady();
    render(<ShipmentsNewScreen />);
    const courier = await screen.findByLabelText('شركة الشحن (للشحنة)');
    await waitFor(() => expect(courier.querySelectorAll('option').length).toBeGreaterThan(1));
    fireEvent.change(courier, { target: { value: 'dp1' } });

    await waitFor(() => expect(screen.getByText(DONE)).toBeTruthy());
    expect(screen.queryByText(FILTERED)).toBeNull();
    // …and the way on is drawn: the road's next stop, as the action.
    expect(screen.getAllByRole('link').some((a) => a.getAttribute('href') === '/ops/batches')).toBe(true);
  });

  it('— and the courier IS still sent, because it prices each row', async () => {
    nothingReady();
    render(<ShipmentsNewScreen />);
    const courier = await screen.findByLabelText('شركة الشحن (للشحنة)');
    await waitFor(() => expect(courier.querySelectorAll('option').length).toBeGreaterThan(1));
    fireEvent.change(courier, { target: { value: 'dp1' } });
    await waitFor(() =>
      expect(apiJson.mock.calls.some(([u]) => String(u).includes('courier=dp1'))).toBe(true)
    );
  });

  it('a real filter (the region, the dates, the search) still reads as filtered — the negative case', async () => {
    nothingReady();
    apiJson.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/ops/references')) {
        return { providers: [], regions: [{ id: 'r1', name: 'عمّان' }] };
      }
      return { orders: [], heldCount: 0 };
    });
    render(<ShipmentsNewScreen />);
    const region = await screen.findByLabelText('المحافظة');
    await waitFor(() => expect(region.querySelectorAll('option').length).toBeGreaterThan(1));
    fireEvent.change(region, { target: { value: 'r1' } });

    await waitFor(() => expect(screen.getByText(FILTERED)).toBeTruthy());
    expect(screen.queryByText(DONE)).toBeNull();
  });
});

const batch = (id: string, status: 'READY' | 'SHIPPED' | 'CLOSED') => ({
  id,
  batchNumber: `B-${id}`,
  status,
  provider: { id: 'dp1', name: 'Basha', code: 'B', kind: 'COMPANY' },
  creator: { id: 'u1', name: 'سارة' },
  createdAt: '2026-10-20T08:00:00.000Z',
  _count: { orders: 3 },
});

describe('«دفعات الشحن» — an empty TAB is not an empty book', () => {
  const openTab = async (name: RegExp) => {
    render(<ShippingBatchesScreen />);
    await screen.findByText(/الكل \(/);
    fireEvent.click(screen.getByRole('button', { name }));
  };

  it('«قيد التجميع» empty while thirty batches were handed over: no tick, a way back to «الكل»', async () => {
    apiJson.mockResolvedValue({
      batches: [batch('1', 'SHIPPED'), batch('2', 'CLOSED')],
      pagination: { total: 2 },
    });
    await openTab(/قيد التجميع/);

    expect(screen.getByText('لا دفعات بهذه الحالة')).toBeTruthy();
    expect(screen.queryByText(DONE)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'عرض الكل' }));
    expect(screen.getByText('B-1')).toBeTruthy();
  });

  it('a book with no batches at all, on «الكل», is the one that says the task is done', async () => {
    apiJson.mockResolvedValue({ batches: [], pagination: { total: 0 } });
    render(<ShippingBatchesScreen />);
    await waitFor(() => expect(screen.getByText(DONE)).toBeTruthy());
  });
});
