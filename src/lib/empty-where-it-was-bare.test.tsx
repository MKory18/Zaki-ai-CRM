// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import React from 'react';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE TWO SCREENS THAT STILL SAID IT BARE, SAY IT WITH A WHY NOW.
 *
 * PreparationScreen and finance/ClosingScreen printed a bare «لا توجد…»
 * paragraph — the exact thing empty-states.test.ts exists to forbid going
 * forward, and the reason the shared EmptyState carries a `why`. The
 * mutation series for each screen: the hint shows on the EMPTY state and
 * is GONE when work arrives; and the words name the subject (no «بيانات»,
 * no «عناصر») and give the reason — what reaches this list, and what the
 * emptiness means.
 * ═══════════════════════════════════════════════════════════════════════
 */

// ── PreparationScreen: empty ⇄ non-empty ──────────────────────────────

/** The rows each screen's real endpoint returns; set per test. */
const endpoints: Record<string, unknown> = {};

vi.mock('@/context/AppContext', () => ({
  useApp: () => ({
    currentUser: { id: 'u1', name: 'س', role: 'COMPANY_ADMIN', permissions: [] },
    may: () => true,
  }),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/ops/preparation' }));
vi.mock('@/hooks/useMayOpen', () => ({ useMayOpen: () => () => true }));

vi.mock('@/lib/api-client', () => ({
  apiJson: async (url: string) => {
    // The closing screen asks by today's date, which no test should pin.
    const key = url.startsWith('/api/finance/closing') ? '/api/finance/closing' : url;
    if (!(key in endpoints)) throw new Error(`no mock for ${url}`);
    return endpoints[key];
  },
}));

import { PreparationScreen } from '@/components/screens/PreparationScreen';

// ── ClosingScreen: empty ⇄ non-empty ──────────────────────────────────

import { ClosingScreen } from '@/components/screens/finance/ClosingScreen';

beforeEach(() => {
  endpoints['/api/ops/preparation'] = {
    allowNegativeStock: false,
    totals: { products: 0, orders: 0, shortages: 0 },
    groups: [],
  };
  endpoints['/api/finance/closing'] = { rows: [] };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the preparation screen, empty', () => {
  it('names the subject and gives the reason, not a bare «لا توجد»', async () => {
    const r = render(<PreparationScreen />);
    await act(async () => undefined);
    r.rerender(<PreparationScreen />);
    expect(screen.getByText('لا طلبات مؤكدة بانتظار التجهيز')).toBeTruthy();
    expect(screen.getByText(/بعد أن يُؤكَّد في مركز التأكيد/)).toBeTruthy();
  });

  it('MUTATION: with work on the list, the hint is gone', async () => {
    endpoints['/api/ops/preparation'] = {
      allowNegativeStock: false,
      totals: { products: 1, orders: 1, shortages: 0 },
      groups: [{ productId: 'p1', productName: 'قماش', totalQty: 3, rows: [] }],
    };
    const r = render(<PreparationScreen />);
    await act(async () => undefined);
    r.rerender(<PreparationScreen />);
    expect(screen.queryByText('لا طلبات مؤكدة بانتظار التجهيز')).toBeNull();
    expect(screen.queryByText(/بعد أن يُؤكَّد/)).toBeNull();
  });
});

describe('the closing screen, empty', () => {
  it('names the subject and points at the wallet that must exist first', async () => {
    const r = render(<ClosingScreen />);
    await act(async () => undefined);
    r.rerender(<ClosingScreen />);
    expect(screen.getByText('لا محافظ نشطة')).toBeTruthy();
    expect(screen.getByText(/أنشئ المحفظة أولاً/)).toBeTruthy();
    // The first step is offered where the eye already is — a door, not a
    // sentence about where the door is.
    expect(screen.getByText('افتح المحافظات')).toBeTruthy();
  });

  it('MUTATION: with an active wallet, the hint is gone', async () => {
    endpoints['/api/finance/closing'] = {
      rows: [{ walletId: 'w1', walletName: 'محفظة المتجر' }],
    };
    const r = render(<ClosingScreen />);
    await act(async () => undefined);
    r.rerender(<ClosingScreen />);
    expect(screen.queryByText('لا محافظ نشطة')).toBeNull();
    expect(screen.queryByText(/أنشئ المحفظة أولاً/)).toBeNull();
  });
});
