// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * A BUTTON THAT REFUSES IS WORSE THAN A BUTTON THAT IS NOT THERE.
 *
 * «الطلبات» drew «تصدير CSV», «استيراد طلبات», «إدخال بالذكاء الاصطناعي»
 * and «إدخال طلب سريع» for anybody who could open the screen. Only the
 * server refused — so a confirmation agent pressed a button that was drawn
 * for her and got «Forbidden: missing required permission». A control that
 * is visible and then refuses reads as a broken system, not as a boundary.
 *
 * Printing was already gated by `ops.labels` and stays that way; the other
 * four now ask what their own doors ask.
 *
 * Read off the rendered screen, both ways, because a guard that checks for
 * the NAME of a permission in a file is satisfied by `{false && canExport
 * && …}` — this repository has been caught by that shape before.
 * ═══════════════════════════════════════════════════════════════════════
 */

const { apiFetch, currentUser } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  currentUser: { value: null as unknown },
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
vi.mock('@/components/labels/LabelSize', () => ({
  useLabelSize: () => 'thermal',
  LabelSizePicker: () => null,
}));
vi.mock('@/components/labels/openWaybills', () => ({
  openWaybills: vi.fn(),
  describeRefused: () => '',
  WaybillError: class extends Error {},
}));
// The heavy children are not what is under test, and each one drags in its
// own context. They render as nothing; the buttons that OPEN them are the
// subject.
vi.mock('@/components/orders/CreateOrderModal', () => ({ CreateOrderModal: () => null }));
vi.mock('@/components/orders/AiOrderModal', () => ({ AiOrderModal: () => null }));
vi.mock('@/components/orders/OrderDetailModal', () => ({ OrderDetailModal: () => null }));
vi.mock('@/components/orders/ImportOrdersDialog', () => ({ ImportOrdersDialog: () => null }));
vi.mock('@/components/scan/ScanButton', () => ({ ScanButton: () => null }));
vi.mock('@/components/ui/ProductPicker', () => ({ ProductPicker: () => null }));
vi.mock('@/components/ui/SavedViews', () => ({ SavedViews: () => null }));
vi.mock('@/components/orders/CustomerHistory', () => ({ CustomerHistoryButton: () => null }));

import { OrdersScreen } from './OrdersScreen';

/** A signed-in person holding exactly these permission keys. */
function signedInWith(...permissions: string[]) {
  currentUser.value = { id: 'u1', name: 'سارة', role: 'CONFIRMATION_AGENT', permissions, status: 'ACTIVE' };
}

const BUTTONS = {
  'تصدير CSV': 'reports.export',
  'استيراد طلبات': 'orders.import',
  'إدخال بالذكاء الاصطناعي': 'orders.create',
  'إدخال طلب سريع': 'orders.create',
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  apiFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ orders: [], pagination: { page: 1, pages: 1, total: 0 } }),
  });
});

afterEach(cleanup);

describe('the buttons on «الطلبات»', () => {
  it('are each absent without the permission its own door asks for', () => {
    // Holding orders.view and nothing else: she can read the list, and
    // that is all this screen offers her.
    signedInWith('orders.view');
    render(<OrdersScreen />);

    for (const label of Object.keys(BUTTONS)) {
      expect(screen.queryByText(label), `${label} معروض بلا صلاحية`).toBeNull();
    }
  });

  it('and each appears when, and only when, its own permission is held', () => {
    for (const [label, permission] of Object.entries(BUTTONS)) {
      cleanup();
      signedInWith('orders.view', permission);
      render(<OrdersScreen />);

      expect(screen.queryByText(label), `${label} مخفيّ مع إنّه معه ${permission}`).not.toBeNull();

      // And nothing else came with it.
      for (const [other, otherPermission] of Object.entries(BUTTONS)) {
        if (otherPermission === permission) continue;
        expect(screen.queryByText(other), `${other} ظهر مع ${permission}`).toBeNull();
      }
    }
  });

  it('and the owner sees all of them', () => {
    signedInWith('orders.view', 'reports.export', 'orders.create', 'orders.import');
    render(<OrdersScreen />);

    for (const label of Object.keys(BUTTONS)) {
      expect(screen.queryByText(label), `${label} مخفيّ عن المالك`).not.toBeNull();
    }
  });

  it('and a SUPER_ADMIN is never locked out of his own screen', () => {
    // `userCan` lets SUPER_ADMIN past every check, by design. If that ever
    // stopped being true the owner would lose his own buttons on deploy.
    currentUser.value = { id: 'u0', name: 'المالك', role: 'SUPER_ADMIN', permissions: [], status: 'ACTIVE' };
    render(<OrdersScreen />);

    for (const label of Object.keys(BUTTONS)) {
      expect(screen.queryByText(label), `${label} مخفيّ عن SUPER_ADMIN`).not.toBeNull();
    }
  });
});
