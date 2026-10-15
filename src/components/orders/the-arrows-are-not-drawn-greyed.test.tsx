// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * A CONTROL THAT CANNOT WORK IS NOT DRAWN GREY — IT IS NOT DRAWN.
 *
 * `orders.navigate` stops the server returning neighbour ids. The two
 * arrow buttons went on rendering anyway, permanently disabled, on every
 * order — indistinguishable from the ordinary end of a list.
 *
 * That is the exact anti-pattern the rest of this change set out to stop
 * on «الطلبات»: a visible control that refuses reads as a broken system
 * rather than as a boundary. Found by the independent review, because the
 * server-side test could only ever see that the ids were absent.
 *
 * Keyed on the ids rather than on the permission, because the ids are what
 * the buttons DO — and a person at the end of their list has nowhere to go
 * either.
 * ═══════════════════════════════════════════════════════════════════════
 */

const { apiFetch, apiJson } = vi.hoisted(() => ({ apiFetch: vi.fn(), apiJson: vi.fn() }));

vi.mock('@/lib/api-client', () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
  apiJson: (...a: unknown[]) => apiJson(...a),
}));
vi.mock('@/context/AppContext', () => ({
  useApp: () => ({
    locale: 'ar',
    t: {},
    currentUser: { id: 'u1', role: 'CONFIRMATION_AGENT', permissions: ['orders.view'], status: 'ACTIVE' },
  }),
}));
vi.mock('@/hooks/useOrderOwnership', () => ({
  useOrderOwnership: () => ({ claim: vi.fn(), release: vi.fn(), busy: false, error: null }),
}));
vi.mock('@/components/orders/useOrderPatch', () => ({ useOrderPatch: () => ({ patch: vi.fn(), saving: false }) }));
/*
 * Every card inside the modal is somebody else's subject, and the nav row
 * is a sibling of them all. Written out one by one rather than in a loop:
 * `vi.mock` is hoisted above the import and a loop of `vi.doMock` is not,
 * so the loop version let the real children render and they fell over on
 * fixture fields that have nothing to do with the arrows.
 */
vi.mock('@/components/orders/OrderResponsibility', () => ({ OrderResponsibility: () => null }));
vi.mock('@/components/orders/CustomerCard', () => ({ CustomerCard: () => null }));
vi.mock('@/components/orders/OrderLinesCard', () => ({ OrderLinesCard: () => null }));
vi.mock('@/components/orders/ConfirmationActions', () => ({ ConfirmationActions: () => null }));
vi.mock('@/components/orders/ShapeRiskPanel', () => ({ ShapeRiskPanel: () => null }));
vi.mock('@/components/orders/ShippingSection', () => ({ ShippingSection: () => null }));
vi.mock('@/components/orders/OrderStages', () => ({ OrderStages: () => null }));
vi.mock('@/components/orders/OrderNotes', () => ({ OrderNotes: () => null }));
vi.mock('@/components/orders/OrderStateBadge', () => ({ OrderStateBadge: () => null }));
vi.mock('@/components/orders/CustomerHistory', () => ({ CustomerHistoryModal: () => null }));
vi.mock('@/components/screens/confirmation/ActionDialogs', () => ({ ChangeRequestDialog: () => null }));
vi.mock('@/components/orders/raiseChangeRequest', () => ({ raiseChangeRequest: vi.fn() }));

import { OrderDetailModal } from './OrderDetailModal';

const ORDER = {
  id: 'o1',
  orderNumber: 'ORD-5',
  createdAt: '2026-10-15T06:00:00.000Z',
  source: 'Manual',
  status: 'NEW',
  confirmationStatus: 'NEW',
  customer: { id: 'cu1', fullName: 'زبون', phone: '079', city: 'عمّان' },
  items: [],
  addOns: [],
  totalAmount: 20,
};

/** What `GET /api/orders/[id]` answers — with or without neighbours. */
function orderAnswers(neighbours: { previousOrderId?: string | null; nextOrderId?: string | null }) {
  apiFetch.mockImplementation(async () => ({
    ok: true,
    json: async () => ({
      order: ORDER,
      currency: 'JOD',
      cod: null,
      previousOrderId: neighbours.previousOrderId ?? null,
      nextOrderId: neighbours.nextOrderId ?? null,
    }),
  }));
  apiJson.mockResolvedValue({ events: [], channels: [] });
}

const NEXT = 'الطلب التالي';
const PREV = 'الطلب السابق';

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('the previous/next row', () => {
  it('is not drawn at all when the server returned no neighbour ids', async () => {
    orderAnswers({});
    render(<OrderDetailModal orderId="o1" isOpen onClose={() => {}} onRefresh={() => {}} />);

    // Anchored on the modal's own title, so the absence below is read
    // AFTER the order has loaded and not before it.
    await waitFor(() => expect(screen.queryByText(/ORD-5/)).not.toBeNull());

    expect(screen.queryByText(NEXT), 'الزرّ مرسوم ومطفي — وهاد بالضبط اللي بدنا نوقّفه').toBeNull();
    expect(screen.queryByText(PREV)).toBeNull();
  });

  it('and is drawn when there is somewhere to go', async () => {
    orderAnswers({ previousOrderId: 'o0', nextOrderId: 'o2' });
    render(<OrderDetailModal orderId="o1" isOpen onClose={() => {}} onRefresh={() => {}} />);

    await waitFor(() => expect(screen.queryByText(NEXT)).not.toBeNull());
    expect(screen.queryByText(PREV)).not.toBeNull();
  });

  it('and one direction is enough to draw it', async () => {
    // The last order in a list has a previous and no next. The row still
    // belongs there; only the arrow with nowhere to go is disabled.
    orderAnswers({ previousOrderId: 'o0', nextOrderId: null });
    render(<OrderDetailModal orderId="o1" isOpen onClose={() => {}} onRefresh={() => {}} />);

    await waitFor(() => expect(screen.queryByText(PREV)).not.toBeNull());
  });
});
